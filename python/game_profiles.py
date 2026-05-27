"""
Game profiles: detect installed/running games and manage launch options.
Currently supports CS2 and Valorant.
"""
import os
import psutil
import subprocess
from pathlib import Path

try:
    import winreg
    _HAS_WINREG = True
except ImportError:
    _HAS_WINREG = False


# ── Steam detection ───────────────────────────────────────────────────────────

def _steam_path() -> Path | None:
    if not _HAS_WINREG:
        return None
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"SOFTWARE\Valve\Steam")
        path, _ = winreg.QueryValueEx(key, "SteamPath")
        winreg.CloseKey(key)
        return Path(path)
    except Exception:
        return None


def _steam_libraries() -> list[Path]:
    steam = _steam_path()
    if not steam:
        return []

    libraries = [steam / "steamapps"]
    vdf = steam / "steamapps" / "libraryfolders.vdf"
    if vdf.exists():
        try:
            text = vdf.read_text(encoding="utf-8", errors="ignore")
            import re
            for match in re.finditer(r'"path"\s+"([^"]+)"', text):
                p = Path(match.group(1)) / "steamapps"
                if p.exists():
                    libraries.append(p)
        except Exception:
            pass
    return libraries


def _find_steam_game(app_id: int) -> Path | None:
    for lib in _steam_libraries():
        manifest = lib / f"appmanifest_{app_id}.acf"
        if manifest.exists():
            try:
                text = manifest.read_text(encoding="utf-8", errors="ignore")
                import re
                m = re.search(r'"installdir"\s+"([^"]+)"', text)
                if m:
                    game_dir = lib / "common" / m.group(1)
                    if game_dir.exists():
                        return game_dir
            except Exception:
                pass
    return None


# ── CS2 launch options ─────────────────────────────────────────────────────────

CS2_APP_ID = 730

_CS2_COMPETITIVE_OPTIONS = (
    "-novid -nojoy -noaafonts "
    "+fps_max 0 "
    "-high "
    "-threads {threads} "
    "-tickrate 128 "
    "+cl_interp 0 "
    "+cl_interp_ratio 1 "
    "+rate 786432 "
    "+cl_updaterate 128 "
    "+cl_cmdrate 128"
)

_CS2_QUALITY_OPTIONS = (
    "-novid -nojoy "
    "+fps_max 165 "
    "-threads {threads}"
)


def _get_cs2_launch_options_path() -> Path | None:
    """CS2 stores per-user config in userdata/<steamid>/730/local/cfg/"""
    steam = _steam_path()
    if not steam:
        return None
    userdata = steam / "userdata"
    if not userdata.exists():
        return None
    # Pick the first Steam account found
    for uid_dir in userdata.iterdir():
        cfg = uid_dir / "730" / "local" / "cfg" / "cs2_user_convars.vcfg"
        if cfg.exists():
            return cfg
    return None


def get_cs2_launch_options() -> str | None:
    """Read current CS2 launch options from Steam config."""
    if not _HAS_WINREG:
        return None
    try:
        # Launch options are in localconfig.vdf per-user
        steam = _steam_path()
        if not steam:
            return None
        userdata = steam / "userdata"
        for uid_dir in userdata.iterdir():
            cfg = uid_dir / "config" / "localconfig.vdf"
            if cfg.exists():
                import re
                text = cfg.read_text(encoding="utf-8", errors="ignore")
                # Find the CS2 (730) launch options block
                m = re.search(
                    r'"730".*?"LaunchOptions"\s+"([^"]*)"',
                    text, re.DOTALL
                )
                if m:
                    return m.group(1)
    except Exception:
        pass
    return None


def _is_steam_running() -> bool:
    """Check if Steam is currently running."""
    try:
        for p in psutil.process_iter(["name"]):
            if p.info.get("name", "").lower() in ("steam.exe", "steamwebhelper.exe"):
                return True
    except Exception:
        pass
    return False


