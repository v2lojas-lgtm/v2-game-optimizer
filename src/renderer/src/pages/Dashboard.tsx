import { useEffect, useState } from 'react'
import { Cpu, MemoryStick, HardDrive, Wifi, Thermometer, Monitor, AlertTriangle, Trophy } from 'lucide-react'
import { usePython } from '../hooks/usePython'
import { useTranslation } from 'react-i18next'

interface QuickStats {
  cpu_percent:  number
  cpu_temp:     number | null
  ram_percent:  number
  ram_used_gb:  number
  ram_total_gb: number
  disk_percent: number
  ping_ms:      number | null
  gpu_usage:    number | null
  gpu_temp:     number | null
  gpu_vram_gb:  number | null
}

type AccentColor = 'cyan' | 'violet' | 'green' | 'yellow' | 'red' | 'orange'

const ACCENT: Record<AccentColor, { hex: string; glow: string; bar: string }> = {
  cyan:   { hex: '#AEEAF8', glow: 'rgba(28,115,191,0.4)',   bar: 'progress-fill' },
  violet: { hex: '#9061CE', glow: 'rgba(144,97,206,0.4)',   bar: 'progress-fill-violet' },
  green:  { hex: '#00ff88', glow: 'rgba(0,255,136,0.35)',   bar: 'progress-fill-green' },
  yellow: { hex: '#ffd60a', glow: 'rgba(255,214,10,0.35)',  bar: 'progress-fill-yellow' },
  red:    { hex: '#ff3366', glow: 'rgba(255,51,102,0.35)',  bar: 'progress-fill-red' },
  orange: { hex: '#ff6b2b', glow: 'rgba(255,107,43,0.35)',  bar: 'progress-fill-yellow' },
}

