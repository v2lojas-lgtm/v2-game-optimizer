"""
License management: hardware fingerprint, key activation, validation, trial.

Uses the V2 license server (Vercel):
  POST /api/activate   → activates key for this machine
  POST /api/validate   → checks if key is still valid for this machine
  POST /api/deactivate → releases the activation slot

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

_TEST_KEY     = "V2GO-TEST-0000-0000"
_TEST_EMAIL   = "test@v2go.dev"   # local-only, never hits the network
_TEST_CODE    = "000000"
_GRACE_DAYS   = 3    # days allowed offline before re-validation
_TRIAL_DAYS   = 30   # free trial period on first launch
_SERVER       = "https://v2-license-server-xi.vercel.app"
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

class _ServerRejectedError(Exception):
    """Server responded with 4xx — explicit rejection (invalid key, wrong machine, etc.)."""

def _server_request(endpoint: str, payload: dict) -> dict:
    """POST to our license server. Returns parsed JSON or raises.
    Raises _ServerRejectedError for 4xx (explicit rejection).
    Raises other exceptions for 5xx / network errors (server unavailable).
    """
    body = json.dumps(payload).encode()
    req  = urllib.request.Request(
        f"{_SERVER}/api/{endpoint}",
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
            raise _ServerRejectedError(body_json.get("error", "Chave inválida")) from e
        raise


def _server_activate(key: str, machine_id: str) -> tuple[bool, str, str | None]:
    try:
        data = _server_request("activate", {"license_key": key, "machine_id": machine_id})
        if data.get("success"):
            expires_at = data.get("expires_at")
            return True, "ok", expires_at
        return False, data.get("error", "Chave inválida"), None
    except Exception as e:
        return False, f"Erro de conexão: {e}", None


def _server_validate(key: str, machine_id: str) -> tuple[bool, str, bool]:
    """Returns (is_valid, message, is_server_error).
    is_server_error=True means the server was unreachable or crashed (5xx/timeout) —
    callers should not block the user in this case.
    is_server_error=False with ok=False means explicit rejection (wrong machine, expired, etc.).
    """
    try:
        data = _server_request("validate", {"license_key": key, "machine_id": machine_id})
        if data.get("valid"):
            return True, "ok", False
        return False, data.get("error", "Chave inválida ou expirada"), False
    except _ServerRejectedError as e:
        return False, str(e), False
    except Exception as e:
        return False, f"Erro de conexão: {e}", True


def _server_deactivate(key: str, machine_id: str) -> tuple[bool, str]:
    try:
        data = _server_request("deactivate", {"license_key": key, "machine_id": machine_id})
        if data.get("ok"):
            return True, "ok"
        return False, data.get("error", "Erro ao desativar")
    except Exception as e:
        return False, f"Erro de conexão: {e}"


# ── E-mail-based activation (no key) ────────────────────────────────────────

def _server_request_code(email: str) -> tuple[bool, str]:
    try:
        data = _server_request("request-code", {"email": email})
        if data.get("ok"):
            return True, "ok"
        return False, data.get("error", "Erro ao enviar código")
    except _ServerRejectedError as e:
        return False, str(e)
    except Exception as e:
        return False, f"Erro de conexão: {e}"


def _server_verify_code(email: str, code: str, machine_id: str) -> tuple[bool, str, str | None]:
    try:
        data = _server_request("verify-code", {"email": email, "code": code, "machine_id": machine_id})
        if data.get("success"):
            return True, "ok", data.get("expires_at")
        return False, data.get("error", "Código inválido"), None
    except _ServerRejectedError as e:
        return False, str(e), None
    except Exception as e:
        return False, f"Erro de conexão: {e}", None


def _server_validate_email(email: str, machine_id: str) -> tuple[bool, str, bool]:
    """Same contract as _server_validate, but keyed by email instead of license key."""
    try:
        data = _server_request("validate-email", {"email": email, "machine_id": machine_id})
        if data.get("valid"):
            return True, "ok", False
        return False, data.get("error", "E-mail inválido ou expirado"), False
    except _ServerRejectedError as e:
        return False, str(e), False
    except Exception as e:
        return False, f"Erro de conexão: {e}", True


def _server_deactivate_email(email: str, machine_id: str) -> tuple[bool, str]:
    try:
        data = _server_request("deactivate-email", {"email": email, "machine_id": machine_id})
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
      {"valid": False, "key": None,    "reason": "trial_expired"}                       ← trial ended, no key
      {"valid": True,  "key": "...",   "reason": "ok",       "expires_at": <ts>, "days_remaining": <int>}
      {"valid": False, "key": None,    "reason": "not_activated"}
      {"valid": False, "key": "...",   "reason": "wrong_machine"}
      {"valid": False, "key": "...",   "reason": "expired",  "expires_at": <ts>, "days_remaining": 0}
      {"valid": False, "key": "...",   "reason": "grace_expired"}
    """
    data = _load()

    # First launch ever: start the free trial
    if not data:
        _start_trial()
        data = _load()

    # Trial mode (no license key/email yet)
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
                ok, _, is_server_error = _server_validate_email(identifier, machine_id)
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


def request_code(email: str) -> dict:
    """
    Sends a 6-digit activation code to the given email, if it has an active license.
    Returns {"ok": True} or {"ok": False, "error": "..."}
    """
    email = (email or "").strip().lower()
    if not email:
        return {"ok": False, "error": "E-mail não pode estar vazio"}

    if email == _TEST_EMAIL:
        return {"ok": True}

    ok, msg = _server_request_code(email)
    if not ok:
        return {"ok": False, "error": msg}
    return {"ok": True}


def verify_code(email: str, code: str) -> dict:
    """
    Verifies the code and activates this machine for the given email.
    Returns {"ok": True, "email": "..."} or {"ok": False, "error": "..."}
    """
    email = (email or "").strip().lower()
    code  = (code or "").strip()
    if not email or not code:
        return {"ok": False, "error": "E-mail e código são obrigatórios"}

    machine_id = get_machine_id()

    if email == _TEST_EMAIL:
        if code != _TEST_CODE:
            return {"ok": False, "error": "Código inválido"}
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

    ok, msg, expires_at = _server_verify_code(email, code, machine_id)
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
        _server_deactivate_email(email, machine_id)

    try:
        if _LICENSE_FILE.exists():
            _LICENSE_FILE.unlink()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