def set_cs2_launch_options(options: str) -> dict:
    """Write CS2 launch options to Steam's localconfig.vdf.
    Works with Steam open or closed. Changes take effect on next Steam restart.
    """
    steam_open = _is_steam_running()

    try:
        steam = _steam_path()
        if not steam:
            return {"ok": False, "error": "Steam não encontrado no registro"}

        userdata = steam / "userdata"
        if not userdata.exists():
            return {"ok": False, "error": f"Pasta userdata não encontrada: {userdata}"}

        import re
        updated = False
        checked = []

        for uid_dir in userdata.iterdir():
            cfg = uid_dir / "config" / "localconfig.vdf"
            if not cfg.exists():
                continue
            checked.append(str(cfg))
            text = cfg.read_text(encoding="utf-8", errors="ignore")

            # Case 1: LaunchOptions key already exists — replace it
            new_text, count = re.subn(
                r'("LaunchOptions"\s+)"[^"]*"',
                lambda m: f'{m.group(1)}"{options}"',
                text,
            )
            if count > 0:
                cfg.write_text(new_text, encoding="utf-8")
                updated = True
                continue

            # Case 2: LaunchOptions key missing — insert inside the "730" block
            def insert_launch(m):
                block_open = m.group(0)
                indent = re.search(r'(\s+)\{', block_open)
                tab = indent.group(1) if indent else "\n\t\t\t"
                return block_open + f'\n{tab}\t"LaunchOptions"\t\t"{options}"'

            new_text, count = re.subn(
                r'"730"\s*\n\s*\{',
                insert_launch,
                text,
            )
            if count > 0:
                cfg.write_text(new_text, encoding="utf-8")
                updated = True

        if updated:
            msg = (
                "Salvo! Feche o jogo e reinicie o Steam para aplicar."
                if steam_open else
                "Launch options salvas. Abra o Steam para aplicar."
            )
            return {"ok": True, "message": msg, "steam_open": steam_open}

        hint = f"Arquivos verificados: {checked}" if checked else "Nenhum localconfig.vdf encontrado"
        return {"ok": False, "error": f"Bloco do CS2 (730) não encontrado no localconfig.vdf. {hint}"}

    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── Game detection ─────────────────────────────────────────────────────────────

_GAME_PROCESSES = {
    "cs2":       {"exe": "cs2.exe",                          "name": "Counter-Strike 2"},
    "valorant":  {"exe": "valorant-win64-shipping.exe",       "name": "Valorant"},
    "fortnite":  {"exe": "fortniteclient-win64-shipping.exe", "name": "Fortnite"},
    "r6siege":   {"exe": "rainbowsix.exe",                   "name": "Rainbow Six Siege"},
    "lol":       {"exe": "league of legends.exe",             "name": "League of Legends"},
    "cod":       {"exe": "modernwarfare.exe",                 "name": "Call of Duty"},
}


def detect_running_game() -> dict | None:
    running = {p.info["name"].lower() for p in psutil.process_iter(["name"])
               if p.info.get("name")}
    for gid, info in _GAME_PROCESSES.items():
        if info["exe"].lower() in running:
            return {"id": gid, "name": info["name"], "exe": info["exe"]}
    return None


# ── Profile builder ────────────────────────────────────────────────────────────

def get_profiles() -> list[dict]:
    import psutil as _ps
    cpu_count = _ps.cpu_count(logical=False) or 4
    threads = min(cpu_count, 8)

    cs2_installed = _find_steam_game(CS2_APP_ID) is not None
    cs2_options   = get_cs2_launch_options()

    return [
        {
            "id":        "cs2",
            "name":      "Counter-Strike 2",
            "icon":      "🎯",
            "installed": cs2_installed,
            "running":   False,
            "modes": {
                "competitive": _CS2_COMPETITIVE_OPTIONS.format(threads=threads),
                "quality":     _CS2_QUALITY_OPTIONS.format(threads=threads),
            },
            "current_options": cs2_options,
        },
        {"id": "valorant", "name": "Valorant",           "icon": "⚡", "installed": False, "running": False, "modes": {}, "current_options": None},
        {"id": "fortnite", "name": "Fortnite",           "icon": "🏗️", "installed": False, "running": False, "modes": {}, "current_options": None},
        {"id": "r6siege",  "name": "Rainbow Six Siege",  "icon": "🛡️", "installed": False, "running": False, "modes": {}, "current_options": None},
        {"id": "lol",      "name": "League of Legends",  "icon": "⚔️", "installed": False, "running": False, "modes": {}, "current_options": None},
        {"id": "cod",      "name": "Call of Duty",       "icon": "🔫", "installed": False, "running": False, "modes": {}, "current_options": None},
    ]
