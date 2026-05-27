"""
App settings: Windows startup registry + history management.
"""
import sys
import os
from pathlib import Path

try:
    import winreg
    _HAS_WINREG = True
except ImportError:
    _HAS_WINREG = False

_RUN_KEY  = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
_APP_NAME = "V2GameOptimizer"


def _exe_path() -> str:
    """Return the path of the running executable (works for packaged Electron app)."""
    # When bundled by electron-builder the exe is two levels up from the sidecar
    exe = Path(sys.executable)
    # If running as a PyInstaller bundle, sys.executable IS the exe
    # If running as plain python sidecar, look for the Electron exe nearby
    candidate = exe.parent.parent / f"{_APP_NAME}.exe"
    if candidate.exists():
        return str(candidate)
    return str(exe)


def get_startup() -> dict:
    if not _HAS_WINREG:
        return {"enabled": False, "supported": False}
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, winreg.KEY_READ)
        try:
            winreg.QueryValueEx(key, _APP_NAME)
            enabled = True
        except FileNotFoundError:
            enabled = False
        winreg.CloseKey(key)
        return {"enabled": enabled, "supported": True}
    except Exception as e:
        return {"enabled": False, "supported": False, "error": str(e)}


def set_startup(enabled: bool) -> dict:
    if not _HAS_WINREG:
        return {"ok": False, "error": "winreg não disponível"}
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, winreg.KEY_SET_VALUE)
        if enabled:
            exe = _exe_path()
            winreg.SetValueEx(key, _APP_NAME, 0, winreg.REG_SZ, f'"{exe}"')
        else:
            try:
                winreg.DeleteValue(key, _APP_NAME)
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def clear_history(history_type: str) -> dict:
    """Delete all rows from benchmark_runs, integrity_runs, or optimization_runs."""
    from database import _connect
    table_map = {
        "benchmark":    "benchmark_runs",
        "integrity":    "integrity_runs",
        "optimization": "optimization_runs",
        "all":          None,
    }
    if history_type not in table_map:
        return {"ok": False, "error": f"Tipo inválido: {history_type}"}
    tables = (
        ["benchmark_runs", "integrity_runs", "optimization_runs"]
        if history_type == "all"
        else [table_map[history_type]]
    )
    with _connect() as conn:
        for t in tables:
            conn.execute(f"DELETE FROM {t}")
    return {"ok": True, "cleared": tables}


def get_app_info() -> dict:
    return {
        "version": "1.0.0",
        "python":  sys.version.split()[0],
        "platform": sys.platform,
    }
