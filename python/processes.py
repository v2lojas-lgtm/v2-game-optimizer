"""
Background process analysis.
Lists running processes sorted by CPU/RAM usage and flags suspicious ones.
"""
import psutil

# ── Apps conhecidos que interferem no jogo ────────────────────────────────────
# key: nome do .exe em lowercase
# category: browser | communication | streaming | media | cloud | updater | system
INTERFERENCE_APPS: dict[str, dict] = {
    # Navegadores
    "chrome.exe":             {"name": "Google Chrome",         "category": "browser",       "reason": "Consome muita RAM e CPU em background"},
    "firefox.exe":            {"name": "Firefox",               "category": "browser",       "reason": "Navegador pesado — feche antes de jogar"},
    "msedge.exe":             {"name": "Microsoft Edge",        "category": "browser",       "reason": "Consome RAM e CPU mesmo minimizado"},
    "opera.exe":              {"name": "Opera",                 "category": "browser",       "reason": "Navegador consome RAM em background"},
    "brave.exe":              {"name": "Brave Browser",         "category": "browser",       "reason": "Navegador consome RAM em background"},
    "vivaldi.exe":            {"name": "Vivaldi",               "category": "browser",       "reason": "Navegador consome RAM em background"},
    "iexplore.exe":           {"name": "Internet Explorer",     "category": "browser",       "reason": "Navegador legado consumindo recursos"},
    # Comunicação
    "discord.exe":            {"name": "Discord",               "category": "communication", "reason": "Hardware acceleration + overlay consomem GPU/RAM"},
    "slack.exe":              {"name": "Slack",                 "category": "communication", "reason": "App Electron consome 200–400 MB de RAM"},
    "teams.exe":              {"name": "Microsoft Teams",       "category": "communication", "reason": "Consome até 500 MB de RAM em idle"},
    "zoom.exe":               {"name": "Zoom",                  "category": "communication", "reason": "Consome CPU mesmo sem chamada ativa"},
    "skype.exe":              {"name": "Skype",                 "category": "communication", "reason": "Consome RAM e CPU em background"},
    "telegram.exe":           {"name": "Telegram",              "category": "communication", "reason": "App Electron em background"},
    "whatsapp.exe":           {"name": "WhatsApp",              "category": "communication", "reason": "App Electron em background"},
    "signal.exe":             {"name": "Signal",                "category": "communication", "reason": "App em background"},
    # Streaming / Gravação
    "obs64.exe":              {"name": "OBS Studio",            "category": "streaming",     "reason": "Captura de vídeo consome GPU e CPU significativamente"},
    "obs32.exe":              {"name": "OBS Studio (32-bit)",   "category": "streaming",     "reason": "Captura de vídeo consome GPU e CPU"},
    "streamlabs.exe":         {"name": "Streamlabs",            "category": "streaming",     "reason": "Preview de stream consome GPU"},
    "xsplit.exe":             {"name": "XSplit",                "category": "streaming",     "reason": "Software de stream consome GPU"},
    # Mídia
    "spotify.exe":            {"name": "Spotify",               "category": "media",         "reason": "Hardware acceleration bloqueia GPU e consome RAM"},
    "vlc.exe":                {"name": "VLC Media Player",      "category": "media",         "reason": "Decodificação de hardware em background"},
    "itunes.exe":             {"name": "iTunes",                "category": "media",         "reason": "Consome RAM e CPU em background"},
    "musicbee.exe":           {"name": "MusicBee",              "category": "media",         "reason": "Player de mídia em background"},
    # Cloud Sync
    "onedrive.exe":           {"name": "OneDrive",              "category": "cloud",         "reason": "Sincronização em background consome I/O e CPU"},
    "dropbox.exe":            {"name": "Dropbox",               "category": "cloud",         "reason": "Sincronização em background consome I/O"},
    "googledrivesync.exe":    {"name": "Google Drive",          "category": "cloud",         "reason": "Sincronização em background consome I/O"},
    "box.exe":                {"name": "Box",                   "category": "cloud",         "reason": "Sincronização em background"},
    "googledrivefs.exe":      {"name": "Google Drive FS",       "category": "cloud",         "reason": "Sincronização em background consome I/O"},
    # Atualizadores
    "googleupdate.exe":       {"name": "Google Update",         "category": "updater",       "reason": "Verificações automáticas de atualização"},
    "adobeupdateservice.exe": {"name": "Adobe Update",          "category": "updater",       "reason": "Verificação de atualizações Adobe"},
    "adobearmservice.exe":    {"name": "Adobe ARM",             "category": "updater",       "reason": "Serviço de atualizações Adobe"},
    "ccleaner64.exe":         {"name": "CCleaner",              "category": "updater",       "reason": "Scans automáticos consomem CPU"},
    "jusched.exe":            {"name": "Java Update",           "category": "updater",       "reason": "Verificação de atualização Java"},
    # Sistema pesado
    "searchindexer.exe":      {"name": "Windows Search Indexer","category": "system",        "reason": "Indexação de disco consome I/O durante o jogo"},
    "msmpengs.exe":           {"name": "Windows Defender Scan", "category": "system",        "reason": "Scan em background consome CPU"},
    "wuauclt.exe":            {"name": "Windows Update Client", "category": "system",        "reason": "Downloads de atualização em background"},
}

