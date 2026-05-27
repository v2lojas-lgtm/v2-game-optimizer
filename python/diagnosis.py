"""
V2 Game Optimizer — Diagnóstico Inteligente.

Analisa o sistema em múltiplas camadas e detecta a causa raiz
do que está deixando o jogo ruim, mesmo quando o FPS parece normal.
"""
import subprocess
import time

try:
    import psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False

try:
    import winreg
    _HAS_WINREG = True
except ImportError:
    _HAS_WINREG = False

try:
    import wmi as _wmi_mod
    _wmi = _wmi_mod.WMI()
except Exception:
    _wmi = None


# ── Detecção de temperatura ───────────────────────────────────────────────────

def _get_cpu_temp() -> float | None:
    if _wmi:
        try:
            sensors = _wmi.MSAcpi_ThermalZoneTemperature()
            if sensors:
                return round(sensors[0].CurrentTemperature / 10.0 - 273.15, 1)
        except Exception:
            pass
    if _HAS_PSUTIL:
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                for key in ("coretemp", "k10temp", "cpu_thermal"):
                    if key in temps and temps[key]:
                        return temps[key][0].current
        except Exception:
            pass
    return None


# ── Checagem de ping com jitter ───────────────────────────────────────────────

def _ping_stats(host: str = "8.8.8.8", count: int = 4) -> dict | None:
    import re
    try:
        out = subprocess.check_output(
            ["ping", f"-n", str(count), "-w", "1000", host],
            timeout=10, stderr=subprocess.DEVNULL
        )
        text = out.decode("cp850", errors="ignore")

        avg = None
        for pat in [r"[Mm]éd[^\d]*(\d+)", r"Average\s*=\s*(\d+)"]:
            m = re.search(pat, text)
            if m:
                avg = float(m.group(1)); break

        mx = None
        for pat in [r"[Mm]á[xX][^\d]*(\d+)", r"Maximum\s*=\s*(\d+)"]:
            m = re.search(pat, text)
            if m:
                mx = float(m.group(1)); break

        mn = None
        for pat in [r"[Mm]í[nN][^\d]*(\d+)", r"Minimum\s*=\s*(\d+)"]:
            m = re.search(pat, text)
            if m:
                mn = float(m.group(1)); break

        if avg is not None:
            return {"avg": avg, "max": mx, "min": mn,
                    "jitter": round((mx - avg), 1) if mx and avg else None}
    except Exception:
        pass
    return None


# ── Checks individuais ────────────────────────────────────────────────────────

def _check_thermal(issues: list, score: list) -> None:
    temp = _get_cpu_temp()
    if temp is None:
        return
    if temp >= 92:
        issues.append({
            "id": "thermal_critical", "category": "thermal", "severity": "critical",
            "title": "Throttling térmico detectado",
            "detail": f"CPU em {temp:.0f}°C — processador reduzindo a velocidade para não queimar",
            "fix": "Limpe o cooler, troque a pasta térmica, melhore a ventilação do gabinete",
            "impact": "FPS caindo progressivamente durante a sessão — pior em cenas intensas",
        })
        score[0] -= 25
    elif temp >= 82:
        issues.append({
            "id": "thermal_high", "category": "thermal", "severity": "warning",
            "title": "Temperatura da CPU elevada",
            "detail": f"CPU em {temp:.0f}°C — próximo do limite de throttling",
            "fix": "Verifique ventilação e pasta térmica do processador",
            "impact": "FPS pode cair em sessões longas, stutter em picos de carga",
        })
        score[0] -= 10


def _check_cpu(issues: list, score: list) -> None:
    if not _HAS_PSUTIL:
        return
    cpu = psutil.cpu_percent(interval=0.6)
    if cpu >= 90:
        issues.append({
            "id": "cpu_overload", "category": "cpu", "severity": "critical",
            "title": "CPU saturada",
            "detail": f"Uso em {cpu:.0f}% — processador no limite antes do jogo abrir",
            "fix": "Feche aplicativos pesados (Chrome, Photoshop, etc.) antes de jogar",
            "impact": "FPS instável, micro-stutter frequente, engasgos ao abrir menu",
        })
        score[0] -= 20
    elif cpu >= 72:
        issues.append({
            "id": "cpu_high", "category": "cpu", "severity": "warning",
            "title": "CPU com uso elevado",
            "detail": f"Uso em {cpu:.0f}% — pouca margem para picos do jogo",
            "fix": "Feche processos pesados em background antes de jogar",
            "impact": "Possível stutter em cenas de muita ação",
        })
        score[0] -= 9


