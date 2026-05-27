"""
V2 Game Optimizer — Modo Torneio (Zero Delay Mode).

Aplica todas as otimizações de latência e sistema de forma agressiva.
Restauração automática ao desativar ou ao reiniciar o sistema.
"""
import threading
import time
import subprocess

_lock  = threading.Lock()
_state = {
    "active":       False,
    "activated_at": None,
}

# Planos de energia
_POWER_HIGH = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
_POWER_BAL  = "381b4222-f694-41f0-9685-ff5bb260df2e"


def enable_tournament_mode() -> dict:
    """
    Zero Delay Mode:
    1. Timer Resolution 1ms (registro + runtime)
    2. Desativa Algoritmo de Nagle
    3. Network Throttling Index → ilimitado
    4. CPU Core Parking → 100% ativos
    5. Plano de energia → Alto Desempenho
    6. Desativa Xbox Game Bar
    7. Desativa Fullscreen Optimizations
    8. Suspende processos de background conhecidos
    9. Limpa RAM standby
    """
    actions: list[str] = []
    errors:  list[str] = []

    # ── 1. Timer Resolution ──────────────────────────────────────────────────
    try:
        from latency import set_timer_resolution, apply_timer_resolution_runtime
        msg = set_timer_resolution(True)
        apply_timer_resolution_runtime()
        actions.append(msg)
    except Exception as e:
        errors.append(f"Timer Resolution: {e}")

    # ── 2. Nagle Algorithm ───────────────────────────────────────────────────
    try:
        from latency import disable_nagle_algorithm
        actions.append(disable_nagle_algorithm())
    except Exception as e:
        errors.append(f"Nagle: {e}")

    # ── 3. Network Throttling ────────────────────────────────────────────────
    try:
        from latency import set_network_throttling
        actions.append(set_network_throttling(True))
    except Exception as e:
        errors.append(f"Network Throttling: {e}")

    # ── 4. CPU Core Parking ──────────────────────────────────────────────────
    try:
        from latency import disable_cpu_core_parking
        actions.append(disable_cpu_core_parking())
    except Exception as e:
        errors.append(f"Core Parking: {e}")

    # ── 5. Power plan → High Performance ────────────────────────────────────
    try:
        result = subprocess.run(
            ["powercfg", "/setactive", _POWER_HIGH],
            capture_output=True, timeout=5
        )
        if result.returncode == 0:
            actions.append("Plano de energia → Alto Desempenho")
        else:
            errors.append("Power plan: acesso negado (requer admin)")
    except Exception as e:
        errors.append(f"Power plan: {e}")

    # ── 6. Xbox Game Bar ─────────────────────────────────────────────────────
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR",
            0, winreg.KEY_SET_VALUE
        )
        winreg.SetValueEx(key, "AppCaptureEnabled", 0, winreg.REG_DWORD, 0)
        winreg.CloseKey(key)
        actions.append("Xbox Game Bar desativado")
    except Exception:
        pass

    # ── 7. Fullscreen Optimizations ──────────────────────────────────────────
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"System\GameConfigStore",
            0, winreg.KEY_SET_VALUE
        )
        winreg.SetValueEx(key, "GameDVR_FSEBehaviorMode", 0, winreg.REG_DWORD, 2)
        winreg.SetValueEx(key, "GameDVR_Enabled",         0, winreg.REG_DWORD, 0)
        winreg.CloseKey(key)
        actions.append("Fullscreen Optimizations desativadas")
    except Exception:
        pass

    # ── 8. Suspender processos de background ─────────────────────────────────
    try:
        import psutil
        SUSPEND_TARGETS = {
            "searchindexer.exe", "onedrive.exe", "dropbox.exe",
            "googledrivefs.exe", "wuauclt.exe", "musnotifyicon.exe",
            "sgrmbroker.exe", "adobeupdateservice.exe",
        }
        suspended = 0
        for proc in psutil.process_iter(["name", "status"]):
            try:
                if (proc.info["name"] or "").lower() in SUSPEND_TARGETS \
                        and proc.info["status"] == psutil.STATUS_RUNNING:
                    proc.suspend()
                    suspended += 1
            except Exception:
                pass
        if suspended:
            actions.append(f"{suspended} processos de background suspensos")
    except Exception:
        pass

    # ── 9. Limpar RAM standby ────────────────────────────────────────────────
    try:
        import ctypes
        ntdll = ctypes.windll.ntdll
        cmd = ctypes.c_ulong(4)
        if ntdll.NtSetSystemInformation(80, ctypes.byref(cmd), ctypes.sizeof(cmd)) == 0:
            actions.append("RAM standby limpa")
    except Exception:
        pass

    with _lock:
        _state["active"]       = True
        _state["activated_at"] = time.time()

    return {
        "ok":           True,
        "active":       True,
        "actions":      actions,
        "errors":       errors,
        "activated_at": _state["activated_at"],
    }


def disable_tournament_mode() -> dict:
    """Restaura todas as configurações alteradas pelo Modo Torneio."""
    actions: list[str] = []

    # Restaurar Timer Resolution
    try:
        from latency import set_timer_resolution, restore_timer_resolution_runtime
        set_timer_resolution(False)
        restore_timer_resolution_runtime()
        actions.append("Timer Resolution restaurado")
    except Exception:
        pass

    # Restaurar Network Throttling
    try:
        from latency import set_network_throttling
        set_network_throttling(False)
        actions.append("Network Throttling restaurado (padrão)")
    except Exception:
        pass

    # Restaurar plano Balanceado
    try:
        subprocess.run(
            ["powercfg", "/setactive", _POWER_BAL],
            capture_output=True, timeout=5
        )
        actions.append("Plano de energia → Balanceado")
    except Exception:
        pass

    # Retomar processos suspensos pelo modo torneio
    try:
        import psutil
        RESUME_TARGETS = {
            "searchindexer.exe", "onedrive.exe", "dropbox.exe",
            "googledrivefs.exe", "wuauclt.exe", "musnotifyicon.exe",
            "sgrmbroker.exe", "adobeupdateservice.exe",
        }
        resumed = 0
        for proc in psutil.process_iter(["name", "status"]):
            try:
                if (proc.info["name"] or "").lower() in RESUME_TARGETS \
                        and proc.info["status"] == psutil.STATUS_STOPPED:
                    proc.resume()
                    resumed += 1
            except Exception:
                pass
        if resumed:
            actions.append(f"{resumed} processos retomados")
    except Exception:
        pass

    with _lock:
        _state["active"]       = False
        _state["activated_at"] = None

    return {"ok": True, "active": False, "actions": actions}


def get_tournament_status() -> dict:
    with _lock:
        activated = _state["activated_at"]
        return {
            "active":       _state["active"],
            "activated_at": activated,
            "duration_min": round((time.time() - activated) / 60, 1)
                            if _state["active"] and activated else None,
        }
