"""
License management: hardware fingerprint, key activation, validation.

Uses the V2 license server (Vercel):
  POST /api/activate   → activates key for this machine
  POST /api/validate   → checks if key is still valid for this machine
  POST /api/deactivate → releases the activation slot

Test key (local only, never hits the network): V2GO-TEST-0000-0000
"""

import hashlib
import json
import time
import os
import urllib.request
import urllib.parse
from pathlib import Path

try:
    import winreg
    _HAS_WINREG = True
except ImportError:
    _HAS_WINREG = False

_TEST_KEY     = "V2GO-TEST-0000-0000"
_GRACE_DAYS   = 3    # days allowed offline before re-validation
_SERVER       = "https://v2-license-server.vercel.app"
_LICENSE_FILE = Path(os.environ.get("APPDATA", Path.home())) / "V2GameOptimizer" / "license.json"


# ── Machine fingerprint ────────────────────────────────────────────────────────

def get_machine_id() -> str:
    """Stable per-machine ID using Windows MachineGuid (set at OS install)."""
    if _HAS_WINREG:
        try:
            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Cryptography",
                0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY
            )
            guid, _ = winreg.QueryValueEx(key, "MachineGuid")
            winreg.CloseKey(key)
            return hashlib.sha256(guid.encode()).hexdigest()[:32]
        except Exception:
            pass
    import socket
    return hashlib.sha256(socket.gethostname().encode()).hexdigest()[:32]


# ── Persistence ────────────────────────────────────────────────────────────────

def _load() -> dict:
    try:
        return json.loads(_LICENSE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save(data: dict) -> None:
    _LICENSE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _LICENSE_FILE.write_text(json.dumps(data), encoding="utf-8")


# ── License server API ─────────────────────────────────────────────────────────

def _server_request(endpoint: str, payload: dict) -> dict:
    """POST to our license server. Returns parsed JSON or raises."""
    body = json.dumps(payload).encode()
    req  = urllib.request.Request(
        f"{_SERVER}/api/{endpoint}",
        data=body,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def _server_activate(key: str, machine_id: str) -> tuple[bool, str, str | None]:
    try:
        data = _server_request("activate", {"license_key": key, "machine_id": machine_id})
        if data.get("success"):
            expires_at = data.get("expires_at")
            return True, "ok", expires_at
        return False, data.get("error", "Chave inválida"), None
    except Exception as e:
        return False, f"Erro de conexão: {e}", None


def _server_validate(key: str, machine_id: str) -> tuple[bool, str]:
    try:
        data = _server_request("validate", {"license_key": key, "machine_id": machine_id})
        if data.get("valid"):
            return True, "ok"
        return False, data.get("error", "Chave inválida ou expirada")
    except Exception as e:
        return False, f"Erro de conexão: {e}"


def _server_deactivate(key: str, machine_id: str) -> tuple[bool, str]:
    try:
        data = _server_request("deactivate", {"license_key": key, "machine_id": machine_id})
        if data.get("ok"):
            return True, "ok"
        return False, data.get("error", "Erro ao desativar")
    except Exception as e:
        return False, f"Erro de conexão: {e}"


# ── Public API ─────────────────────────────────────────────────────────────────

def check_license() -> dict:
    """
    Returns:
      {"valid": True,  "key": "...", "reason": "ok",          "expires_at": <ts>, "days_remaining": <int>}
      {"valid": False, "key": None,  "reason": "not_activated"}
      {"valid": False, "key": "...", "reason": "wrong_machine"}
      {"valid": False, "key": "...", "reason": "expired",     "expires_at": <ts>, "days_remaining": 0}
      {"valid": False, "key": "...", "reason": "grace_expired"}
    """
    data = _load()
    if not data or not data.get("key"):
        return {"valid": False, "key": None, "reason": "not_activated"}

    machine_id = get_machine_id()
    if data.get("machine_id") != machine_id:
        return {"valid": False, "key": data.get("key"), "reason": "wrong_machine"}

    key        = data["key"]
    expires_at = data.get("expires_at", 0)
    now        = time.time()

    # Convert ISO string to timestamp if needed
    if isinstance(expires_at, str):
        from datetime import datetime, timezone
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00")).timestamp()
        except Exception:
            expires_at = 0

    days_remaining = max(0, int((expires_at - now) / 86400)) if expires_at else 0

    if expires_at and now > expires_at:
        return {
            "valid": False,
            "key": key,
            "reason": "expired",
            "expires_at": int(expires_at),
            "days_remaining": 0,
        }

    # Online re-validation every _GRACE_DAYS
    last_ok    = data.get("last_validated", 0)
    days_since = (now - last_ok) / 86400

    if key != _TEST_KEY and days_since > _GRACE_DAYS:
        ok, _ = _server_validate(key, machine_id)
        if ok:
            data["last_validated"] = int(now)
            _save(data)
        else:
            return {"valid": False, "key": key, "reason": "grace_expired"}

    return {
        "valid": True,
        "key": key,
        "reason": "ok",
        "expires_at": int(expires_at) if expires_at else None,
        "days_remaining": days_remaining,
    }


def activate_key(key: str) -> dict:
    """
    Activate key on this machine.
    Returns {"ok": True, "key": "..."} or {"ok": False, "error": "..."}
    """
    key = key.strip().upper()
    if not key:
        return {"ok": False, "error": "Chave não pode estar vazia"}

    machine_id = get_machine_id()

    # Test key — local only, no network call
    if key == _TEST_KEY:
        from datetime import datetime, timezone, timedelta
        expires_at = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        _save({
            "key": key,
            "machine_id": machine_id,
            "activated_at": int(time.time()),
            "last_validated": int(time.time()),
            "expires_at": expires_at,
        })
        return {"ok": True, "key": key}

    # Real key — activate via our server
    ok, msg, expires_at = _server_activate(key, machine_id)
    if not ok:
        return {"ok": False, "error": msg}

    _save({
        "key": key,
        "machine_id": machine_id,
        "activated_at": int(time.time()),
        "last_validated": int(time.time()),
        "expires_at": expires_at,
    })
    return {"ok": True, "key": key}


def deactivate() -> dict:
    """
    Deactivate this machine: releases the activation slot on the server
    and deletes the local license file.
    """
    data = _load()
    key        = data.get("key")
    machine_id = get_machine_id()

    if key and key != _TEST_KEY:
        _server_deactivate(key, machine_id)

    try:
        if _LICENSE_FILE.exists():
            _LICENSE_FILE.unlink()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