def _check_ram(issues: list, score: list) -> None:
    if not _HAS_PSUTIL:
        return
    vm = psutil.virtual_memory()
    if vm.percent >= 90:
        issues.append({
            "id": "ram_critical", "category": "ram", "severity": "critical",
            "title": "RAM no limite",
            "detail": f"{vm.percent:.0f}% usado — {vm.available/1e9:.1f} GB livre de {vm.total/1e9:.1f} GB",
            "fix": "Feche aplicativos ou adicione mais memória RAM",
            "impact": "Stutter severo, carregamento lento de assets, possível travamento",
        })
        score[0] -= 20
    elif vm.percent >= 78:
        issues.append({
            "id": "ram_high", "category": "ram", "severity": "warning",
            "title": "RAM quase cheia",
            "detail": f"{vm.percent:.0f}% usado — {vm.available/1e9:.1f} GB livre",
            "fix": "Feche Chrome e Discord antes de jogar para liberar memória",
            "impact": "Engasgos ao carregar novos mapas ou assets durante a partida",
        })
        score[0] -= 8

    swap = psutil.swap_memory()
    if swap.used > 512 * 1024 * 1024:
        issues.append({
            "id": "swap_active", "category": "ram", "severity": "warning",
            "title": "Memória virtual em uso",
            "detail": f"Sistema usando {swap.used/1e9:.1f} GB de swap em disco",
            "fix": "RAM insuficiente — o jogo está usando memória lenta do SSD/HD",
            "impact": "Stutters longos (100–500ms), frame spikes, loading lento",
        })
        score[0] -= 12


def _check_network(issues: list, score: list) -> None:
    stats = _ping_stats(count=4)
    if stats is None:
        return

    avg = stats["avg"]
    mx  = stats["max"]
    jitter = stats["jitter"]

    if avg >= 120:
        issues.append({
            "id": "ping_critical", "category": "network", "severity": "critical",
            "title": "Latência de rede crítica",
            "detail": f"Ping médio {avg:.0f}ms (máx {mx:.0f}ms) — rede muito lenta para competitivo",
            "fix": "Use cabo Ethernet, feche downloads, reinicie roteador",
            "impact": "Hit registration ruim, desync, mortes por 'teleporte' de inimigos",
        })
        score[0] -= 20
    elif avg >= 55:
        issues.append({
            "id": "ping_high", "category": "network", "severity": "warning",
            "title": "Latência de rede elevada",
            "detail": f"Ping médio {avg:.0f}ms — acima do ideal para competitivo (<40ms)",
            "fix": "Prefira Ethernet ao Wi-Fi, feche streaming em background",
            "impact": "Pequeno delay no hit registration, peek advantage reduzido",
        })
        score[0] -= 8

    if jitter is not None and jitter >= 25:
        issues.append({
            "id": "jitter", "category": "network", "severity": "warning",
            "title": "Jitter de rede detectado",
            "detail": f"Variação de {jitter:.0f}ms — conexão instável (avg {avg:.0f}ms → max {mx:.0f}ms)",
            "fix": "Jitter é pior que ping alto. Use cabo Ethernet ou troque de roteador",
            "impact": "Timing inconsistente, tiros não registrando, sensação de 'atraso variável'",
        })
        score[0] -= 11


