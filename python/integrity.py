"""
Competitive Integrity Score — Fase 6.
Combines PC stability, network quality, process safety and input analysis
into a 0-100 score with per-category breakdown.
"""
import psutil
import subprocess
import re
import sys

try:
    import wmi as _wmi_module
    _wmi = _wmi_module.WMI()
except Exception:
    _wmi = None

# Processos considerados suspeitos (injetores, trainers, cheat tools conhecidos)
SUSPICIOUS_NAMES = {
    "cheatengine", "cheatengine-x86_64", "processhacker", "artmoney",
    "tsearch", "gamehack", "trainer", "injector", "bypass",
    "aimbot", "wallhack", "triggerbot", "esp", "bhop",
    "logitech ghub" , "rzsynapse",  # podem ser legítimos, marcamos como atenção
    "autohotkey", "ahk",             # pode ser macro
    "xmouse", "joy2key",
}

SUSPICIOUS_DRIVERS = {
    "cheatdrv", "vmci", "vboxdrv", "hgfs",  # VM drivers (sandboxing)
}


def _check_pc_stability() -> dict:
    cpu = psutil.cpu_percent(interval=0.5)
    ram = psutil.virtual_memory()
    temps = _get_temps()

    # Score: 100 - penalidades
    score = 100
    issues = []

    if cpu > 80:
        score -= 20
        issues.append(f"CPU muito alta ({cpu:.0f}%)")
    elif cpu > 60:
        score -= 10
        issues.append(f"CPU elevada ({cpu:.0f}%)")

    if ram.percent > 90:
        score -= 20
        issues.append(f"RAM crítica ({ram.percent:.0f}%)")
    elif ram.percent > 75:
        score -= 10
        issues.append(f"RAM alta ({ram.percent:.0f}%)")

    if temps:
        max_temp = max(temps.values())
        if max_temp > 90:
            score -= 15
            issues.append(f"Temperatura crítica ({max_temp:.0f}°C)")
        elif max_temp > 75:
            score -= 5
            issues.append(f"Temperatura alta ({max_temp:.0f}°C)")

    return {
        "score":   max(0, score),
        "cpu_pct": round(cpu, 1),
        "ram_pct": round(ram.percent, 1),
        "temp":    max(temps.values()) if temps else None,
        "issues":  issues,
    }


def _get_temps() -> dict[str, float]:
    try:
        sensors = psutil.sensors_temperatures()
        result = {}
        for key, entries in (sensors or {}).items():
            for e in entries:
                result[f"{key}/{e.label or 'core'}"] = e.current
        return result
    except Exception:
        return {}


def _check_network() -> dict:
    rtts = _ping_samples("8.8.8.8", count=6)
    if not rtts:
        return {"score": 0, "ping_ms": None, "jitter_ms": None, "loss_pct": 100.0, "issues": ["Sem conectividade"]}

    import statistics
    avg   = statistics.mean(rtts)
    jitter = statistics.stdev(rtts) if len(rtts) > 1 else 0.0
    loss  = ((6 - len(rtts)) / 6) * 100

    score = 100
    issues = []

    if avg > 100:
        score -= 30; issues.append(f"Ping alto ({avg:.0f}ms)")
    elif avg > 50:
        score -= 15; issues.append(f"Ping moderado ({avg:.0f}ms)")

    if jitter > 15:
        score -= 20; issues.append(f"Jitter alto ({jitter:.1f}ms)")
    elif jitter > 8:
        score -= 10; issues.append(f"Jitter moderado ({jitter:.1f}ms)")

    if loss > 5:
        score -= 25; issues.append(f"Perda de pacotes ({loss:.0f}%)")
    elif loss > 0:
        score -= 10; issues.append(f"Pequena perda ({loss:.0f}%)")

    return {
        "score":    max(0, score),
        "ping_ms":  round(avg, 1),
        "jitter_ms": round(jitter, 1),
        "loss_pct": round(loss, 1),
        "issues":   issues,
    }


def _ping_samples(host: str, count: int) -> list[float]:
    try:
        out = subprocess.check_output(
            ["ping", "-n", str(count), "-w", "2000", host],
            timeout=15, stderr=subprocess.DEVNULL
        )
        text = out.decode("cp850", errors="ignore")
        times = re.findall(r"(?:tempo|time)[<=]\s*(\d+)\s*ms", text, re.IGNORECASE)
        return [float(t) for t in times]
    except Exception:
        return []


def _check_suspicious_software() -> dict:
    found = []
    attention = []

    running_names = set()
    for proc in psutil.process_iter(["name"]):
        try:
            name = (proc.info["name"] or "").lower().replace(".exe", "")
            running_names.add(name)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    for name in running_names:
        for sus in SUSPICIOUS_NAMES:
            if sus in name:
                if sus in {"autohotkey", "ahk", "xmouse", "joy2key", "logitech ghub", "rzsynapse"}:
                    attention.append(name)
                else:
                    found.append(name)

    score = 100
    issues = []

    if found:
        score = max(0, score - 50 * len(found))
        issues.append(f"Software suspeito detectado: {', '.join(found)}")

    if attention:
        score = max(0, score - 10 * len(attention))
        issues.append(f"Software de atenção: {', '.join(attention)}")

    return {
        "score":      max(0, score),
        "suspicious": found,
        "attention":  attention,
        "issues":     issues,
    }


def _safe_str(s: str) -> str:
    """Encode to ASCII-safe string, replacing unknown chars."""
    return s.encode("utf-8", errors="replace").decode("utf-8", errors="replace")


def _check_input_integrity() -> dict:
    """
    Basic input device check.
    Full behavior analysis (movement patterns, reaction time) requires game hooks — Fase 7.
    """
    issues = []
    score = 100

    # Check for virtual HID devices (common in macro setups)
    virtual_devices = []
    if _wmi:
        try:
            devices = _wmi.Win32_PointingDevice()
            for dev in devices:
                raw_name = dev.Name or ""
                name = _safe_str(raw_name).lower()
                if any(k in name for k in ("virtual", "vmware", "vbox", "remote")):
                    virtual_devices.append(_safe_str(raw_name))
        except Exception:
            pass

    if virtual_devices:
        score -= 30
        issues.append(f"Dispositivos HID virtuais: {', '.join(virtual_devices)}")

    return {
        "score":           max(0, score),
        "virtual_devices": virtual_devices,
        "issues":          issues,
        "note":            "Análise completa de comportamento disponível na Fase 7 (IA)",
    }


def get_integrity_score() -> dict:
    pc      = _check_pc_stability()
    network = _check_network()
    software = _check_suspicious_software()
    inputs  = _check_input_integrity()

    # Weighted overall: software tem maior peso (integridade competitiva)
    overall = int(
        pc["score"]       * 0.25 +
        network["score"]  * 0.25 +
        software["score"] * 0.35 +
        inputs["score"]   * 0.15
    )

    all_issues = (
        [f"[PC] {i}" for i in pc["issues"]] +
        [f"[Rede] {i}" for i in network["issues"]] +
        [f"[Software] {i}" for i in software["issues"]] +
        [f"[Input] {i}" for i in inputs["issues"]]
    )

    return {
        "overall":  overall,
        "rating":   "EXCELENTE" if overall >= 90 else "BOM" if overall >= 70 else "ATENÇÃO" if overall >= 50 else "SUSPEITO",
        "pc":       pc,
        "network":  network,
        "software": software,
        "inputs":   inputs,
        "issues":   all_issues,
    }
