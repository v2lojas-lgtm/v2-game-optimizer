import { useEffect, useState, useRef } from 'react'

interface QuickStats {
  cpu_percent: number
  cpu_temp:    number | null
  ram_percent: number
  ping_ms:     number | null
  gpu_temp:    number | null
  gpu_usage:   number | null
}

// ── History buffers ───────────────────────────────────────────────────────────

const CPU_HISTORY_MAX  = 24
const PING_HISTORY_MAX = 12

// ── Mini bar sparkline ────────────────────────────────────────────────────────

function HistoryBars({
  values, max = 100, dangerThreshold = 85, warnThreshold = 65,
  width = 60, height = 14,
}: {
  values: number[]
  max?: number
  dangerThreshold?: number
  warnThreshold?: number
  width?: number
  height?: number
}) {
  if (values.length === 0) return null
  const count  = values.length
  const barW   = Math.max(1, Math.floor((width - count * 0.5) / count))
  const gap    = 0.5

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: 'block' }}>
      {values.map((v, i) => {
        const pct  = Math.min(v / max, 1)
        const h    = Math.max(1, pct * height)
        const x    = i * (barW + gap)
        const y    = height - h
        const col  = v >= dangerThreshold ? '#ff3366'
                   : v >= warnThreshold   ? '#ffd60a'
                   : '#00ff88'
        const isLast = i === values.length - 1
        return (
          <rect
            key={i}
            x={x} y={y}
            width={barW} height={h}
            rx="0.5"
            fill={col}
            opacity={isLast ? 1 : 0.25 + (i / values.length) * 0.75}
          />
        )
      })}
    </svg>
  )
}

// ── Ping dots ─────────────────────────────────────────────────────────────────

function PingDots({ values }: { values: (number | null)[] }) {
  return (
    <div className="flex items-center gap-0.5">
      {values.map((v, i) => {
        const col = v == null ? 'rgba(255,255,255,0.08)'
                  : v < 50   ? '#00ff88'
                  : v < 100  ? '#ffd60a'
                  : '#ff3366'
        const isLast = i === values.length - 1
        return (
          <div key={i}
            style={{
              width: 4, height: 4,
              borderRadius: '50%',
              background: col,
              opacity: isLast ? 1 : 0.3 + (i / values.length) * 0.7,
            }} />
        )
      })}
    </div>
  )
}

// ── Simple stat row ───────────────────────────────────────────────────────────

function StatRow({ label, value, unit, barValue, barColor }: {
  label: string; value: string; unit: string; barValue?: number; barColor?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '9px', width: '26px', flexShrink: 0, fontFamily: 'monospace' }}>
        {label}
      </span>
      {barValue !== undefined && barColor ? (
        <div className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ width: `${Math.min(barValue, 100)}%`, height: '100%', background: barColor, borderRadius: '9999px', transition: 'width 0.5s ease' }} />
        </div>
      ) : (
        <div className="flex-1" />
      )}
      <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, width: '46px', textAlign: 'right', flexShrink: 0 }}>
        {value}<span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9px', marginLeft: '1px' }}>{unit}</span>
      </span>
    </div>
  )
}

function statBarColor(pct: number): string {
  if (pct > 85) return '#ff3366'
  if (pct > 65) return '#ffd60a'
  return '#00ff88'
}

// ── Overlay page ──────────────────────────────────────────────────────────────

