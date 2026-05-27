"""
Background game watcher — detecta início/fim de jogo e aplica boost automaticamente.

Features:
  1. Mata/suspende processos em segundo plano ao detectar jogo
  2. Limpa memória RAM standby antes do boost
  3. Monitora performance em tempo real e envia alertas
  4. Registra sessão e envia resumo ao fechar o jogo
"""
import threading
import time
import json
import sys
import ctypes

try:
    import psutil
    _HAS_PSUTIL = True
except ImportError:
    _HAS_PSUTIL = False

try:
    import subprocess as _sp
    _HAS_SP = True
except ImportError:
    _HAS_SP = False

try:
    from latency import apply_timer_resolution_runtime, restore_timer_resolution_runtime
    _HAS_LATENCY = True
except Exception:
    _HAS_LATENCY = False

# ── Jogos monitorados ──────────────────────────────────────────────────────────
_GAMES = {
    "cs2":      {"exe": "cs2.exe",                           "name": "Counter-Strike 2"},
    "valorant": {"exe": "valorant-win64-shipping.exe",        "name": "Valorant"},
    "fortnite": {"exe": "fortniteclient-win64-shipping.exe",  "name": "Fortnite"},
    "r6siege":  {"exe": "rainbowsix.exe",                    "name": "Rainbow Six Siege"},
    "lol":      {"exe": "league of legends.exe",              "name": "League of Legends"},
    "cod":      {"exe": "modernwarfare.exe",                  "name": "Call of Duty"},
}

# ── Processos seguros para suspender enquanto joga ─────────────────────────────
_SUSPEND_TARGETS = {
    "searchindexer.exe":        "Windows Search (indexação)",
    "searchprotocolhost.exe":   "Windows Search (protocolo)",
    "mssearch.exe":             "Windows Search",
    "onedrive.exe":             "OneDrive (sync)",
    "dropbox.exe":              "Dropbox (sync)",
    "googledrivefs.exe":        "Google Drive (sync)",
    "backupservice.exe":        "Backup Service",
    "sgrmbroker.exe":           "Windows Security (telemetria)",
    "presentationfontcache.exe":"Font Cache",
    "wuauclt.exe":              "Windows Update (agente)",
    "musnotifyicon.exe":        "Windows Update (notificação)",
    "softwareassistant.exe":    "Software Assistant",
    "adobeupdateservice.exe":   "Adobe Update",
    "nvidiacontainerls.exe":    "NVIDIA Container LS",
    "jusched.exe":              "Java Update",
}

_POWER_HIGH = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
_POWER_BAL  = "381b4222-f694-41f0-9685-ff5bb260df2e"

# ── Alertas ───────────────────────────────────────────────────────────────────
_ALERT_CPU_THRESH   = 92.0   # %
_ALERT_RAM_THRESH   = 88.0   # %
_ALERT_PING_THRESH  = 100.0  # ms
_ALERT_COOLDOWN     = 60     # segundos entre alertas do mesmo tipo