def _check_system_config(issues: list, score: list) -> None:
    # ── Plano de energia ──────────────────────────────────────────────────────
    try:
        out = subprocess.check_output(
            ["powercfg", "/getactivescheme"],
            timeout=4, stderr=subprocess.DEVNULL
        )
        text = out.decode("utf-8", errors="ignore").lower()
        if "8c5e7fda" not in text:
            issues.append({
                "id": "power_plan", "category": "system", "severity": "warning",
                "title": "Plano de energia não otimizado",
                "detail": "Windows não está no plano Alto Desempenho",
                "fix": "Ative o plano High Performance no otimizador",
                "impact": "CPU e GPU em modo econômico — menos FPS e resposta mais lenta",
            })
            score[0] -= 10
    except Exception:
        pass

    if not _HAS_WINREG:
        return

    # ── Timer Resolution ──────────────────────────────────────────────────────
    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\Session Manager\kernel"
        )
        try:
            val, _ = winreg.QueryValueEx(key, "GlobalTimerResolutionRequests")
            timer_ok = (val == 1)
        except FileNotFoundError:
            timer_ok = False
        winreg.CloseKey(key)

        if not timer_ok:
            issues.append({
                "id": "timer_resolution", "category": "system", "severity": "warning",
                "title": "Timer Resolution em 15.6ms (padrão)",
                "detail": "Scheduler do Windows com precisão de 15.6ms por tick",
                "fix": "Ative Timer Resolution 1ms no otimizador",
                "impact": "'Feeling' de jogo pesado — frames e inputs processados com menos precisão",
            })
            score[0] -= 8
    except Exception:
        pass

    # ── Core Parking ──────────────────────────────────────────────────────────
    try:
        out = subprocess.check_output(
            ["powercfg", "/query", "SCHEME_CURRENT",
             "54533251-82be-4824-96c1-47b60b740d00",
             "0cc5b647-c1df-4637-891a-dec35c318583"],
            timeout=5, stderr=subprocess.DEVNULL
        )
        text = out.decode("utf-8", errors="ignore")
        # Current AC index = 0x00000000 means 0% min cores = parking enabled
        import re
        matches = re.findall(r"Current AC Power Setting Index:\s*(0x[0-9a-fA-F]+)", text)
        parking_enabled = any(int(v, 16) < 100 for v in matches) if matches else False
        if parking_enabled:
            issues.append({
                "id": "core_parking", "category": "system", "severity": "warning",
                "title": "CPU Core Parking ativo",
                "detail": "Núcleos sendo 'dormidos' pelo Windows para economizar energia",
                "fix": "Desative Core Parking no otimizador",
                "impact": "Micro-stutter ao acordar núcleos — engasgos rápidos e frequentes",
            })
            score[0] -= 8
    except Exception:
        pass

    # ── Nagle Algorithm ───────────────────────────────────────────────────────
    try:
        base = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces"
        )
        count = winreg.QueryInfoKey(base)[0]
        nagle_active = False
        for i in range(min(count, 12)):
            try:
                guid = winreg.EnumKey(base, i)
                adapter = winreg.OpenKey(base, guid)
                # Check if adapter has IP (active adapter)
                has_ip = False
                for key_name in ("DhcpIPAddress", "IPAddress"):
                    try:
                        winreg.QueryValueEx(adapter, key_name)
                        has_ip = True
                        break
                    except FileNotFoundError:
                        pass
                if has_ip:
                    try:
                        val, _ = winreg.QueryValueEx(adapter, "TCPNoDelay")
                        if val == 0:
                            nagle_active = True
                    except FileNotFoundError:
                        nagle_active = True  # default = Nagle active
                winreg.CloseKey(adapter)
                if nagle_active:
                    break
            except Exception:
                continue
        winreg.CloseKey(base)

        if nagle_active:
            issues.append({
                "id": "nagle", "category": "network", "severity": "info",
                "title": "Algoritmo de Nagle ativo",
                "detail": "Pacotes TCP sendo agrupados antes de enviar (padrão do Windows)",
                "fix": "Desative o Nagle Algorithm no otimizador",
                "impact": "Delay artificial nos pacotes de jogo — hit registration menos consistente",
            })
            score[0] -= 5
    except Exception:
        pass

    # ── Network Throttling ────────────────────────────────────────────────────
    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile"
        )
        try:
            val, _ = winreg.QueryValueEx(key, "NetworkThrottlingIndex")
            throttling_active = (val != 0xFFFFFFFF)
        except FileNotFoundError:
            throttling_active = True  # default = throttling active
        winreg.CloseKey(key)

        if throttling_active:
            issues.append({
                "id": "network_throttling", "category": "network", "severity": "info",
                "title": "Network Throttling Index ativo",
                "detail": "Windows limitando processamento de pacotes a 10 por ms",
                "fix": "Desative Network Throttling no otimizador",
                "impact": "Throughput de rede artificialmente limitado durante gameplay",
            })
            score[0] -= 4
    except Exception:
        pass

    # ── Game Bar ──────────────────────────────────────────────────────────────
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR"
        )
        try:
            val, _ = winreg.QueryValueEx(key, "AppCaptureEnabled")
            game_bar_on = (val == 1)
        except FileNotFoundError:
            game_bar_on = True
        winreg.CloseKey(key)

        if game_bar_on:
            issues.append({
                "id": "game_bar", "category": "system", "severity": "info",
                "title": "Xbox Game Bar ativo",
                "detail": "Overlay da Microsoft rodando em background",
                "fix": "Desative no otimizador",
                "impact": "Pequeno overhead de CPU e RAM",
            })
            score[0] -= 3
    except Exception:
        pass