export default function OverlayPage() {
  const [stats, setStats]               = useState<QuickStats | null>(null)
  const [cpuHistory, setCpuHistory]     = useState<number[]>([])
  const [pingHistory, setPingHistory]   = useState<(number | null)[]>([])
  const [_dragging, setDragging]        = useState(false)
  const dragStart = useRef<{ mx: number; my: number } | null>(null)

  useEffect(() => {
    if (!window.api?.overlay?.onStats) return
    const unsub = window.api.overlay.onStats((data) => {
      const s = data as QuickStats
      setStats(s)

      setCpuHistory(prev => {
        const next = [...prev, s.cpu_percent]
        return next.length > CPU_HISTORY_MAX ? next.slice(-CPU_HISTORY_MAX) : next
      })
      setPingHistory(prev => {
        const next = [...prev, s.ping_ms ?? null]
        return next.length > PING_HISTORY_MAX ? next.slice(-PING_HISTORY_MAX) : next
      })
    })
    return unsub
  }, [])

  // Drag to reposition overlay window
  const onMouseDown = (e: React.MouseEvent) => {
    window.api?.overlay?.setClickThrough(false)
    setDragging(true)
    dragStart.current = { mx: e.screenX, my: e.screenY }

    const onMove = (ev: MouseEvent) => {
      if (!dragStart.current) return
      const dx = ev.screenX - dragStart.current.mx
      const dy = ev.screenY - dragStart.current.my
      dragStart.current = { mx: ev.screenX, my: ev.screenY }
      window.api?.overlay?.move(Math.round(window.screenX + dx), Math.round(window.screenY + dy))
    }
    const onUp = () => {
      setDragging(false)
      dragStart.current = null
      window.api?.overlay?.setClickThrough(true)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const cpu  = stats?.cpu_percent ?? 0
  const ram  = stats?.ram_percent ?? 0
  const ping = stats?.ping_ms

  return (
    <div className="w-full h-full flex flex-col" style={{ background: 'transparent', userSelect: 'none' }}>
      {/* Drag handle */}
      <div onMouseDown={onMouseDown}
        className="flex items-center justify-between px-2.5 pt-2 pb-1 cursor-move"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)', letterSpacing: '3px', fontFamily: 'monospace', textTransform: 'uppercase' }}>
          V2
        </span>
        <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: stats ? '#00ff88' : 'rgba(255,255,255,0.15)', boxShadow: stats ? '0 0 4px #00ff88' : 'none' }} />
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-1.5 px-2.5 pb-1.5">
        <StatRow label="CPU" value={cpu.toFixed(0)} unit="%" barValue={cpu} barColor={statBarColor(cpu)} />

        {stats?.cpu_temp != null && (
          <StatRow label="TMP" value={stats.cpu_temp.toFixed(0)} unit="°C"
            barValue={(stats.cpu_temp / 100) * 100} barColor={statBarColor(stats.cpu_temp)} />
        )}

        <StatRow label="RAM" value={ram.toFixed(0)} unit="%" barValue={ram} barColor={statBarColor(ram)} />

        {stats?.gpu_usage != null && (
          <StatRow label="GPU" value={stats.gpu_usage.toFixed(0)} unit="%"
            barValue={stats.gpu_usage} barColor={statBarColor(stats.gpu_usage)} />
        )}

        {stats?.gpu_temp != null && (
          <StatRow label="GPU°" value={stats.gpu_temp.toFixed(0)} unit="°C"
            barValue={(stats.gpu_temp / 100) * 100} barColor={statBarColor(stats.gpu_temp)} />
        )}

        <StatRow
          label="PING"
          value={ping != null ? ping.toFixed(0) : '—'}
          unit="ms"
          barValue={ping != null ? Math.min((ping / 150) * 100, 100) : 0}
          barColor={ping == null ? 'rgba(255,255,255,0.12)' : ping < 50 ? '#00ff88' : ping < 100 ? '#ffd60a' : '#ff3366'}
        />
      </div>

      {/* CPU history sparkline */}
      {cpuHistory.length >= 4 && (
        <div className="px-2.5 pb-1">
          <div className="flex items-center justify-between mb-0.5">
            <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.18)', letterSpacing: '2px', fontFamily: 'monospace' }}>CPU HIST</span>
          </div>
          <HistoryBars values={cpuHistory} max={100} dangerThreshold={85} warnThreshold={65} width={62} height={13} />
        </div>
      )}

      {/* Ping stability dots */}
      {pingHistory.filter(v => v !== null).length >= 3 && (
        <div className="px-2.5 pb-2">
          <div className="flex items-center justify-between mb-0.5">
            <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.18)', letterSpacing: '2px', fontFamily: 'monospace' }}>NET</span>
          </div>
          <PingDots values={pingHistory} />
        </div>
      )}
    </div>
  )
}
