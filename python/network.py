"""
Network diagnostics — ping, jitter, packet loss, bufferbloat, game server pings.
"""
import subprocess
import re
import statistics
import threading
import time


def _ping_host(host: str, count: int = 10) -> list[float]:
    """Returns list of RTT values in ms."""
    try:
        out = subprocess.check_output(
            ["ping", "-n", str(count), "-w", "2000", host],
            timeout=30, stderr=subprocess.DEVNULL
        )
        text = out.decode("cp850", errors="ignore")
        times = re.findall(r"(?:tempo|time)[<=]\s*(\d+)\s*ms", text, re.IGNORECASE)
        return [float(t) for t in times]
    except Exception:
        return []


def run_network_test(host: str = "8.8.8.8", count: int = 10) -> dict:
    rtts = _ping_host(host, count)

    if not rtts:
        return {
            "ping_ms": None, "jitter_ms": None,
            "packet_loss_percent": 100.0, "download_mbps": None, "host": host,
        }

    return {
        "ping_ms":              round(statistics.mean(rtts), 1),
        "jitter_ms":            round(statistics.stdev(rtts), 1) if len(rtts) > 1 else 0.0,
        "packet_loss_percent":  round(((count - len(rtts)) / count) * 100, 1),
        "download_mbps":        None,
        "host":                 host,
    }


# ── Bufferbloat detection ─────────────────────────────────────────────────────

def _run_bufferbloat_test() -> dict:
    """
    Compara ping idle vs ping sob carga simultânea.
    Bufferbloat acontece quando roteadores com buffer grande aumentam
    drasticamente a latência quando o link está saturado.
    Grau A (< 5ms aumento) → D (> 50ms aumento).
    """
    # 1. Baseline — ping sem carga
    baseline_rtts = _ping_host("8.8.8.8", 6)
    baseline = round(statistics.mean(baseline_rtts), 1) if len(baseline_rtts) >= 3 else None

    if baseline is None:
        return {"grade": "?", "baseline_ms": None, "loaded_ms": None, "increase_ms": None,
                "explanation": "Não foi possível medir"}

    # 2. Simular carga — pings paralelos a múltiplos hosts
    stop_event = threading.Event()
    LOAD_HOSTS = ["1.1.1.1", "208.67.222.222", "9.9.9.9"]

    def _load_worker(host: str) -> None:
        while not stop_event.is_set():
            _ping_host(host, 2)

    workers = []
    for h in LOAD_HOSTS:
        t = threading.Thread(target=_load_worker, args=(h,), daemon=True)
        t.start()
        workers.append(t)

    time.sleep(0.8)  # deixa workers começarem

    # 3. Medir ping sob carga
    loaded_rtts = _ping_host("8.8.8.8", 6)
    loaded = round(statistics.mean(loaded_rtts), 1) if len(loaded_rtts) >= 3 else None
    stop_event.set()

    if loaded is None:
        return {"grade": "?", "baseline_ms": baseline, "loaded_ms": None, "increase_ms": None,
                "explanation": "Erro durante medição com carga"}

    increase = round(loaded - baseline, 1)

    if increase < 5:
        grade, explanation = "A", "Excelente — roteador sem bufferbloat. Latência estável mesmo sob carga."
    elif increase < 20:
        grade, explanation = "B", "Bom — leve aumento de latência sob carga. Aceitável para a maioria dos jogos."
    elif increase < 50:
        grade, explanation = "C", "Problema de bufferbloat detectado. Latência aumenta sob downloads simultâneos."
    else:
        grade, explanation = "D", "Bufferbloat severo — roteador enfileirando pacotes. Causa rubberbanding e hit reg ruim durante streaming ou downloads."

    return {
        "grade":       grade,
        "baseline_ms": baseline,
        "loaded_ms":   loaded,
        "increase_ms": max(0, increase),
        "explanation": explanation,
    }


# ── Game server pings ─────────────────────────────────────────────────────────

_GAME_SERVERS = [
    {"name": "Valve / CS2",   "host": "208.64.200.231", "game": "CS2",     "region": "US"},
    {"name": "Valve EU",      "host": "185.25.182.1",   "game": "CS2",     "region": "EU"},
    {"name": "Riot (NA)",     "host": "104.160.141.3",  "game": "VALORANT","region": "NA"},
    {"name": "Cloudflare",    "host": "1.1.1.1",        "game": "CDN",     "region": "Global"},
    {"name": "Google DNS",    "host": "8.8.8.8",        "game": "DNS",     "region": "Global"},
]