def _check_interference(issues: list, score: list) -> None:
    if not _HAS_PSUTIL:
        return

    RGB_PROCS = {
        "razersynapse.exe":    "Razer Synapse",
        "razernghook.exe":     "Razer (hook)",
        "lghub.exe":           "Logitech G Hub",
        "logioptionsplus.exe": "Logi Options+",
        "icue.exe":            "Corsair iCUE",
        "signalrgb.exe":       "SignalRGB",
        "openrgb.exe":         "OpenRGB",
    }
    HEAVY_PROCS = {
        "chrome.exe":       ("Google Chrome", 6),
        "firefox.exe":      ("Firefox",        5),
        "msedge.exe":       ("Edge",           4),
        "brave.exe":        ("Brave",          4),
        "code.exe":         ("VS Code",        5),
        "photoshop.exe":    ("Photoshop",      8),
        "premiere.exe":     ("Premiere Pro",   9),
        "blender.exe":      ("Blender",        9),
        "aftereffects.exe": ("After Effects",  8),
    }
    OVERLAY_PROCS = {
        "obs64.exe":             "OBS Studio",
        "obs.exe":               "OBS Studio",
        "streamlabs obs.exe":    "Streamlabs OBS",
        "rtss.exe":              "RivaTuner (RTSS)",
        "geforceexperience.exe": "GeForce Experience",
    }

    try:
        running = {p.info["name"].lower()
                   for p in psutil.process_iter(["name"]) if p.info.get("name")}
    except Exception:
        return

    # RGB software
    rgb_found = [name for exe, name in RGB_PROCS.items() if exe in running]
    if rgb_found:
        issues.append({
            "id": "rgb_software", "category": "interference", "severity": "info",
            "title": f"Software RGB: {', '.join(rgb_found)}",
            "detail": "Software de iluminação RGB com hooks ativos em background",
            "fix": "Configure para não iniciar com o Windows, ou feche antes de jogar",
            "impact": "Overhead de CPU, possível conflito com anti-cheat",
        })
        score[0] -= 4

    # Overlays
    overlay_found = [name for exe, name in OVERLAY_PROCS.items() if exe in running]
    if overlay_found:
        issues.append({
            "id": "overlay_conflict", "category": "interference", "severity": "info",
            "title": f"Overlay ativo: {', '.join(overlay_found)}",
            "detail": "Overlays de terceiros competindo com o jogo",
            "fix": "Desative overlays desnecessários se houver problemas de performance",
            "impact": "Micro-stutter, possível conflito com anti-cheat",
        })
        score[0] -= 3

    # Heavy apps
    heavy_found, penalty = [], 0
    for exe, (name, p) in HEAVY_PROCS.items():
        if exe in running:
            heavy_found.append(name)
            penalty += p
    if heavy_found:
        issues.append({
            "id": "heavy_apps", "category": "interference", "severity": "warning",
            "title": f"Apps pesados abertos: {', '.join(heavy_found)}",
            "detail": "Aplicativos consumindo RAM e CPU que poderiam ser do jogo",
            "fix": f"Feche {', '.join(heavy_found)} antes de jogar",
            "impact": "Menos FPS disponível, stutter em cenas intensas",
        })
        score[0] -= min(penalty, 14)


# ── Score e gargalo principal ─────────────────────────────────────────────────

def _primary_bottleneck(issues: list) -> dict | None:
    if not issues:
        return None
    sev_w = {"critical": 30, "warning": 10, "info": 2}
    cat_w = {"thermal": 50, "cpu": 40, "ram": 35, "network": 25, "system": 15, "interference": 5}
    return sorted(
        issues,
        key=lambda x: sev_w.get(x["severity"], 0) + cat_w.get(x["category"], 0),
        reverse=True,
    )[0]