# ── Estado compartilhado ──────────────────────────────────────────────────────
_lock  = threading.Lock()
_state = {
    "boosted_game":      None,
    "auto_boost":        True,
    "started":           False,
    "suspended_pids":    {},    # {pid: "nome do processo"}
    "session_start":     None,
    "session_samples":   [],    # [{cpu, ram, ping, ts}]
    "last_alerts":       {},    # {alert_type: timestamp}
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _push(event: str, data: dict) -> None:
    try:
        print(json.dumps({"event": event, "data": data}, ensure_ascii=False), flush=True)
    except Exception:
        pass


def _running_exes() -> set:
    if not _HAS_PSUTIL:
        return set()
    try:
        return {p.info["name"].lower()
                for p in psutil.process_iter(["name"])
                if p.info.get("name")}
    except Exception:
        return set()


def _set_power(guid: str) -> bool:
    if not _HAS_SP:
        return False
    try:
        _sp.run(["powercfg", "/setactive", guid],
                capture_output=True, timeout=5)
        return True
    except Exception:
        return False


def _set_priority(exe: str, priority) -> bool:
    if not _HAS_PSUTIL:
        return False
    ok = False
    for proc in psutil.process_iter(["name", "pid"]):
        try:
            if proc.info["name"].lower() == exe.lower():
                proc.nice(priority)
                ok = True
        except Exception:
            pass
    return ok

# ── Feature 2: Limpeza de RAM ─────────────────────────────────────────────────

def _clean_ram() -> dict:
    freed_mb = 0
    methods = []

    # Método 1: limpar standby memory via NtSetSystemInformation (requer admin)
    try:
        ntdll = ctypes.windll.ntdll
        # MemoryPurgeStandbyList = 4
        cmd = ctypes.c_ulong(4)
        result = ntdll.NtSetSystemInformation(80, ctypes.byref(cmd), ctypes.sizeof(cmd))
        if result == 0:
            methods.append("Standby memory limpa")
            # Estimate freed memory
            if _HAS_PSUTIL:
                vm = psutil.virtual_memory()
                freed_mb = int(vm.cached / (1024 * 1024)) if hasattr(vm, 'cached') else 0
    except Exception:
        pass

    # Método 2: forçar GC do Python e liberar memória do processo
    try:
        import gc
        gc.collect()
    except Exception:
        pass

    # Método 3: EmptyWorkingSet de todos os processos acessíveis
    freed_count = 0
    if _HAS_PSUTIL:
        try:
            for proc in psutil.process_iter(["pid", "name"]):
                try:
                    handle = ctypes.windll.kernel32.OpenProcess(0x1F0FFF, False, proc.pid)
                    if handle:
                        ctypes.windll.psapi.EmptyWorkingSet(handle)
                        ctypes.windll.kernel32.CloseHandle(handle)
                        freed_count += 1
                except Exception:
                    pass
            if freed_count > 0:
                methods.append(f"Working set limpo ({freed_count} processos)")
        except Exception:
            pass

    return {"freed_mb": freed_mb, "methods": methods}

# ── Feature 1: Suspender processos em segundo plano ───────────────────────────

def _suspend_background_processes() -> dict:
    if not _HAS_PSUTIL:
        return {"suspended": {}}

    suspended = {}
    for proc in psutil.process_iter(["name", "pid", "status"]):
        try:
            name_lower = (proc.info["name"] or "").lower()
            if name_lower in _SUSPEND_TARGETS and proc.info["status"] == psutil.STATUS_RUNNING:
                proc.suspend()
                suspended[proc.info["pid"]] = proc.info["name"]
        except Exception:
            pass

    with _lock:
        _state["suspended_pids"].update(suspended)

    return {
        "suspended": {v: k for k, v in suspended.items()},  # name→pid
        "count": len(suspended),
    }


def _resume_background_processes() -> None:
    with _lock:
        pids = dict(_state["suspended_pids"])
        _state["suspended_pids"].clear()

    for pid, name in pids.items():
        try:
            proc = psutil.Process(pid)
            if proc.status() == psutil.STATUS_STOPPED:
                proc.resume()
        except Exception:
            pass

# ── Feature 3: Alertas de performance ────────────────────────────────────────

def _quick_ping(host: str = "8.8.8.8") -> float | None:
    if not _HAS_SP:
        return None
    try:
        import re
        out = _sp.check_output(
            ["ping", "-n", "1", "-w", "800", host],
            timeout=2, stderr=_sp.DEVNULL
        )
        text = out.decode("cp850", errors="ignore")
        for pat in [r"[Mm]éd[^\d]*(\d+)", r"Average\s*=\s*(\d+)", r"[Tt]empo[^\d]*(\d+)ms"]:
            m = re.search(pat, text)
            if m:
                return float(m.group(1))
    except Exception:
        pass
    return None


def _check_alerts(cpu: float, ram: float, ping: float | None) -> None:
    now = time.time()

    def should_alert(key: str) -> bool:
        with _lock:
            last = _state["last_alerts"].get(key, 0)
            if now - last >= _ALERT_COOLDOWN:
                _state["last_alerts"][key] = now
                return True
        return False

    if cpu >= _ALERT_CPU_THRESH and should_alert("cpu"):
        _push("perf_alert", {
            "type": "cpu",
            "message": f"CPU em {cpu:.0f}% — feche apps em segundo plano",
            "value": cpu,
            "level": "warn",
        })

    if ram >= _ALERT_RAM_THRESH and should_alert("ram"):
        _push("perf_alert", {
            "type": "ram",
            "message": f"RAM em {ram:.0f}% — memória quase cheia",
            "value": ram,
            "level": "warn",
        })

    if ping is not None and ping >= _ALERT_PING_THRESH and should_alert("ping"):
        _push("perf_alert", {
            "type": "ping",
            "message": f"Ping alto: {ping:.0f}ms — verifique sua conexão",
            "value": ping,
            "level": "warn" if ping < 150 else "danger",
        })

# ── Feature 4: Resumo da sessão ───────────────────────────────────────────────

def _record_sample(cpu: float, ram: float, ping: float | None, gpu_temp: float | None = None) -> None:
    with _lock:
        _state["session_samples"].append({
            "ts":       time.time(),
            "cpu":      cpu,
            "ram":      ram,
            "ping":     ping,
            "gpu_temp": gpu_temp,
        })


def _get_gpu_temp() -> float | None:
    """Tries to read GPU temperature using available methods."""
    try:
        import subprocess, re
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
            timeout=3, stderr=subprocess.DEVNULL
        )
        val = float(out.decode().strip().split("\n")[0])
        return val
    except Exception:
        pass

    try:
        import wmi as _wmi
        w = _wmi.WMI(namespace="root\\OpenHardwareMonitor")
        for sensor in w.Sensor():
            if sensor.SensorType == "Temperature" and "GPU" in sensor.Name:
                return float(sensor.Value)
    except Exception:
        pass

    return None


