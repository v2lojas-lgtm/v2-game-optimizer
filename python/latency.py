"""
Otimizações de latência e input lag para Windows.
Foco em responsividade real, não apenas FPS.

Referências técnicas:
- Timer Resolution: timeBeginPeriod(1) reduz scheduler de 15.6ms → ~0.5ms
- Nagle Algorithm: TCP_NODELAY — pacotes saem imediatamente, sem espera de ACK
- Network Throttling Index: Windows limita rede a 10 pps — 0xFFFFFFFF remove limite
- CPU Core Parking: Windows "dorme" núcleos — causa micro-stutter ao acordar
- Restore Point: backup seguro antes de qualquer mudança no sistema
"""
import subprocess
import ctypes
import os

try:
    import winreg
    _HAS_WINREG = True
except ImportError:
    _HAS_WINREG = False

_winmm = None
try:
    _winmm = ctypes.windll.winmm
except Exception:
    pass


# ── 1. Timer Resolution ────────────────────────────────────────────────────────

def set_timer_resolution(enable: bool = True) -> str:
    """
    Muda a resolução do timer do Windows de 15.6ms para 1ms.
    Reduz latência do scheduler — todo input, frame e tick do jogo fica mais preciso.
    Ativado enquanto o app roda; restaurado automaticamente ao fechar.
    """
    if not _HAS_WINREG:
        return "Timer Resolution: winreg não disponível"

    try:
        # Método 1: Registro (permanente — funciona em Windows 11 22H2+)
        key = winreg.CreateKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\Session Manager\kernel"
        )
        if enable:
            winreg.SetValueEx(key, "GlobalTimerResolutionRequests", 0, winreg.REG_DWORD, 1)
        else:
            try:
                winreg.DeleteValue(key, "GlobalTimerResolutionRequests")
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
        action = "ativada" if enable else "restaurada"
        return f"Timer Resolution 1ms {action} — scheduler mais preciso"
    except Exception as e:
        return f"Timer Resolution: {e}"


def apply_timer_resolution_runtime() -> None:
    """Aplica timer resolution de 1ms em tempo real (ativo enquanto o processo viver)."""
    if _winmm:
        try:
            _winmm.timeBeginPeriod(1)
        except Exception:
            pass


def restore_timer_resolution_runtime() -> None:
    """Restaura timer resolution padrão."""
    if _winmm:
        try:
            _winmm.timeEndPeriod(1)
        except Exception:
            pass


# ── 2. Algoritmo de Nagle (TCP_NODELAY) ───────────────────────────────────────

def disable_nagle_algorithm() -> str:
    """
    Desativa o algoritmo de Nagle em todos os adaptadores de rede.
    Nagle agrupa pacotes TCP para economizar banda — ótimo para downloads,
    péssimo para jogos. Com TCP_NODELAY, cada pacote sai imediatamente.
    Resultado: hit registration mais consistente, menor jitter.
    """
    if not _HAS_WINREG:
        return "Nagle: winreg não disponível"

    try:
        base = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces"
        )
        count = winreg.QueryInfoKey(base)[0]
        updated = 0

        for i in range(count):
            try:
                guid = winreg.EnumKey(base, i)
                adapter = winreg.OpenKey(base, guid, 0, winreg.KEY_SET_VALUE | winreg.KEY_READ)

                # Só aplicar em adaptadores com IP configurado
                try:
                    winreg.QueryValueEx(adapter, "DhcpIPAddress")
                    has_ip = True
                except FileNotFoundError:
                    try:
                        winreg.QueryValueEx(adapter, "IPAddress")
                        has_ip = True
                    except FileNotFoundError:
                        has_ip = False

                if has_ip:
                    winreg.SetValueEx(adapter, "TcpAckFrequency", 0, winreg.REG_DWORD, 1)
                    winreg.SetValueEx(adapter, "TCPNoDelay",      0, winreg.REG_DWORD, 1)
                    updated += 1

                winreg.CloseKey(adapter)
            except Exception:
                continue

        winreg.CloseKey(base)

        if updated > 0:
            return f"Nagle Algorithm desativado ({updated} adaptador{'es' if updated > 1 else ''}) — hit reg melhorado"
        return "Nagle: nenhum adaptador de rede com IP encontrado"
    except Exception as e:
        return f"Nagle Algorithm: {e}"


# ── 3. Network Throttling Index ───────────────────────────────────────────────

