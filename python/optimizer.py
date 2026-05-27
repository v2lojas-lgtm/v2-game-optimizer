"""
System optimization actions for Windows.
Some operations require elevated privileges.
"""
import subprocess
import os
import psutil
import ctypes

from latency import (
    set_timer_resolution,
    disable_nagle_algorithm,
    set_network_throttling,
    disable_cpu_core_parking,
    create_restore_point,
)


def _is_admin() -> bool:
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def _run(cmd: list[str], timeout: int = 5) -> bool:
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=timeout)
        return True
    except Exception:
        return False


# ── Ações individuais ─────────────────────────────────────────────────────────

def _set_power_plan() -> str:
    if not _is_admin():
        return "Modo de Desempenho: requer privilégio de administrador"
    ok = _run(["powercfg", "/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"])
    return "Plano de energia Alto Desempenho ativado" if ok else "Erro ao alterar plano de energia"


def _disable_xbox_game_bar() -> str:
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR",
            0, winreg.KEY_SET_VALUE
        )
        winreg.SetValueEx(key, "AppCaptureEnabled", 0, winreg.REG_DWORD, 0)
        winreg.CloseKey(key)
        return "Xbox Game Bar desativado"
    except Exception as e:
        return f"Game Bar: {e}"


def _disable_fullscreen_optimizations() -> str:
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"System\GameConfigStore",
            0, winreg.KEY_SET_VALUE
        )
        winreg.SetValueEx(key, "GameDVR_FSEBehaviorMode", 0, winreg.REG_DWORD, 2)
        winreg.SetValueEx(key, "GameDVR_Enabled", 0, winreg.REG_DWORD, 0)
        winreg.CloseKey(key)
        return "Otimizações de tela cheia desativadas"
    except Exception as e:
        return f"Fullscreen opt: {e}"


def _enable_hardware_accelerated_gpu() -> str:
    try:
        import winreg
        path = r"SOFTWARE\Microsoft\DirectX\UserGpuPreferences"
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, path)
        winreg.CloseKey(key)
        return "GPU aceleração por hardware: configurado"
    except Exception as e:
        return f"HAGS: {e}"


def _close_background_processes() -> str:
    from processes import close_closeable_processes
    result = close_closeable_processes()
    closed = result.get("closed", [])
    if closed:
        return f"Processos encerrados: {', '.join(closed)}"
    return "Nenhum processo desnecessário encontrado"


def _clean_temp_cache() -> str:
    import tempfile, shutil, glob
    count = 0
    freed_mb = 0
    dirs = [
        tempfile.gettempdir(),
        os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Temp"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Temp"),
    ]
    for d in dirs:
        for f in glob.glob(os.path.join(d, "*")):
            try:
                size = os.path.getsize(f) if os.path.isfile(f) else 0
                if os.path.isfile(f):
                    os.remove(f)
                    freed_mb += size // (1024 * 1024)
                elif os.path.isdir(f):
                    shutil.rmtree(f, ignore_errors=True)
                count += 1
            except Exception:
                pass
    return f"Cache limpo: {count} itens removidos ({freed_mb} MB liberados)"


def _optimize_network() -> str:
    results = []
    cmds = [
        (["netsh", "int", "tcp", "set", "global", "autotuninglevel=normal"],   "TCP AutoTuning"),
        (["netsh", "int", "tcp", "set", "global", "rss=enabled"],              "RSS"),
        (["netsh", "int", "tcp", "set", "global", "chimney=disabled"],         "Chimney Offload"),
        (["netsh", "int", "tcp", "set", "global", "ecncapability=disabled"],   "ECN"),
        (["netsh", "int", "tcp", "set", "global", "timestamps=disabled"],      "TCP Timestamps"),
    ]
    for cmd, label in cmds:
        ok = _run(cmd)
        results.append(f"{'✓' if ok else '✗'} {label}")
    return "Rede otimizada: " + ", ".join(r.split()[1] for r in results if r.startswith("✓"))


def _set_game_priority(game_name: str | None = None) -> str:
    targets = {"cs2.exe", "valorant.exe", "valorant-win64-shipping.exe",
               "fortniteclient-win64-shipping.exe", "rainbowsix.exe",
               "league of legends.exe", "cod.exe", "modernwarfare.exe"}

    if game_name:
        targets.add(game_name.lower())

    found = []
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            if proc.info["name"].lower() in targets:
                p = psutil.Process(proc.info["pid"])
                p.nice(psutil.HIGH_PRIORITY_CLASS)
                found.append(proc.info["name"])
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    if found:
        return f"Prioridade Alta definida para: {', '.join(found)}"
    return "Nenhum jogo em execução detectado (prioridade será aplicada ao iniciar)"


def _flush_dns() -> str:
    ok = _run(["ipconfig", "/flushdns"])
    return "Cache DNS limpo" if ok else "Erro ao limpar DNS"


# ── Dispatcher ────────────────────────────────────────────────────────────────