def _build_recommendations(cpu, ram, ping, gpu_temp) -> list[str]:
    recs = []

    if cpu:
        if cpu["avg"] > 82:
            recs.append(f"CPU sobrecarregada ({cpu['avg']}% média) — feche navegadores e Discord antes de jogar")
        elif cpu["max"] > 90:
            recs.append(f"CPU atingiu pico de {cpu['max']}% — feche apps em background para evitar stutter")

    if ram:
        if ram["avg"] > 88:
            recs.append(f"RAM quase cheia ({ram['avg']}% média) — feche Chrome/Discord; considere adicionar mais RAM")
        elif ram["avg"] > 75:
            recs.append(f"RAM em {ram['avg']}% — feche abas do navegador antes de jogar")

    if ping:
        if ping["avg"] > 80:
            recs.append(f"Ping alto ({ping['avg']}ms média) — use cabo Ethernet e feche downloads/streaming")
        elif ping["max"] > 100:
            recs.append(f"Picos de ping até {ping['max']}ms — evite downloads simultâneos durante o jogo")

    if gpu_temp:
        if gpu_temp["max"] > 88:
            recs.append(f"GPU muito quente ({gpu_temp['max']}°C) — limpe as entradas de ar e revise o thermal pad")
        elif gpu_temp["max"] > 80:
            recs.append(f"GPU aquecida ({gpu_temp['max']}°C) — verifique a ventilação do notebook/gabinete")

    if not recs:
        recs.append("Sessão excelente — hardware bem otimizado. Continue assim!")

    return recs


def _build_grade(cpu, ram, ping, gpu_temp) -> str:
    score = 100

    if cpu:
        if cpu["avg"] > 85:   score -= 20
        elif cpu["avg"] > 70: score -= 10
        elif cpu["max"] > 90: score -= 5

    if ram:
        if ram["avg"] > 90:   score -= 25
        elif ram["avg"] > 80: score -= 12
        elif ram["avg"] > 70: score -= 5

    if ping:
        if ping["avg"] > 100:  score -= 20
        elif ping["avg"] > 60: score -= 10
        elif ping["max"] > 80: score -= 5

    if gpu_temp:
        if gpu_temp["max"] > 90: score -= 15
        elif gpu_temp["max"] > 82: score -= 5

    score = max(0, min(100, score))

    if score >= 85: return "A"
    if score >= 70: return "B"
    if score >= 50: return "C"
    return "D"


def _build_session_summary(game_id: str) -> dict:
    with _lock:
        samples  = list(_state["session_samples"])
        start_ts = _state["session_start"] or time.time()
        _state["session_samples"].clear()
        _state["session_start"] = None

    duration_min = round((time.time() - start_ts) / 60, 1)

    def stats(vals):
        clean = [v for v in vals if v is not None]
        if not clean:
            return None
        return {
            "avg": round(sum(clean) / len(clean), 1),
            "max": round(max(clean), 1),
            "min": round(min(clean), 1),
        }

    cpu_s      = stats([s["cpu"]      for s in samples])
    ram_s      = stats([s["ram"]      for s in samples])
    ping_s     = stats([s["ping"]     for s in samples])
    gpu_temp_s = stats([s.get("gpu_temp") for s in samples])

    grade = _build_grade(cpu_s, ram_s, ping_s, gpu_temp_s)
    recs  = _build_recommendations(cpu_s, ram_s, ping_s, gpu_temp_s)

    game_name = _GAMES.get(game_id, {}).get("name", game_id)

    return {
        "game":            game_id,
        "game_name":       game_name,
        "duration_min":    duration_min,
        "cpu":             cpu_s,
        "ram":             ram_s,
        "ping":            ping_s,
        "gpu_temp":        gpu_temp_s,
        "grade":           grade,
        "recommendations": recs,
        "sample_count":    len(samples),
    }

