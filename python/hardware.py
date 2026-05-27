"""
Hardware information gathering using psutil and WMI (Windows).
"""
import psutil
import subprocess
import sys
import threading
import time

try:
    import wmi
    _wmi = wmi.WMI()
except Exception:
    _wmi = None

# ── GPU usage cache (query é lenta, roda em background a cada 4s) ──────────────
_gpu_cache_lock = threading.Lock()
_gpu_cache = {"usage": None, "vram_used_gb": None, "ts": 0.0}

def _query_gpu_usage_wpc() -> float | None:
    """GPU usage via Windows Performance Counter — funciona em NVIDIA, AMD e Intel."""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command",
             "(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage'"
             " -ErrorAction SilentlyContinue).CounterSamples"
             " | Where-Object {$_.Status -eq 0}"
             " | Measure-Object CookedValue -Sum"
             " | Select-Object -ExpandProperty Sum"],
            capture_output=True, text=True, timeout=7
        )
        val = float(out.stdout.strip())
        return round(min(val, 100.0), 1)
    except Exception:
        return None

def _query_gpu_vram_wpc() -> float | None:
    """VRAM usada via Windows Performance Counter."""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command",
             "(Get-Counter '\\GPU Adapter Memory(*)\\Dedicated Usage'"
             " -ErrorAction SilentlyContinue).CounterSamples"
             " | Measure-Object CookedValue -Sum"
             " | Select-Object -ExpandProperty Sum"],
            capture_output=True, text=True, timeout=7
        )
        val = float(out.stdout.strip())
        return round(val / (1024 ** 3), 1)
    except Exception:
        return None

def _gpu_cache_loop() -> None:
    """Background thread que atualiza o cache de GPU a cada 4s."""
    while True:
        time.sleep(4)
        usage = _query_gpu_usage_wpc()
        vram  = _query_gpu_vram_wpc()
        # Fallback para nvidia-smi se WPC não funcionou
        if usage is None:
            usage = _get_gpu_usage_nvidia()
        with _gpu_cache_lock:
            _gpu_cache["usage"]        = usage
            _gpu_cache["vram_used_gb"] = vram
            _gpu_cache["ts"]           = time.time()

# Inicia o thread de cache na importação do módulo
_gpu_bg = threading.Thread(target=_gpu_cache_loop, daemon=True, name="gpu-cache")
_gpu_bg.start()


def _get_cpu_name() -> str:
    if _wmi:
        try:
            cpu = _wmi.Win32_Processor()[0]
            return cpu.Name.strip()
        except Exception:
            pass
    try:
        import platform
        return platform.processor() or "Unknown CPU"
    except Exception:
        return "Unknown CPU"


def _get_gpu_info() -> dict | None:
    if not _wmi:
        return None
    try:
        gpus = _wmi.Win32_VideoController()
        if not gpus:
            return None
        gpu = gpus[0]
        vram_mb = int(gpu.AdapterRAM or 0) // (1024 * 1024) if gpu.AdapterRAM else None
        return {
            "name": (gpu.Name or "Unknown").strip(),
            "vram_total_mb": vram_mb if vram_mb and vram_mb > 0 else None,
            "vram_used_mb": None,
            "temp_celsius": _get_gpu_temp_nvidia(),
            "driver_version": gpu.DriverVersion,
        }
    except Exception:
        return None


def _get_gpu_temp_nvidia() -> float | None:
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
            timeout=3, stderr=subprocess.DEVNULL
        )
        return float(out.strip())
    except Exception:
        return None


def _get_cpu_temp() -> float | None:
    if _wmi:
        try:
            sensors = _wmi.MSAcpi_ThermalZoneTemperature()
            if sensors:
                kelvin = sensors[0].CurrentTemperature / 10.0
                return round(kelvin - 273.15, 1)
        except Exception:
            pass
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return None
        for key in ("coretemp", "k10temp", "cpu_thermal"):
            if key in temps and temps[key]:
                return temps[key][0].current
    except Exception:
        pass
    return None


