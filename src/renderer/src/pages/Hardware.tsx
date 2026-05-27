import { useEffect } from 'react'
import { Cpu, MemoryStick, HardDrive, Thermometer, RefreshCw } from 'lucide-react'
import { usePython } from '../hooks/usePython'
import { useTranslation } from 'react-i18next'

interface HardwareInfo {
  cpu: {
    name: string
    cores_physical: number
    cores_logical: number
    freq_current_mhz: number
    freq_max_mhz: number
    usage_percent: number
    usage_per_core: number[]
    temp_celsius: number | null
  }
  ram: {
    total_gb: number
    used_gb: number
    available_gb: number
    percent: number
    swap_total_gb: number
    swap_used_gb: number
  }
  disks: Array<{
    device: string
    mountpoint: string
    total_gb: number
    used_gb: number
    free_gb: number
    percent: number
    fstype: string
  }>
  gpu: {
    name: string
    vram_total_mb: number | null
    vram_used_mb: number | null
    temp_celsius: number | null
    driver_version: string | null
  } | null
  bottleneck: string | null
}

function ProgressBar({ value, max = 100, color = 'brand' }: { value: number; max?: number; color?: string }) {
  const pct = (value / max) * 100
  const barColor = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : `bg-${color}-500`
  return (
    <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-dark-600">
        <Icon size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function Hardware() {
  const { t } = useTranslation()
  const { data, loading, error, invoke } = usePython<HardwareInfo>()

  useEffect(() => {
    invoke('hardware_info')
  }, [invoke])

  const hw = data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">{t('hardware.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('hardware.subtitle')}</p>
        </div>
        <button
          onClick={() => invoke('hardware_info')}
          disabled={loading}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('common.update')}
        </button>
      </div>

      {error && (
        <div className="card border-red-500/20 bg-red-500/5 text-red-400 text-sm">
          {error}
        </div>
      )}

      {hw?.bottleneck && (
        <div className="card border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm flex items-center gap-2">
          <span className="font-semibold">{t('hardware.bottleneck')}:</span> {hw.bottleneck}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* CPU */}
        <Section title={t('hardware.processor')} icon={Cpu}>
          <div className="space-y-3">
            <div>
              <p className="text-white text-sm font-medium">{hw?.cpu.name ?? '—'}</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {hw ? `${hw.cpu.cores_physical} ${t('hardware.cores_physical')} · ${hw.cpu.cores_logical} ${t('hardware.cores_logical')}` : '—'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="metric-label">{t('hardware.usage')}</p>
                <p className="text-white font-mono text-lg">{hw ? `${hw.cpu.usage_percent.toFixed(0)}%` : '—'}</p>
              </div>
              <div>
                <p className="metric-label">{t('hardware.freq')}</p>
                <p className="text-white font-mono text-lg">{hw ? `${(hw.cpu.freq_current_mhz / 1000).toFixed(2)} GHz` : '—'}</p>
              </div>
            </div>
            <ProgressBar value={hw?.cpu.usage_percent ?? 0} />
            {hw && (
              <div className="grid grid-cols-4 gap-1">
                {hw.cpu.usage_per_core.slice(0, 8).map((pct, i) => (
                  <div key={i} className="text-center">
                    <div className="h-8 bg-dark-600 rounded flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded transition-all ${pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-brand-500'}`}
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <p className="text-slate-600 text-xs mt-0.5">{i}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* RAM */}
        <Section title={t('hardware.ram')} icon={MemoryStick}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="metric-label">{t('hardware.usage')}</p>
                <p className="text-white font-mono text-lg">{hw ? `${hw.ram.used_gb.toFixed(1)} GB` : '—'}</p>
              </div>
              <div>
                <p className="metric-label">Total</p>
                <p className="text-white font-mono text-lg">{hw ? `${hw.ram.total_gb.toFixed(0)} GB` : '—'}</p>
              </div>
              <div>
                <p className="metric-label">{t('hardware.available')}</p>
                <p className="text-white font-mono text-lg">{hw ? `${hw.ram.available_gb.toFixed(1)} GB` : '—'}</p>
              </div>
              <div>
                <p className="metric-label">Uso</p>
                <p className="text-white font-mono text-lg">{hw ? `${hw.ram.percent.toFixed(0)}%` : '—'}</p>
              </div>
            </div>
            <ProgressBar value={hw?.ram.percent ?? 0} color="purple" />
            <div className="pt-2 border-t border-dark-600">
              <p className="metric-label mb-1">{t('hardware.swap')}</p>
              <p className="text-slate-400 text-xs">
                {hw ? `${hw.ram.swap_used_gb.toFixed(1)} GB / ${hw.ram.swap_total_gb.toFixed(1)} GB` : '—'}
              </p>
              <ProgressBar
                value={hw?.ram.swap_total_gb ? (hw.ram.swap_used_gb / hw.ram.swap_total_gb) * 100 : 0}
                color="cyan"
              />
            </div>
          </div>
        </Section>

        {/* GPU */}
        <Section title={t('hardware.gpu')} icon={Thermometer}>
          {hw?.gpu ? (
            <div className="space-y-3">
              <div>
                <p className="text-white text-sm font-medium">{hw.gpu.name}</p>
                <p className="text-slate-500 text-xs mt-0.5">Driver: {hw.gpu.driver_version ?? 'Desconhecido'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="metric-label">{t('hardware.vram')}</p>
                  <p className="text-white font-mono text-lg">
                    {hw.gpu.vram_total_mb != null ? `${(hw.gpu.vram_total_mb / 1024).toFixed(0)} GB` : '—'}
                  </p>
                </div>
                <div>
                  <p className="metric-label">{t('hardware.temp')}</p>
                  <p className="text-white font-mono text-lg">
                    {hw.gpu.temp_celsius != null ? `${hw.gpu.temp_celsius}°C` : '—'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">GPU não detectada ou sem suporte WMI</p>
          )}
        </Section>

        {/* Disks */}
        <Section title={t('hardware.storage')} icon={HardDrive}>
          <div className="space-y-3">
            {hw?.disks.length ? hw.disks.map(disk => (
              <div key={disk.device} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">{disk.device} ({disk.fstype})</span>
                  <span className="text-slate-500">{disk.percent.toFixed(0)}%</span>
                </div>
                <ProgressBar value={disk.percent} color="cyan" />
                <div className="flex justify-between text-xs text-slate-600">
                  <span>{disk.used_gb.toFixed(1)} GB usados</span>
                  <span>{disk.total_gb.toFixed(0)} GB total</span>
                </div>
              </div>
            )) : (
              <p className="text-slate-500 text-sm">—</p>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