# ── Boost / restore ───────────────────────────────────────────────────────────

def _apply_boost(game_id: str, game_name: str) -> None:
    actions = []

    # Feature 2: limpar RAM antes de tudo
    ram_result = _clean_ram()
    if ram_result["methods"]:
        actions.append(f"RAM: {', '.join(ram_result['methods'])}")

    # Feature 1: suspender processos em segundo plano
    susp = _suspend_background_processes()
    if susp["count"] > 0:
        actions.append(f"{susp['count']} processos suspensos")

    # Timer Resolution 1ms (ativo enquanto o jogo roda)
    if _HAS_LATENCY:
        try:
            apply_timer_resolution_runtime()
            actions.append("Timer Resolution 1ms ativo")
        except Exception:
            pass

    # Prioridade ALTA no jogo
    exe = _GAMES[game_id]["exe"]
    try:
        if _set_priority(exe, psutil.HIGH_PRIORITY_CLASS):
            actions.append(f"Prioridade ALTA → {exe}")
    except Exception:
        pass

    # Plano de energia Alto Desempenho
    if _set_power(_POWER_HIGH):
        actions.append("Plano → Alto Desempenho")

    # Boost Steam
    try:
        _set_priority("steam.exe", psutil.ABOVE_NORMAL_PRIORITY_CLASS)
    except Exception:
        pass

    with _lock:
        _state["boosted_game"]    = game_id
        _state["session_start"]   = time.time()
        _state["session_samples"] = []
        _state["last_alerts"]     = {}

    _push("game_start", {
        "game":    game_id,
        "name":    game_name,
        "actions": actions,
    })


def _restore_boost(game_id: str) -> None:
    # Restaurar Timer Resolution padrão
    if _HAS_LATENCY:
        try:
            restore_timer_resolution_runtime()
        except Exception:
            pass

    # Retomar processos suspensos
    _resume_background_processes()

    # Restaurar plano Balanceado
    _set_power(_POWER_BAL)

    # Restaurar prioridade normal
    if _HAS_PSUTIL and game_id:
        exe = _GAMES.get(game_id, {}).get("exe", "")
        try:
            _set_priority(exe, psutil.NORMAL_PRIORITY_CLASS)
        except Exception:
            pass

    # Feature 4: gerar resumo da sessão
    summary = _build_session_summary(game_id)

    with _lock:
        _state["boosted_game"] = None

    _push("game_stop", {"game": game_id})
    _push("session_summary", summary)

# ── Loop principal ────────────────────────────────────────────────────────────

def _loop() -> None:
    prev: set = set()
    alert_tick = 0

    while True:
        try:
            time.sleep(2)
            alert_tick += 1

            with _lock:
                auto    = _state["auto_boost"]
                boosted = _state["boosted_game"]

            current = _running_exes()

            if auto:
                # Jogo começou?
                if boosted is None:
                    for gid, info in _GAMES.items():
                        exe = info["exe"].lower()
                        if exe in current and exe not in prev:
                            _apply_boost(gid, info["name"])
                            break

                # Jogo fechou?
                if boosted is not None:
                    game_exe = _GAMES.get(boosted, {}).get("exe", "").lower()
                    if game_exe and game_exe not in current:
                        _restore_boost(boosted)

            # Feature 3: alertas e amostragem de sessão (a cada 6s = 3 ticks)
            if boosted is not None and alert_tick % 3 == 0:
                try:
                    cpu      = psutil.cpu_percent(interval=0.1) if _HAS_PSUTIL else 0
                    ram      = psutil.virtual_memory().percent  if _HAS_PSUTIL else 0
                    ping     = _quick_ping()
                    gpu_temp = _get_gpu_temp()
                    _record_sample(cpu, ram, ping, gpu_temp)
                    _check_alerts(cpu, ram, ping)
                except Exception:
                    pass

            prev = current

        except Exception:
            pass  # nunca travar o watcher

# ── API pública ───────────────────────────────────────────────────────────────

def start() -> None:
    with _lock:
        if _state["started"]:
            return
        _state["started"] = True
    t = threading.Thread(target=_loop, daemon=True, name="game-watcher")
    t.start()


def get_status() -> dict:
    with _lock:
        return {
            "boosted_game":   _state["boosted_game"],
            "auto_boost":     _state["auto_boost"],
            "suspended_count": len(_state["suspended_pids"]),
            "session_active":  _state["boosted_game"] is not None,
        }


def set_auto_boost(enabled: bool) -> dict:
    with _lock:
        _state["auto_boost"] = bool(enabled)
    return {"ok": True, "auto_boost": _state["auto_boost"]}