# Processos do sistema que nunca devem ser tocados
SYSTEM_SAFE = {
    "System", "Registry", "smss.exe", "csrss.exe", "wininit.exe",
    "winlogon.exe", "services.exe", "lsass.exe", "svchost.exe",
    "dwm.exe", "explorer.exe", "RuntimeBroker.exe", "spoolsv.exe",
    "audiodg.exe", "fontdrvhost.exe", "sihost.exe", "taskhostw.exe",
    "ctfmon.exe", "conhost.exe", "dllhost.exe", "WUDFHost.exe",
    "System Idle Process", "Idle",
}

# Conjunto simples de nomes (lowercase) para verificação rápida
_INTERFERENCE_LOWER = {k.lower() for k in INTERFERENCE_APPS}
_CLOSEABLE_LEGACY   = {
    "OneDrive.exe", "Teams.exe", "Slack.exe", "Discord.exe",
    "Spotify.exe", "SearchIndexer.exe", "MsMpEng.exe",
    "SgrmBroker.exe", "AdobeUpdateService.exe", "AdobeARMservice.exe",
    "CCleaner64.exe", "CCUpdate.exe", "GoogleCrashHandler.exe",
    "GoogleCrashHandler64.exe", "DropboxUpdate.exe", "OneDriveUpdater.exe",
    "WinStore.App.exe", "YourPhone.exe", "PhoneExperienceHost.exe",
    "Cortana.exe", "SearchUI.exe",
}
_CLOSEABLE = _CLOSEABLE_LEGACY | {k for k in INTERFERENCE_APPS}