function autoAccent(pct?: number, base: AccentColor = 'cyan'): AccentColor {
  if (pct === undefined) return base
  if (pct > 88) return 'red'
  if (pct > 70) return 'yellow'
  return base
}

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  percent,
  accent = 'cyan',
  sub,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  unit: string
  percent?: number
  accent?: AccentColor
  sub?: string
}) {
  const a = ACCENT[accent]
  const pct = percent ?? 0

  return (
    <div
      className="relative flex flex-col gap-3 rounded-xl p-4 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, rgba(2,15,41,0.95) 0%, rgba(6,36,95,0.5) 100%)`,
        border: `1px solid rgba(174,234,248,0.07)`,
        boxShadow: `0 4px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(174,234,248,0.04)`,
      }}
    >
      {/* Background glow blob */}
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-full pointer-events-none"
        style={{ background: a.glow, filter: 'blur(28px)', opacity: 0.4, transform: 'translate(30%, -30%)' }}
      />

      {/* Header */}
      <div className="flex items-center justify-between relative z-10">
        <span className="metric-label">{label}</span>
        <div
          className="flex items-center justify-center w-7 h-7 rounded-lg"
          style={{ background: `${a.hex}14`, border: `1px solid ${a.hex}28` }}
        >
          <Icon size={13} style={{ color: a.hex, filter: `drop-shadow(0 0 5px ${a.hex})` }} />
        </div>
      </div>

      {/* Value */}
      <div className="flex items-end gap-1.5 relative z-10">
        <span
          className="font-mono font-bold"
          style={{ fontSize: '2rem', lineHeight: 1, color: '#fff', letterSpacing: '-0.02em' }}
        >
          {value}
        </span>
        <span className="text-xs mb-1" style={{ color: 'rgba(184,184,208,0.45)', fontFamily: 'JetBrains Mono' }}>{unit}</span>
      </div>

      {/* Sub text */}
      {sub && <p className="text-xs relative z-10" style={{ color: 'rgba(184,184,208,0.4)' }}>{sub}</p>}

      {/* Bar */}
      {percent !== undefined && (
        <div className="progress-track relative z-10">
          <div className={`${ACCENT[autoAccent(pct, accent)].bar} progress-fill`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
    </div>
  )
}

const GAMES = [
  { name: 'Counter-Strike 2', icon: '🎯', active: true },
  { name: 'Valorant',         icon: '⚡', active: true },
  { name: 'Fortnite',         icon: '🏗️', active: false },
  { name: 'R6 Siege',         icon: '🛡️', active: false },
  { name: 'League of Legends',icon: '⚔️', active: false },
  { name: 'Call of Duty',     icon: '🔫', active: false },
]

interface PerfAlert { type: string; message: string; level: 'warn' | 'danger' }
interface SessionSummary {
  game: string; duration_min: number
  cpu: { avg: number; max: number } | null
  ram: { avg: number; max: number } | null
  ping: { avg: number; max: number } | null
}

export default function Dashboard() {
  const { t } = useTranslation()
  const { data, loading: _loading, error, invoke } = usePython<QuickStats>()
  const [alerts, setAlerts]   = useState<PerfAlert[]>([])
  const [session, setSession] = useState<SessionSummary | null>(null)

  useEffect(() => {
    invoke('quick_stats')
    const id = setInterval(() => invoke('quick_stats'), 3000)
    return () => clearInterval(id)
  }, [invoke])

  // Escuta eventos push do watcher
  useEffect(() => {
    const unsub = window.api?.python?.onEvent?.((event: string, data: any) => {
      if (event === 'perf_alert') {
        const alert: PerfAlert = { type: data.type, message: data.message, level: data.level }
        setAlerts(prev => [alert, ...prev].slice(0, 3))
        setTimeout(() => setAlerts(prev => prev.filter(a => a !== alert)), 30000)
      }
      if (event === 'game_stop' && data?.summary) {
        setSession(data.summary)
      }
      if (event === 'game_start') {
        setSession(null)
      }
    })
    return () => unsub?.()
  }, [])

  const s = data

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700,
            fontSize: '1.4rem',
            letterSpacing: '0.06em',
            color: '#e0e0f0',
          }}>
            {t('dashboard.title')}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(28,115,191,0.65)', fontFamily: 'Rajdhani', letterSpacing: '0.1em' }}>
            {t('dashboard.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span style={{ fontFamily: 'Rajdhani', fontSize: '0.65rem', letterSpacing: '0.14em', color: 'rgba(0,255,136,0.55)' }}>
            {t('dashboard.monitoring')}
          </span>
        </div>
      </div>

      {error && (
        <div className="card text-xs" style={{ borderColor: 'rgba(255,51,102,0.2)', color: 'rgba(255,51,102,0.8)' }}>
          {error}
        </div>
      )}

      {/* Alertas de performance */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs"
              style={{
                background: a.level === 'danger' ? 'rgba(255,51,102,0.08)' : 'rgba(255,214,10,0.07)',
                border: `1px solid ${a.level === 'danger' ? 'rgba(255,51,102,0.25)' : 'rgba(255,214,10,0.2)'}`,
              }}>
              <AlertTriangle size={12} style={{ color: a.level === 'danger' ? '#ff3366' : '#ffd60a', flexShrink: 0 }} />
              <span style={{ color: a.level === 'danger' ? '#ff3366' : '#ffd60a', fontFamily: 'Rajdhani', letterSpacing: '0.05em' }}>
                {a.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Cpu}         label="CPU"         value={s ? s.cpu_percent.toFixed(0) : '—'}               unit="%" percent={s?.cpu_percent} accent="cyan" />
        <StatCard icon={MemoryStick} label="RAM"         value={s ? s.ram_used_gb.toFixed(1) : '—'}               unit={`/ ${s?.ram_total_gb.toFixed(0) ?? '—'} GB`} percent={s?.ram_percent} accent="violet" />
        <StatCard icon={Monitor}     label="GPU"         value={s?.gpu_usage != null ? s.gpu_usage.toFixed(0) : '—'} unit="%" percent={s?.gpu_usage ?? undefined} accent="violet"
          sub={s?.gpu_vram_gb != null ? `VRAM: ${s.gpu_vram_gb.toFixed(1)} GB` : undefined} />
        <StatCard icon={HardDrive}   label={t('dashboard.disk')} value={s ? s.disk_percent.toFixed(0) : '—'}              unit="%" percent={s?.disk_percent} accent="cyan" />
        <StatCard icon={Thermometer} label={t('dashboard.temp')} value={s?.cpu_temp != null ? s.cpu_temp.toFixed(0) : '—'} unit="°C" percent={s?.cpu_temp ?? undefined} accent={s?.cpu_temp != null && s.cpu_temp > 85 ? 'red' : 'yellow'}
          sub={s?.gpu_temp != null ? `GPU: ${s.gpu_temp.toFixed(0)}°C` : undefined} />
        <StatCard icon={Wifi}        label="Ping"        value={s?.ping_ms != null ? s.ping_ms.toFixed(0) : '—'}  unit="ms" accent={s?.ping_ms != null ? (s.ping_ms > 80 ? 'red' : s.ping_ms > 40 ? 'yellow' : 'green') : 'green'} />
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Supported games */}
        <div className="card space-y-3">
          <p className="section-title">{t('dashboard.games_title')}</p>
          <div className="space-y-1.5">
            {GAMES.map(g => (
              <div key={g.name} className="flex items-center justify-between py-1.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-base leading-none">{g.icon}</span>
                  <span className="text-xs" style={{ color: 'rgba(184,184,208,0.7)', fontFamily: 'Inter' }}>{g.name}</span>
                </div>
                <span
                  className="text-xs font-semibold"
                  style={{
                    fontFamily: 'Rajdhani',
                    letterSpacing: '0.08em',
                    color: g.active ? '#00ff88' : 'rgba(184,184,208,0.2)',
                    filter: g.active ? 'drop-shadow(0 0 4px rgba(0,255,136,0.5))' : 'none',
                  }}
                >
                  {g.active ? t('common.active') : t('common.coming_soon')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick status */}
        <div className="card space-y-3">
          <p className="section-title">{t('dashboard.health_title')}</p>
          {[
            { label: 'CPU',                         val: s?.cpu_percent,  unit: '%',  base: 'cyan' as AccentColor },
            { label: t('dashboard.memory'),          val: s?.ram_percent,  unit: '%',  base: 'violet' as AccentColor },
            { label: t('dashboard.storage'),         val: s?.disk_percent, unit: '%',  base: 'cyan' as AccentColor },
          ].map(({ label, val, unit, base }) => {
            const acc = autoAccent(val, base)
            const a = ACCENT[acc]
            return (
              <div key={label} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'rgba(184,184,208,0.5)', fontFamily: 'Rajdhani', letterSpacing: '0.08em' }}>
                    {label.toUpperCase()}
                  </span>
                  <span className="font-mono text-xs font-bold" style={{ color: a.hex }}>
                    {val !== undefined ? `${val.toFixed(0)}${unit}` : '—'}
                  </span>
                </div>
                <div className="progress-track">
                  <div className={`${a.bar} progress-fill`} style={{ width: `${Math.min(val ?? 0, 100)}%` }} />
                </div>
              </div>
            )
          })}

          <div className="divider my-1" />

          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'rgba(184,184,208,0.4)', fontFamily: 'Rajdhani', letterSpacing: '0.08em' }}>
              {t('dashboard.avg_ping')}
            </span>
            <span className="font-mono text-sm font-bold"
              style={{ color: s?.ping_ms != null ? (s.ping_ms > 80 ? '#ff3366' : '#00ff88') : 'rgba(184,184,208,0.3)' }}>
              {s?.ping_ms != null ? `${s.ping_ms.toFixed(0)} ms` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Resumo da última sessão */}
      {session && (
        <div className="card-glow space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy size={13} style={{ color: '#AEEAF8' }} />
              <p className="section-title">Resumo da Sessão — {session.game?.toUpperCase()}</p>
            </div>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.72rem', color: 'rgba(174,234,248,0.5)' }}>
              {session.duration_min.toFixed(0)} min
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'CPU Média',  val: session.cpu?.avg,  max: session.cpu?.max,  unit: '%',  color: '#AEEAF8' },
              { label: 'RAM Média',  val: session.ram?.avg,  max: session.ram?.max,  unit: '%',  color: '#9061CE' },
              { label: 'Ping Médio', val: session.ping?.avg, max: session.ping?.max, unit: 'ms',
                color: session.ping?.avg != null ? (session.ping.avg > 80 ? '#ff3366' : '#00ff88') : '#AEEAF8' },
            ].map(({ label, val, max, unit, color }) => (
              <div key={label} className="text-center space-y-0.5">
                <p style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', letterSpacing: '0.14em', color: 'rgba(200,204,232,0.4)' }}>
                  {label.toUpperCase()}
                </p>
                <p style={{ fontFamily: 'JetBrains Mono', fontSize: '1.4rem', fontWeight: 700, color, lineHeight: 1 }}>
                  {val != null ? val.toFixed(0) : '—'}<span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{unit}</span>
                </p>
                {max != null && (
                  <p style={{ fontFamily: 'Rajdhani', fontSize: '0.58rem', color: 'rgba(200,204,232,0.3)', letterSpacing: '0.08em' }}>
                    PICO {max.toFixed(0)}{unit}
                  </p>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => setSession(null)}
            className="text-xs w-full text-center"
            style={{ color: 'rgba(200,204,232,0.2)', fontFamily: 'Rajdhani', letterSpacing: '0.1em' }}>
            {t('common.close')}
          </button>
        </div>
      )}
    </div>
  )
}