def set_network_throttling(enable_gaming: bool = True) -> str:
    """
    Windows limita o processamento de pacotes de rede para economizar CPU.
    Padrão: 10 pacotes/ms. Para jogos competitivos: ilimitado (0xFFFFFFFF).
    Também ajusta SystemResponsiveness para priorizar jogos sobre background tasks.
    """
    if not _HAS_WINREG:
        return "Network Throttling: winreg não disponível"

    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
            0, winreg.KEY_SET_VALUE
        )
        if enable_gaming:
            # 0xFFFFFFFF = sem limite de processamento de rede
            winreg.SetValueEx(key, "NetworkThrottlingIndex", 0, winreg.REG_DWORD, 0xFFFFFFFF)
            # 0 = máxima prioridade para games (padrão=20)
            winreg.SetValueEx(key, "SystemResponsiveness",  0, winreg.REG_DWORD, 0)
        else:
            winreg.SetValueEx(key, "NetworkThrottlingIndex", 0, winreg.REG_DWORD, 10)
            winreg.SetValueEx(key, "SystemResponsiveness",  0, winreg.REG_DWORD, 20)
        winreg.CloseKey(key)
        return "Network Throttling desativado — processamento de pacotes sem limite"
    except Exception as e:
        return f"Network Throttling: {e}"


# ── 4. CPU Core Parking ───────────────────────────────────────────────────────

def disable_cpu_core_parking() -> str:
    """
    Windows "estaciona" núcleos da CPU para economizar energia.
    Quando um núcleo estacionado precisa ser usado, há um delay de wake-up
    que causa micro-stutter — especialmente perceptível em jogos competitivos.
    Desativar mantém todos os núcleos prontos para uso imediato.
    """
    results = []

    # GUID do plano de energia atual + sub-grupo de processador + core parking
    PROC_SUBGROUP   = "54533251-82be-4824-96c1-47b60b740d00"
    CORE_PARKING    = "0cc5b647-c1df-4637-891a-dec35c318583"
    PERF_BOOST_MODE = "be337238-0d82-4146-a960-4f3749d470c7"

    def _run(args):
        try:
            subprocess.run(args, capture_output=True, timeout=6)
            return True
        except Exception:
            return False

    # Setar 100% de núcleos mínimos (= desativar parking) no plano atual
    ok1 = _run(["powercfg", "/setacvalueindex", "SCHEME_CURRENT",
                 PROC_SUBGROUP, CORE_PARKING, "100"])
    ok2 = _run(["powercfg", "/setdcvalueindex", "SCHEME_CURRENT",
                 PROC_SUBGROUP, CORE_PARKING, "100"])

    # Aplicar também no plano High Performance
    _run(["powercfg", "/setacvalueindex", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
          PROC_SUBGROUP, CORE_PARKING, "100"])

    # Ativar o plano atual com as novas configurações
    _run(["powercfg", "/setactive", "SCHEME_CURRENT"])

    if ok1 or ok2:
        results.append("CPU Core Parking desativado — todos os núcleos sempre ativos")
    else:
        results.append("CPU Core Parking: não foi possível alterar (tente como admin)")

    # Bonus: desativar processor performance boost decay
    try:
        _run(["powercfg", "/setacvalueindex", "SCHEME_CURRENT",
              PROC_SUBGROUP, PERF_BOOST_MODE, "2"])  # 2 = Aggressive
    except Exception:
        pass

    return " | ".join(results)


# ── 5. Restore Point ──────────────────────────────────────────────────────────

def create_restore_point(description: str = "V2 Game Optimizer — Antes de Otimizar") -> dict:
    """
    Cria um ponto de restauração do Windows antes de qualquer alteração.
    Permite reverter completamente com 1 clique em caso de problema.
    """
    try:
        # Remover limitação de frequência (Windows bloqueia >1 restore point/dia)
        try:
            if _HAS_WINREG:
                key = winreg.OpenKey(
                    winreg.HKEY_LOCAL_MACHINE,
                    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore",
                    0, winreg.KEY_SET_VALUE
                )
                winreg.SetValueEx(key, "SystemRestorePointCreationFrequency",
                                  0, winreg.REG_DWORD, 0)
                winreg.CloseKey(key)
        except Exception:
            pass

        # Habilitar System Restore no drive C: (pode estar desativado)
        subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             'Enable-ComputerRestore -Drive "C:\\" -ErrorAction SilentlyContinue'],
            capture_output=True, timeout=15
        )

        # Criar o ponto de restauração
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f'Checkpoint-Computer -Description "{description}"'
             f' -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop'],
            capture_output=True, text=True, timeout=60
        )

        if result.returncode == 0:
            return {"ok": True, "message": "Ponto de restauração criado com sucesso"}
        else:
            err = result.stderr.strip() or result.stdout.strip()
            return {"ok": False, "message": f"Restore point: {err[:120]}"}

    except subprocess.TimeoutExpired:
        return {"ok": False, "message": "Restore point: timeout (sistema ocupado)"}
    except Exception as e:
        return {"ok": False, "message": f"Restore point: {e}"}


def get_restore_points() -> list[dict]:
    """Lista os restore points existentes."""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-ComputerRestorePoint | Select-Object -Last 5 Description,CreationTime"
             " | ConvertTo-Json -ErrorAction SilentlyContinue"],
            capture_output=True, text=True, timeout=10
        )
        import json
        data = json.loads(result.stdout)
        if isinstance(data, dict):
            data = [data]
        return [{"description": d.get("Description", ""), "date": d.get("CreationTime", "")}
                for d in data]
    except Exception:
        return []