def _ping_server(server: dict) -> dict:
    rtts = _ping_host(server["host"], 4)
    avg  = round(statistics.mean(rtts), 1) if rtts else None

    if avg is None:
        quality = "unreachable"
    elif avg < 30:
        quality = "excellent"
    elif avg < 60:
        quality = "good"
    elif avg < 100:
        quality = "warning"
    else:
        quality = "bad"

    return {**server, "ping_ms": avg, "quality": quality}


# ── Full gamer network test ───────────────────────────────────────────────────

def run_gamer_network_test() -> dict:
    """
    Diagnóstico completo para gamers:
    - Ping / jitter / packet loss
    - Bufferbloat (latência idle vs sob carga)
    - Pings para servidores de jogos populares
    - Score de qualidade de conexão (0-100)
    - Diagnóstico em linguagem simples
    """
    # Testes em paralelo para economia de tempo
    results: dict = {}
    errors: list[str] = []

    def run_basic():
        results["basic"] = run_network_test(host="8.8.8.8", count=10)

    def run_bufferbloat():
        results["bufferbloat"] = _run_bufferbloat_test()

    def run_servers():
        server_results = []
        threads = []
        for srv in _GAME_SERVERS:
            t = threading.Thread(target=lambda s=srv: server_results.append(_ping_server(s)), daemon=True)
            t.start()
            threads.append(t)
        for t in threads:
            t.join(timeout=8)
        results["servers"] = server_results

    threads = [
        threading.Thread(target=run_basic,       daemon=True),
        threading.Thread(target=run_bufferbloat, daemon=True),
        threading.Thread(target=run_servers,     daemon=True),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=20)

    basic      = results.get("basic", {})
    bb         = results.get("bufferbloat", {"grade": "?"})
    servers    = results.get("servers", [])

    ping   = basic.get("ping_ms")
    jitter = basic.get("jitter_ms")
    loss   = basic.get("packet_loss_percent", 0)

    # ── Score de qualidade ─────────────────────────────────────────────────
    score = 100

    if ping:
        if ping > 100:  score -= 25
        elif ping > 60: score -= 12
        elif ping > 30: score -= 5

    if jitter:
        if jitter > 30:  score -= 20
        elif jitter > 15: score -= 10
        elif jitter > 5:  score -= 4

    if loss > 1:   score -= 20
    elif loss > 0: score -= 8

    bb_grade = bb.get("grade", "?")
    if bb_grade == "D":   score -= 20
    elif bb_grade == "C": score -= 10
    elif bb_grade == "B": score -= 5

    score = max(0, min(100, score))

    # ── Tipo de conexão estimado ───────────────────────────────────────────
    if ping and ping < 4:
        conn_type = "LAN"
    elif ping and ping < 20:
        conn_type = "Ethernet"
    elif ping and ping < 50:
        conn_type = "Ethernet / Wi-Fi 5GHz"
    elif ping:
        conn_type = "Wi-Fi 2.4GHz / conexão instável"
    else:
        conn_type = "Desconhecido"

    # ── Diagnóstico em linguagem simples ──────────────────────────────────
    problems = []
    if ping and ping > 80:
        problems.append(f"Ping alto ({ping:.0f}ms) — use cabo Ethernet e feche downloads")
    if jitter and jitter > 15:
        problems.append(f"Jitter elevado ({jitter:.1f}ms) — conexão instável afeta hit registration")
    if loss > 0:
        problems.append(f"Perda de pacotes ({loss:.1f}%) — verifique cabo ou roteador")
    if bb_grade in ("C", "D"):
        problems.append("Bufferbloat detectado — latência piora durante downloads/streaming")
    if not problems:
        problems.append("Conexão saudável para jogos competitivos")

    return {
        "ping_ms":             ping,
        "jitter_ms":           jitter,
        "packet_loss_percent": loss,
        "download_mbps":       None,
        "host":                "8.8.8.8",
        "bufferbloat":         bb,
        "server_pings":        servers,
        "quality_score":       score,
        "connection_type":     conn_type,
        "problems":            problems,
    }
