"""
V2 Game Optimizer — Python sidecar
Communicates with Electron via stdin/stdout JSON-RPC.
Each line in: {"id": "1", "command": "...", "args": {...}}
Each line out: {"id": "1", "result": ...} or {"id": "1", "error": "..."}
"""
import sys
import io
import json
import traceback

# Force UTF-8 I/O on Windows (default is cp1252 when piped)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stdin  = io.TextIOWrapper(sys.stdin.buffer,  encoding='utf-8', errors='replace')

from hardware import get_hardware_info, get_quick_stats
from network import run_network_test, run_gamer_network_test, ping_game_servers
from optimizer import run_optimizations, get_available_optimizations
from processes import get_process_list, close_closeable_processes, terminate_pid, get_interference_processes, close_selected_processes
from benchmark import run_benchmark
from integrity import get_integrity_score
from database import (
    save_benchmark, get_benchmark_history,
    save_integrity, get_integrity_history,
    save_optimization, get_optimization_history,
)
from game_profiles import (
    get_profiles, detect_running_game, set_cs2_launch_options,
    apply_valorant_settings, apply_lol_settings,
    _VALORANT_COMPETITIVE, _VALORANT_QUALITY,
    _LOL_COMPETITIVE, _LOL_QUALITY,
)
from settings import get_startup, set_startup, clear_history, get_app_info
from license import check_license, activate_key, deactivate, get_machine_id, login
from latency import create_restore_point, get_restore_points
from diagnosis import run_diagnosis, run_smart_optimize
from database import get_diagnosis_history
import tournament
import watcher


def _benchmark_and_save(args):
    result = run_benchmark()
    save_benchmark(result)
    return result


def _integrity_and_save(args):
    result = get_integrity_score()
    save_integrity(result)
    return result


def _optimize_and_save(args):
    result = run_optimizations(args.get("optimizations", []) if args else [])
    save_optimization(result)
    return result


HANDLERS = {
    "hardware_info":         lambda args: get_hardware_info(),
    "quick_stats":           lambda args: get_quick_stats(),
    "network_test":          lambda args: run_network_test(),
    "gamer_network_test":    lambda args: run_gamer_network_test(),
    "optimize":              _optimize_and_save,
    "optimizations_list":    lambda args: get_available_optimizations(),
    "process_list":          lambda args: get_process_list(args.get("limit", 30) if args else 30),
    "interference_processes":lambda args: get_interference_processes(),
    "close_selected":        lambda args: close_selected_processes(args.get("pids", []) if args else []),
    "close_closeable":       lambda args: close_closeable_processes(),
    "terminate_pid":         lambda args: terminate_pid(args["pid"]) if args else {"ok": False, "error": "pid required"},
    "benchmark":             _benchmark_and_save,
    "benchmark_history":     lambda args: get_benchmark_history(args.get("limit", 10) if args else 10),
    "integrity_score":       _integrity_and_save,
    "integrity_history":     lambda args: get_integrity_history(args.get("limit", 10) if args else 10),
    "optimization_history":  lambda args: get_optimization_history(args.get("limit", 10) if args else 10),
    "game_profiles":         lambda args: get_profiles(),
    "detect_game":           lambda args: detect_running_game(),
    "set_cs2_options":       lambda args: set_cs2_launch_options(args["options"]) if args else {"ok": False},
    "set_valorant_options":  lambda args: apply_valorant_settings(_VALORANT_COMPETITIVE if (args or {}).get("mode") == "competitive" else _VALORANT_QUALITY) if args else {"ok": False},
    "set_lol_options":       lambda args: apply_lol_settings(_LOL_COMPETITIVE if (args or {}).get("mode") == "competitive" else _LOL_QUALITY) if args else {"ok": False},
    "game_server_ping":      lambda args: ping_game_servers(),
    "get_startup":           lambda args: get_startup(),
    "set_startup":           lambda args: set_startup(bool(args.get("enabled"))) if args else {"ok": False},
    "clear_history":         lambda args: clear_history(args.get("type", "all")) if args else clear_history("all"),
    "app_info":              lambda args: get_app_info(),
    "check_license":         lambda args: check_license(),
    "activate_key":          lambda args: activate_key(args.get("key", "")) if args else {"ok": False, "error": "key required"},
    "login":                 lambda args: login(args.get("email", ""), args.get("password", "")) if args else {"ok": False, "error": "email and password required"},
    "deactivate":            lambda args: deactivate(),
    "machine_id":            lambda args: {"id": get_machine_id()},
    "boost_status":          lambda args: watcher.get_status(),
    "set_auto_boost":        lambda args: watcher.set_auto_boost(bool(args.get("enabled", True))) if args else {"ok": False},
    "create_restore_point":  lambda args: create_restore_point(args.get("description", "V2 Game Optimizer — Antes de Otimizar") if args else "V2 Game Optimizer — Antes de Otimizar"),
    "get_restore_points":    lambda args: get_restore_points(),
    "run_diagnosis":         lambda args: run_diagnosis(),
    "run_smart_optimize":    lambda args: run_smart_optimize(),
    "diagnosis_history":     lambda args: get_diagnosis_history(args.get("limit", 7) if args else 7),
    "tournament_enable":     lambda args: tournament.enable_tournament_mode(),
    "tournament_disable":    lambda args: tournament.disable_tournament_mode(),
    "tournament_status":     lambda args: tournament.get_tournament_status(),
}


def main():
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        msg_id = None
        try:
            msg = json.loads(line)
            msg_id = msg.get("id")
            command = msg.get("command", "")
            args = msg.get("args")

            handler = HANDLERS.get(command)
            if handler is None:
                raise ValueError(f"Unknown command: {command}")

            result = handler(args)
            response = {"id": msg_id, "result": result}
        except Exception as exc:
            response = {"id": msg_id, "error": str(exc)}
            traceback.print_exc(file=sys.stderr)

        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    watcher.start()
    main()
