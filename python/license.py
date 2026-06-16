"""
License management: hardware fingerprint, key activation, validation, trial.

Two ways to unlock the app:
  1. Login (current): e-mail + password, same account as the mk20-loja store.
     POST {LOJA}/api/v2go/login         → logs in + registers this machine
     POST {LOJA}/api/v2go/check-status  → periodic re-validation (no password)
     POST {LOJA}/api/v2go/logout        → releases this machine's slot
  2. Legacy license key (kept as a fallback for older purchases):
     POST {LICENSE_SERVER}/api/activate / validate / deactivate

Test account (local only, never hits the network): test@v2go.dev / test1234
Test key (local only, never hits the network): V2GO-TEST-0000-0000

Trial logic:
  - On first launch with no license file, a 30-day free trial starts automatically.
  - During trial: check_license returns {"valid": True, "trial": True, "days_remaining": N}
  - After trial expires: returns {"valid": False, "reason": "trial_expired"}
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

_TEST_KEY      = "V2GO-TEST-0000-0000"
_TEST_EMAIL    = "test@v2go.dev"   # local-only, never hits the network
_TEST_PASSWORD = "test1234"
_GRACE_DAYS    = 3    # days allowed offline before re-validation
_TRIAL_DAYS    = 30   # free trial period on first launch
_LICENSE_SERVER = "https://v2-license-server-xi.vercel.app"   # legacy key flow only
_LOJA_SERVER    = "https://mk20creative.com/loja"               # login flow (current)
_LICENSE_FILE   = Path(os.environ.get("APPDATA", Path.home())) / "V2GameOptimizer" / "license.json"


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


class _ServerRejectedError(Exception):
    """Server responded with 4xx — explicit rejection (invalid key/credentials, etc.)."""


def _post_json(base: str, path: str, payload: dict) -> dict:
    """POST to `base + path`. Returns parsed JSON or raises.
    Raises _ServerRejectedError for 4xx (explicit rejection).
    Raises other exceptions for 5xx / network errors (server unavailable).
    """
    body = json.dumps(payload).encode()
    req  = urllib.request.Request(
        f"{base}{path}",
        data=body,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if 400 <= e.code < 500:
            try:
                body_json = json.loads(e.read())
            except Exception:
                body_json = {}
            raise _ServerRejectedError(body_json.get("error", "Erro de autenticação")) from e
        raise


# ── Legacy license-key flow (v2-license-server) — kept as a fallback ──────────

def _server_activate(key: str, machine_id: str) -> tuple[bool, str, str | None]:
    try:
        data = _post_json(_LICENSE_SERVER, "/api/activate", {"license_key": key, "machine_id": machine_id})
        if data.get("success"):
            return True, "ok", data.get("expires_at")
        return False, data.get("error", "Chave inválida"), None
    except Exception as e:
        return False, f"Erro de conexão: {e}", None


def _server_validate(key: str, machine_id: str) -> tuple[bool, str, bool]:
    """Returns (is_valid, message, is_server_error).
    is_server_error=True means the server was unreachable or crashed (5xx/timeout) —
    callers should not block the user in this case.
    """
    try:
        data = _post_json(_LICENSE_SERVER, "/api/validate", {"license_key": key, "machine_id": machine_id})
        if data.get("valid"):
            return True, "ok", False
        return False, data.get("error", "Chave inválida ou expirada"), False
    except _ServerRejectedError as e:
        return False, str(e), False
    except Exception as e:
        return False, f"Erro de conexão: {e}", True


def _server_deactivate(key: str, machine_id: str) -> tuple[bool, str]:
    try:
        data = _post_json(_LICENSE_SERVER, "/api/deactivate", {"license_key": key, "machine_id": machine_id})
        if data.get("ok"):
            return True, "ok"
        return False, data.get("error", "Erro ao desativar")
    except Exception as e:
        return False, f"Erro de conexão: {e}"


# ── Login flow (mk20-loja) — current ────────────────────────────────────────────

def _loja_login(email: str, password: str, machine_id: str) -> tuple[bool, str, str | None]:
    try:
        data = _post_json(_LOJA_SERVER, "/api/v2go/login", {
            "email": email, "password": password, "machineId": machine_id,
        })
        if data.get("ok"):
            return True, "ok", data.get("expiresAt")
        return False, data.get("error", "E-mail ou senha incorretos"), None
    except _ServerRejectedError as e:
        return False, str(e), None
    except Exception as e:
        return False, f"Erro de conexão: {e}", None


def _loja_check_status(email: str, machine_id: str) -> tuple[bool, str, bool]:
    """Returns (is_valid, message, is_server_error) — same contract as _server_validate."""
    try:
        data = _post_json(_LOJA_SERVER, "/api/v2go/check-status", {"email": email, "machineId": machine_id})
        if data.get("valid"):
            return True, "ok", False
        return False, data.get("error", "Assinatura inativa"), False
    except _ServerRejectedError as e:
        return False, str(e), False
    except Exception as e:
        return False, f"Erro de conexão: {e}", True


def _loja_logout(email: str, machine_id: str) -> tuple[bool, str]:
    try:
        data = _post_json(_LOJA_SERVER, "/api/v2go/logout", {"email": email, "machineId": machine_id})
        if data.get("ok"):
            return True, "ok"
        return False, data.get("error", "Erro ao desativar")
    except Exception as e:
        return False, f"Erro de conexão: {e}"


# ── Public API ─────────────────────────────────────────────────────────────────

def _start_trial() -> None:
    """Create a trial record on first launch."""
    now = time.time()
    trial_ends_at = now + _TRIAL_DAYS * 86400
    _save({
        "trial": True,
        "trial_started_at": int(now),
        "trial_ends_at":    int(trial_ends_at),
        "machine_id":       get_machine_id(),
    })


def check_license() -> dict:
    """
    Returns:
      {"valid": True,  "trial": True,  "reason": "trial",   "days_remaining": <int>}  ← free trial active
      {"valid": False, "reason": "trial_expired"}                                       ← trial ended, no login
      {"valid": True,  "email"/"key": "...", "reason": "ok", "expires_at": <ts>, "days_remaining": <int>}
      {"valid": False, "reason": "not_activated"}
      {"valid": False, "reason": "wrong_machine"}
      {"valid": False, "reason": "expired",  "expires_at": <ts>, "days_remaining": 0}
      {"valid": False, "reason": "grace_expired"}
    """
    data = _load()

    # First launch ever: start the free trial
    if not data:
        _start_trial()
        data = _load()

    # Trial mode (no login/key yet)
    if data.get("trial") and not data.get("key") and not data.get("email"):
        now       = time.time()
        trial_end = float(data.get("trial_ends_at", 0))
        remaining = max(0, int((trial_end - now) / 86400))
        if now > trial_end:
            return {"valid": False, "key": None, "reason": "trial_expired"}
        return {"valid": True, "trial": True, "reason": "trial", "days_remaining": remaining}

    is_email_based = bool(data.get("email")) and not data.get("key")

    if not data.get("key") and not data.get("email"):
        return {"valid": False, "key": None, "reason": "not_activated"}

    machine_id = get_machine_id()
    if data.get("machine_id") != machine_id:
        return {"valid": False, "key": data.get("key"), "email": data.get("email"), "reason": "wrong_machine"}

    identifier = data.get("email") if is_email_based else data["key"]
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
            "key": data.get("key"),
            "email": data.get("email"),
            "reason": "expired",
            "expires_at": int(expires_at),
            "days_remaining": 0,
        }

    # Online re-validation every _GRACE_DAYS
    last_ok    = data.get("last_validated", 0)
    days_since = (now - last_ok) / 86400

    if days_since > _GRACE_DAYS:
        if is_email_based:
            if identifier != _TEST_EMAIL:
                ok, _, is_server_error = _loja_check_status(identifier, machine_id)
                if ok:
                    data["last_validated"] = int(now)
                    _save(data)
                elif not is_server_error:
                    return {"valid": False, "email": identifier, "reason": "grace_expired"}
        else:
            if identifier != _TEST_KEY:
                ok, _, is_server_error = _server_validate(identifier, machine_id)
                if ok:
                    data["last_validated"] = int(now)
                    _save(data)
                elif not is_server_error:
                    return {"valid": False, "key": identifier, "reason": "grace_expired"}

    return {
        "valid": True,
        "key": data.get("key"),
        "email": data.get("email"),
        "reason": "ok",
        "expires_at": int(expires_at) if expires_at else None,
        "days_remaining": days_remaining,
    }


def login(email: str, password: str) -> dict:
    """
    Logs in with the same e-mail+password as the customer's mk20-loja account
    and registers this machine. Returns {"ok": True, "email": "..."} or
    {"ok": False, "error": "..."}.
    """
    email    = (email or "").strip().lower()
    password = password or ""
    if not email or not password:
        return {"ok": False, "error": "E-mail e senha são obrigatórios"}

    machine_id = get_machine_id()

    if email == _TEST_EMAIL:
        if password != _TEST_PASSWORD:
            return {"ok": False, "error": "E-mail ou senha incorretos"}
        from datetime import datetime, timezone, timedelta
        expires_at = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        _save({
            "email": email,
            "machine_id": machine_id,
            "activated_at": int(time.time()),
            "last_validated": int(time.time()),
            "expires_at": expires_at,
        })
        return {"ok": True, "email": email}

    ok, msg, expires_at = _loja_login(email, password, machine_id)
    if not ok:
        return {"ok": False, "error": msg}

    _save({
        "email": email,
        "machine_id": machine_id,
        "activated_at": int(time.time()),
        "last_validated": int(time.time()),
        "expires_at": expires_at,
    })
    return {"ok": True, "email": email}


def activate_key(key: str) -> dict:
    """
    Activate a legacy license key on this machine (fallback for older purchases).
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

    # Real key — activate via the legacy license server
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
    email      = data.get("email")
    machine_id = get_machine_id()

    if key and key != _TEST_KEY:
        _server_deactivate(key, machine_id)
    elif email and email != _TEST_EMAIL:
        _loja_logout(email, machine_id)

    try:
        if _LICENSE_FILE.exists():
            _LICENSE_FILE.unlink()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
