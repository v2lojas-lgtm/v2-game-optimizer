"""
System benchmark — Fase 3.
Measures disk speed, RAM throughput and CPU single-thread score.
No external tools required.
"""
import time
import os
import tempfile
import psutil
import math


def _disk_benchmark(size_mb: int = 64) -> dict:
    """Sequential write + read speed in MB/s."""
    path = os.path.join(tempfile.gettempdir(), "_v2opt_bench.tmp")
    data = os.urandom(size_mb * 1024 * 1024)

    # Write
    t0 = time.perf_counter()
    with open(path, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    write_s = time.perf_counter() - t0

    # Read
    t0 = time.perf_counter()
    with open(path, "rb") as f:
        _ = f.read()
    read_s = time.perf_counter() - t0

    try:
        os.remove(path)
    except Exception:
        pass

    return {
        "write_mbps": round(size_mb / write_s, 1),
        "read_mbps":  round(size_mb / read_s, 1),
        "size_mb":    size_mb,
    }


def _cpu_benchmark(duration_s: float = 1.5) -> dict:
    """Single-thread CPU score: operations per second on a math-heavy loop."""
    count = 0
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < duration_s:
        # Mix of float ops to exercise FPU
        x = 0.0
        for i in range(1, 1001):
            x += math.sqrt(i) * math.log(i + 1)
        count += 1

    ops_per_sec = count * 1000  # each iteration = 1000 ops
    # Normalize to a 0-100 score (baseline: 50k ops/s = score 50)
    score = min(100, int(ops_per_sec / 1000))
    return {
        "iterations": count,
        "ops_per_sec": ops_per_sec,
        "score": score,
    }


def _ram_info() -> dict:
    vm = psutil.virtual_memory()
    return {
        "total_gb":     round(vm.total / 1e9, 1),
        "available_gb": round(vm.available / 1e9, 1),
        "percent":      vm.percent,
        "speed_mhz":    _get_ram_speed(),
    }


def _get_ram_speed() -> int | None:
    try:
        import wmi
        w = wmi.WMI()
        sticks = w.Win32_PhysicalMemory()
        if sticks:
            return int(sticks[0].Speed or 0) or None
    except Exception:
        pass
    return None


def _latency_benchmark() -> dict:
    """Measures average system call latency (indirect measure of responsiveness)."""
    samples = 200
    times = []
    for _ in range(samples):
        t0 = time.perf_counter()
        _ = psutil.cpu_percent(interval=0)
        times.append((time.perf_counter() - t0) * 1000)

    avg = sum(times) / len(times)
    return {
        "avg_latency_ms": round(avg, 3),
        "max_latency_ms": round(max(times), 3),
        "samples":        samples,
    }


def run_benchmark() -> dict:
    results: dict = {}
    results["cpu"]     = _cpu_benchmark()
    results["disk"]    = _disk_benchmark(size_mb=64)
    results["ram"]     = _ram_info()
    results["latency"] = _latency_benchmark()

    # Overall score: weighted average
    cpu_s  = results["cpu"]["score"]
    disk_s = min(100, int(results["disk"]["read_mbps"] / 30))   # 3000 MB/s = 100
    ram_s  = max(0, 100 - int(results["ram"]["percent"]))        # less used = better
    lat_s  = max(0, 100 - int(results["latency"]["avg_latency_ms"] * 500))

    overall = int(cpu_s * 0.4 + disk_s * 0.3 + ram_s * 0.2 + lat_s * 0.1)
    results["overall_score"] = max(0, min(100, overall))
    return results