def _detect_bottleneck(cpu_pct: float, ram_pct: float) -> str | None:
    if cpu_pct > 90:
        return "CPU saturada — atualize o processador ou reduza workloads em segundo plano"
    if ram_pct > 90:
        return "RAM quase cheia — feche aplicativos ou adicione mais memória"
    return None


def get_hardware_info() -> dict:
    cpu_freq = psutil.cpu_freq()
    cpu_pct = psutil.cpu_percent(interval=0.5)
    per_core = psutil.cpu_percent(interval=0.1, percpu=True)
    ram = psutil.virtual_memory()
    swap = psutil.swap_memory()

    disks = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disks.append({
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total_gb": usage.total / 1e9,
                "used_gb": usage.used / 1e9,
                "free_gb": usage.free / 1e9,
                "percent": usage.percent,
            })
        except PermissionError:
            pass

    return {
        "cpu": {
            "name": _get_cpu_name(),
            "cores_physical": psutil.cpu_count(logical=False) or 1,
            "cores_logical": psutil.cpu_count(logical=True) or 1,
            "freq_current_mhz": cpu_freq.current if cpu_freq else 0,
            "freq_max_mhz": cpu_freq.max if cpu_freq else 0,
            "usage_percent": cpu_pct,
            "usage_per_core": per_core,
            "temp_celsius": _get_cpu_temp(),
        },
        "ram": {
            "total_gb": ram.total / 1e9,
            "used_gb": ram.used / 1e9,
            "available_gb": ram.available / 1e9,
            "percent": ram.percent,
            "swap_total_gb": swap.total / 1e9,
            "swap_used_gb": swap.used / 1e9,
        },
        "disks": disks,
        "gpu": _get_gpu_info(),
        "bottleneck": _detect_bottleneck(cpu_pct, ram.percent),
    }


def _get_gpu_usage_nvidia() -> float | None:
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
            timeout=2, stderr=subprocess.DEVNULL
        )
        return float(out.strip())
    except Exception:
        return None


def get_quick_stats() -> dict:
    cpu_pct = psutil.cpu_percent(interval=0.2)
    ram  = psutil.virtual_memory()
    disk = psutil.disk_usage("/") if sys.platform != "win32" else psutil.disk_usage("C:\\")

    ping_ms  = _quick_ping()
    gpu_temp = _get_gpu_temp_nvidia()

    with _gpu_cache_lock:
        gpu_usage    = _gpu_cache["usage"]
        gpu_vram_gb  = _gpu_cache["vram_used_gb"]

    # Fallback imediato para nvidia-smi no primeiro tick antes do cache estar pronto
    if gpu_usage is None:
        gpu_usage = _get_gpu_usage_nvidia()

    return {
        "cpu_percent":    cpu_pct,
        "cpu_temp":       _get_cpu_temp(),
        "ram_percent":    ram.percent,
        "ram_used_gb":    ram.used / 1e9,
        "ram_total_gb":   ram.total / 1e9,
        "disk_percent":   disk.percent,
        "ping_ms":        ping_ms,
        "gpu_temp":       gpu_temp,
        "gpu_usage":      gpu_usage,
        "gpu_vram_gb":    gpu_vram_gb,
    }


def _quick_ping(host: str = "8.8.8.8") -> float | None:
    try:
        import subprocess, re
        out = subprocess.check_output(
            ["ping", "-n", "1", "-w", "1000", host],
            timeout=2, stderr=subprocess.DEVNULL
        )
        match = re.search(r"[Mm]éd(?:ia|io|ium)[^\d]*(\d+)", out.decode("cp850", errors="ignore"))
        if not match:
            match = re.search(r"Average\s*=\s*(\d+)", out.decode("cp850", errors="ignore"))
        if match:
            return float(match.group(1))
    except Exception:
        pass
    return None