def get_process_list(limit: int = 30) -> dict:
    """
    Returns top processes sorted by CPU usage, with memory info and close-ability flag.
    """
    procs = []
    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "status", "username"]):
        try:
            info = proc.info
            if info["status"] == "zombie":
                continue
            name_lower = (info["name"] or "").lower()
            interference_info = INTERFERENCE_APPS.get(name_lower)
            procs.append({
                "pid":        info["pid"],
                "name":       info["name"] or "Unknown",
                "cpu":        info["cpu_percent"] or 0.0,
                "ram_mb":     (info["memory_info"].rss // (1024 * 1024)) if info["memory_info"] else 0,
                "status":     info["status"],
                "username":   (info["username"] or "").split("\\")[-1],
                "closeable":  name_lower in _INTERFERENCE_LOWER,
                "system":     info["name"] in SYSTEM_SAFE,
                "interference": interference_info,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    procs.sort(key=lambda p: (p["cpu"], p["ram_mb"]), reverse=True)

    total_ram = psutil.virtual_memory().total / (1024 * 1024)
    closeable_ram = sum(p["ram_mb"] for p in procs if p["closeable"])

    return {
        "processes":          procs[:limit],
        "total_count":        len(procs),
        "closeable_count":    sum(1 for p in procs if p["closeable"]),
        "closeable_ram_mb":   closeable_ram,
        "closeable_ram_pct":  round((closeable_ram / total_ram) * 100, 1) if total_ram else 0,
    }


def get_interference_processes() -> dict:
    """
    Returns only processes that are actively interfering with game performance,
    with detailed info, category, and reason — ready for the UI to display.
    """
    running: list[dict] = []

    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "status", "username"]):
        try:
            info = proc.info
            if info["status"] == "zombie":
                continue
            name_lower = (info["name"] or "").lower()
            meta = INTERFERENCE_APPS.get(name_lower)
            if meta is None:
                continue

            ram_mb = (info["memory_info"].rss // (1024 * 1024)) if info["memory_info"] else 0
            running.append({
                "pid":      info["pid"],
                "exe":      info["name"],
                "name":     meta["name"],
                "category": meta["category"],
                "reason":   meta["reason"],
                "cpu":      round(info["cpu_percent"] or 0.0, 1),
                "ram_mb":   ram_mb,
                "username": (info["username"] or "").split("\\")[-1],
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    # Sort by RAM usage descending (bigger offenders first)
    running.sort(key=lambda p: p["ram_mb"], reverse=True)

    total_ram = psutil.virtual_memory().total / (1024 * 1024)
    total_interference_ram = sum(p["ram_mb"] for p in running)

    return {
        "processes":       running,
        "count":           len(running),
        "total_ram_mb":    round(total_interference_ram),
        "total_ram_pct":   round((total_interference_ram / total_ram) * 100, 1) if total_ram else 0,
    }


def close_closeable_processes() -> dict:
    """Terminates all processes flagged as closeable (legacy optimizer action)."""
    closed = []
    errors = []
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            if proc.info["name"] in _CLOSEABLE:
                proc.terminate()
                closed.append(proc.info["name"])
        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            errors.append(f"{proc.info.get('name', '?')}: {e}")
    return {"closed": closed, "errors": errors}


def close_selected_processes(pids: list[int]) -> dict:
    """
    Terminates a specific list of PIDs chosen by the user.
    Returns per-PID result.
    """
    results = []
    for pid in pids:
        try:
            proc = psutil.Process(pid)
            name = proc.name()
            if name in SYSTEM_SAFE:
                results.append({"pid": pid, "name": name, "ok": False, "error": "Processo protegido"})
                continue
            proc.terminate()
            results.append({"pid": pid, "name": name, "ok": True})
        except psutil.NoSuchProcess:
            results.append({"pid": pid, "name": "?", "ok": False, "error": "Processo não encontrado"})
        except psutil.AccessDenied:
            results.append({"pid": pid, "name": "?", "ok": False, "error": "Acesso negado"})
        except Exception as e:
            results.append({"pid": pid, "name": "?", "ok": False, "error": str(e)})

    closed_count = sum(1 for r in results if r["ok"])
    return {
        "results":      results,
        "closed_count": closed_count,
        "error_count":  len(results) - closed_count,
    }


def terminate_pid(pid: int) -> dict:
    """Terminates a specific process by PID."""
    try:
        proc = psutil.Process(pid)
        name = proc.name()
        if name in SYSTEM_SAFE:
            return {"ok": False, "error": f"Processo protegido: {name}"}
        proc.terminate()
        return {"ok": True, "name": name}
    except psutil.NoSuchProcess:
        return {"ok": False, "error": "Processo não encontrado"}
    except psutil.AccessDenied:
        return {"ok": False, "error": "Acesso negado (requer admin)"}