def run_diagnosis() -> dict:
    """
    Executa diagnóstico completo e retorna score, gargalo e lista de problemas.
    Tempo esperado: 4–8s (por causa do ping multi-sample).
    """
    score = [100]
    issues: list = []

    _check_thermal(issues, score)
    _check_cpu(issues, score)
    _check_ram(issues, score)
    _check_network(issues, score)
    _check_system_config(issues, score)
    _check_interference(issues, score)

    final = max(0, min(100, score[0]))

    if final >= 86:
        grade, label, summary = "A", "Excelente", "Sistema pronto para jogo competitivo"
    elif final >= 71:
        grade, label, summary = "B", "Bom",       "Pequenos ajustes vão melhorar a consistência"
    elif final >= 51:
        grade, label, summary = "C", "Regular",   "Vários pontos afetando performance e feeling"
    else:
        grade, label, summary = "D", "Crítico",   "Problemas sérios detectados — jogo definitivamente afetado"

    result = {
        "score":       final,
        "grade":       grade,
        "grade_label": label,
        "summary":     summary,
        "bottleneck":  _primary_bottleneck(issues),
        "issues":      issues,
        "counts": {
            "critical": sum(1 for i in issues if i["severity"] == "critical"),
            "warning":  sum(1 for i in issues if i["severity"] == "warning"),
            "info":     sum(1 for i in issues if i["severity"] == "info"),
        },
    }

    # Auto-salva no histórico para consistência diária
    try:
        from database import save_diagnosis
        save_diagnosis(result)
    except Exception:
        pass

    return result


# ── Smart Optimize (Before → Fix → After) ────────────────────────────────────

# Mapeamento: ID do problema → ações do optimizer que o corrigem
ISSUE_TO_ACTIONS: dict[str, list[str]] = {
    "power_plan":       ["power_mode"],
    "timer_resolution": ["timer_resolution"],
    "core_parking":     ["cpu_parking"],
    "nagle":            ["disable_nagle"],
    "network_throttling": ["network_throttling"],
    "game_bar":         ["disable_game_bar"],
    "heavy_apps":       ["close_processes"],
    "overlay_conflict": [],   # não pode auto-corrigir
    "rgb_software":     [],   # não pode auto-corrigir
    "thermal_high":     [],   # hardware — não pode auto-corrigir
    "thermal_critical": [],
    "cpu_overload":     ["close_processes"],
    "cpu_high":         ["close_processes"],
    "ram_high":         ["close_processes", "clean_cache"],
    "ram_critical":     ["close_processes", "clean_cache"],
    "swap_active":      ["close_processes", "clean_cache"],
    "ping_high":        ["flush_dns", "disable_nagle", "network_throttling"],
    "ping_critical":    ["flush_dns", "disable_nagle", "network_throttling"],
    "jitter":           ["disable_nagle", "network_throttling"],
}


def get_recommended_fixes(issues: list) -> list[str]:
    """Retorna IDs de ações do optimizer que corrigem os problemas detectados."""
    actions: set[str] = set()
    for issue in issues:
        for action in ISSUE_TO_ACTIONS.get(issue["id"], []):
            actions.add(action)
    return list(actions)


def run_smart_optimize() -> dict:
    """
    Fluxo completo:
    1. Diagnóstico inicial (Before)
    2. Aplica correções recomendadas automaticamente
    3. Diagnóstico final (After)
    4. Retorna comparativo com ganho de score e problemas resolvidos
    """
    import time as _t
    from optimizer import run_optimizations

    # ── Fase 1: diagnóstico inicial ──────────────────────────────────────────
    before = run_diagnosis()
    actions = get_recommended_fixes(before["issues"])

    if not actions:
        return {
            "before": before,
            "after":  before,
            "score_gain":      0,
            "issues_fixed":    0,
            "fixed_issues":    [],
            "actions_applied": [],
            "actions_errors":  [],
            "message": "Nenhuma correção automática disponível para os problemas detectados",
        }

    # ── Fase 2: aplicar correções ─────────────────────────────────────────────
    opt = run_optimizations(actions)

    # Aguarda as mudanças se estabilizarem antes de re-medir
    _t.sleep(2.0)

    # ── Fase 3: diagnóstico pós-otimização ────────────────────────────────────
    after = run_diagnosis()

    # Determinar o que foi corrigido
    after_ids  = {i["id"] for i in after["issues"]}
    fixed      = [i for i in before["issues"] if i["id"] not in after_ids]

    return {
        "before":          before,
        "after":           after,
        "score_gain":      after["score"] - before["score"],
        "issues_fixed":    len(fixed),
        "fixed_issues":    fixed,
        "actions_applied": opt.get("applied", []),
        "actions_errors":  opt.get("errors",  []),
    }