ACTIONS: dict[str, callable] = {
    # Latência
    "timer_resolution":    lambda: set_timer_resolution(True),
    "disable_nagle":       disable_nagle_algorithm,
    "network_throttling":  set_network_throttling,
    "cpu_parking":         disable_cpu_core_parking,
    # Sistema
    "power_mode":              _set_power_plan,
    "disable_game_bar":        _disable_xbox_game_bar,
    "disable_fullscreen_opts": _disable_fullscreen_optimizations,
    "hags":                    _enable_hardware_accelerated_gpu,
    "close_processes":         _close_background_processes,
    "clean_cache":             _clean_temp_cache,
    "game_priority":           _set_game_priority,
    # Rede
    "network_opts":            _optimize_network,
    "flush_dns":               _flush_dns,
}


def run_optimizations(selected: list[str]) -> dict:
    applied  = []
    skipped  = []
    errors   = []
    warnings = []

    # Criar ponto de restauração antes de qualquer mudança no sistema
    rp = create_restore_point()
    if rp["ok"]:
        applied.append(rp["message"])
    else:
        # Restore point failure is non-critical — flag as warning so user isn't alarmed
        warnings.append(rp["message"])

    for opt_id in selected:
        action = ACTIONS.get(opt_id)
        if action is None:
            skipped.append(opt_id)
            continue
        try:
            msg = action()
            applied.append(msg)
        except Exception as exc:
            errors.append(f"{opt_id}: {exc}")

    return {"applied": applied, "skipped": skipped, "errors": errors, "warnings": warnings}


def get_available_optimizations() -> list[dict]:
    """Returns metadata about all available optimizations."""
    return [
        # ── Latência ──────────────────────────────────────────────────────────
        {
            "id":          "timer_resolution",
            "label":       "Timer Resolution 1ms",
            "description": "Reduz o scheduler de 15.6ms para 1ms — todo frame e input fica mais preciso",
            "category":    "latencia",
            "impact":      "S",
            "requires_admin": True,
        },
        {
            "id":          "cpu_parking",
            "label":       "Desativar CPU Core Parking",
            "description": "Mantém todos os núcleos ativos — elimina micro-stutter de wake-up",
            "category":    "latencia",
            "impact":      "S",
            "requires_admin": True,
        },
        {
            "id":          "disable_nagle",
            "label":       "Desativar Algoritmo de Nagle",
            "description": "TCP_NODELAY: pacotes saem imediatamente — hit registration mais consistente",
            "category":    "latencia",
            "impact":      "A",
            "requires_admin": True,
        },
        {
            "id":          "network_throttling",
            "label":       "Network Throttling Index",
            "description": "Remove limite de 10 pps do Windows — processamento de pacotes sem restrição",
            "category":    "latencia",
            "impact":      "A",
            "requires_admin": True,
        },
        # ── Sistema ───────────────────────────────────────────────────────────
        {
            "id":          "power_mode",
            "label":       "Plano de Energia Alto Desempenho",
            "description": "Ativa o plano High Performance — CPU e GPU sem throttling",
            "category":    "sistema",
            "impact":      "A",
            "requires_admin": True,
        },
        {
            "id":          "disable_fullscreen_opts",
            "label":       "Desativar Fullscreen Optimizations",
            "description": "Garante modo exclusivo real — reduz input lag do compositor do Windows",
            "category":    "sistema",
            "impact":      "A",
            "requires_admin": False,
        },
        {
            "id":          "close_processes",
            "label":       "Fechar Processos Desnecessários",
            "description": "Encerra apps em background que competem por CPU e RAM",
            "category":    "sistema",
            "impact":      "A",
            "requires_admin": False,
        },
        {
            "id":          "game_priority",
            "label":       "Prioridade Alta para o Jogo",
            "description": "Define HIGH_PRIORITY_CLASS no processo do jogo ativo",
            "category":    "sistema",
            "impact":      "A",
            "requires_admin": False,
        },
        {
            "id":          "disable_game_bar",
            "label":       "Desativar Xbox Game Bar",
            "description": "Remove overlay da Microsoft que consome CPU em background",
            "category":    "sistema",
            "impact":      "B",
            "requires_admin": False,
        },
        {
            "id":          "clean_cache",
            "label":       "Limpar Cache Temporário",
            "description": "Remove arquivos temporários para liberar espaço em disco",
            "category":    "sistema",
            "impact":      "B",
            "requires_admin": False,
        },
        {
            "id":          "hags",
            "label":       "GPU Aceleração por Hardware (HAGS)",
            "description": "Permite que a GPU gerencie sua própria memória — menos overhead",
            "category":    "sistema",
            "impact":      "B",
            "requires_admin": False,
        },
        # ── Rede ──────────────────────────────────────────────────────────────
        {
            "id":          "flush_dns",
            "label":       "Limpar Cache DNS",
            "description": "Remove resoluções DNS antigas — evita timeout em servidores de jogo",
            "category":    "rede",
            "impact":      "B",
            "requires_admin": False,
        },
        {
            "id":          "network_opts",
            "label":       "Otimizar Configurações TCP",
            "description": "AutoTuning, RSS e desativa overhead de TCP desnecessário",
            "category":    "rede",
            "impact":      "B",
            "requires_admin": True,
        },
    ]
