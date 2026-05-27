import { useState, useEffect } from 'react'
import { Rocket, CheckCircle, Clock, AlertCircle, Shield, RefreshCw, Timer, Cpu, Wifi, RotateCcw } from 'lucide-react'
import { usePython } from '../hooks/usePython'
import { useTranslation } from 'react-i18next'

interface OptMeta {
  id: string
  label: string
  description: string
  category: 'latencia' | 'sistema' | 'rede'
  impact: 'S' | 'A' | 'B'
  requires_admin: boolean
}

interface OptimizeResult { applied: string[]; skipped: string[]; errors: string[]; warnings?: string[] }

const DEFAULT_SELECTED = new Set([
  'timer_resolution', 'cpu_parking', 'disable_nagle', 'network_throttling',
  'power_mode', 'disable_fullscreen_opts', 'close_processes', 'game_priority', 'flush_dns',
])

const CATEGORIES = [
  { id: 'latencia', label: 'LATÊNCIA',  Icon: Timer, color: '#AEEAF8', glow: 'rgba(174,234,248,0.15)' },
  { id: 'sistema',  label: 'SISTEMA',   Icon: Cpu,   color: '#9061CE', glow: 'rgba(144,97,206,0.15)'  },
  { id: 'rede',     label: 'REDE',      Icon: Wifi,  color: '#00ff88', glow: 'rgba(0,255,136,0.12)'   },
] as const

const IMPACT_CONFIG = {
  S: { label: 'S',  color: '#ffd60a', bg: 'rgba(255,214,10,0.12)',  title: 'Impacto máximo'   },
  A: { label: 'A',  color: '#AEEAF8', bg: 'rgba(174,234,248,0.1)', title: 'Alto impacto'     },
  B: { label: 'B',  color: 'rgba(184,184,208,0.35)', bg: 'rgba(184,184,208,0.06)', title: 'Impacto médio' },
}

function ImpactBadge({ tier }: { tier: 'S' | 'A' | 'B' }) {
  const cfg = IMPACT_CONFIG[tier]
  return (
    <span
      style={{
        fontFamily: 'Rajdhani, sans-serif',
        fontWeight: 700,
        fontSize: '0.65rem',
        letterSpacing: '0.06em',
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}40`,
        borderRadius: '4px',
        padding: '1px 5px',
        lineHeight: 1.4,
        flexShrink: 0,
      }}
      title={cfg.title}
    >
      {cfg.label}
    </span>
  )
}

export default function Optimize() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<string>>(DEFAULT_SELECTED)
  const metaQuery = usePython<OptMeta[]>()
  const runQuery  = usePython<OptimizeResult>()

  useEffect(() => { metaQuery.invoke('optimizations_list') }, [])

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const run = () => runQuery.invoke('optimize', { optimizations: [...selected] })

  const opts = metaQuery.data ?? []

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: opts.filter(o => o.category === cat.id),
  }))

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
            {t('optimize.title')}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(28,115,191,0.65)', fontFamily: 'Rajdhani', letterSpacing: '0.1em' }}>
            {t('optimize.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Contador */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(28,115,191,0.08)', border: '1px solid rgba(28,115,191,0.2)' }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8rem', fontWeight: 700, color: '#AEEAF8' }}>
              {selected.size}
            </span>
            <span style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'rgba(174,234,248,0.5)' }}>
              {t('optimize.selected')}
            </span>
          </div>

          <button
            onClick={run}
            disabled={runQuery.loading || selected.size === 0}
            className="btn-primary flex items-center gap-2 py-2 px-4"
            style={{ fontSize: '0.72rem', letterSpacing: '0.1em', fontFamily: 'Rajdhani', fontWeight: 700 }}
          >
            {runQuery.loading
              ? <><RefreshCw size={13} className="animate-spin" /> {t('optimize.running')}</>
              : <><Rocket size={13} /> {t('optimize.run')}</>
            }
          </button>
        </div>
      </div>

      {/* Restore point badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{
          background: 'rgba(0,255,136,0.04)',
          border: '1px solid rgba(0,255,136,0.12)',
        }}>
        <RotateCcw size={11} style={{ color: 'rgba(0,255,136,0.5)', flexShrink: 0 }} />
        <span style={{ fontFamily: 'Rajdhani', fontSize: '0.65rem', letterSpacing: '0.08em', color: 'rgba(0,255,136,0.5)' }}>
          {t('optimize.restore_note')}
        </span>
      </div>

      {/* Categorias */}
      <div className="space-y-4">
        {grouped.map(({ id, label, Icon, color, glow, items }) => {
          if (items.length === 0 && !metaQuery.loading) return null
          const catSelected = items.filter(o => selected.has(o.id)).length

          return (
            <div key={id} className="space-y-2">
              {/* Category header */}
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-5 h-5 rounded"
                  style={{ background: glow, border: `1px solid ${color}22` }}>
                  <Icon size={10} style={{ color }} />
                </div>
                <span style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 700,
                  fontSize: '0.65rem',
                  letterSpacing: '0.16em',
                  color,
                }}>
                  {label}
                </span>
                {catSelected > 0 && (
                  <span style={{
                    fontFamily: 'JetBrains Mono',
                    fontSize: '0.6rem',
                    color: `${color}80`,
                    marginLeft: '2px',
                  }}>
                    {catSelected}/{items.length}
                  </span>
                )}
                <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${color}20, transparent)` }} />
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                {items.map(opt => {
                  const active = selected.has(opt.id)
                  return (
                    <button
                      key={opt.id}
                      onClick={() => toggle(opt.id)}
                      className="w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all"
                      style={{
                        background: active
                          ? `linear-gradient(135deg, rgba(2,15,41,0.95) 0%, rgba(6,36,95,0.5) 100%)`
                          : 'rgba(2,15,41,0.6)',
                        border: active
                          ? `1px solid ${color}30`
                          : '1px solid rgba(174,234,248,0.05)',
                        boxShadow: active ? `0 2px 16px rgba(0,0,0,0.4)` : 'none',
                      }}
                    >
                      {/* Checkbox */}
                      <div
                        className="mt-0.5 w-4 h-4 rounded shrink-0 flex items-center justify-center transition-all"
                        style={{
                          background: active ? color : 'transparent',
                          border: `1.5px solid ${active ? color : 'rgba(174,234,248,0.2)'}`,
                          boxShadow: active ? `0 0 8px ${color}60` : 'none',
                        }}
                      >
                        {active && (
                          <svg viewBox="0 0 12 12" width="9" height="9">
                            <path d="M2 6l3 3 5-5" stroke="#010723" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p style={{
                            fontFamily: 'Rajdhani, sans-serif',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            letterSpacing: '0.04em',
                            color: active ? '#e0e0f0' : 'rgba(184,184,208,0.45)',
                            lineHeight: 1.2,
                          }}>
                            {opt.label}
                          </p>
                          <ImpactBadge tier={opt.impact} />
                          {opt.requires_admin && (
                            <span style={{
                              display: 'flex', alignItems: 'center', gap: '3px',
                              fontFamily: 'Rajdhani', fontSize: '0.58rem',
                              letterSpacing: '0.08em',
                              color: 'rgba(255,214,10,0.45)',
                            }}>
                              <Shield size={9} /> ADMIN
                            </span>
                          )}
                        </div>
                        <p style={{
                          fontSize: '0.7rem',
                          color: active ? 'rgba(184,184,208,0.5)' : 'rgba(184,184,208,0.25)',
                          fontFamily: 'Inter, sans-serif',
                          lineHeight: 1.4,
                        }}>
                          {opt.description}
                        </p>
                      </div>
                    </button>
                  )
                })}

                {/* Skeleton */}
                {items.length === 0 && metaQuery.loading &&
                  Array.from({ length: id === 'latencia' ? 4 : id === 'sistema' ? 5 : 2 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-xl animate-pulse"
                      style={{ background: 'rgba(6,36,95,0.25)' }} />
                  ))
                }
              </div>
            </div>
          )
        })}
      </div>

      {runQuery.error && (
        <div className="card text-xs" style={{ borderColor: 'rgba(255,51,102,0.2)', color: 'rgba(255,51,102,0.8)' }}>
          {runQuery.error}
        </div>
      )}

      {/* Resultado */}
      {runQuery.data && (
        <div className="card space-y-2" style={{ borderColor: 'rgba(0,255,136,0.1)' }}>
          <div className="flex items-center justify-between mb-1">
            <h2 style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.12em', color: '#e0e0f0' }}>
              {t('optimize.result_title')}
            </h2>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.65rem', color: 'rgba(0,255,136,0.5)' }}>
              {t('optimize.applied_count', { count: runQuery.data.applied.length })}
            </span>
          </div>

          {runQuery.data.applied.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <CheckCircle size={12} className="mt-0.5 shrink-0" style={{ color: '#00ff88' }} />
              <span style={{ color: 'rgba(184,184,208,0.7)', fontFamily: 'Inter' }}>{item}</span>
            </div>
          ))}
          {runQuery.data.skipped.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <Clock size={12} className="mt-0.5 shrink-0" style={{ color: 'rgba(184,184,208,0.3)' }} />
              <span style={{ color: 'rgba(184,184,208,0.3)', fontFamily: 'Inter' }}>{item} — ignorado</span>
            </div>
          ))}
          {(runQuery.data.warnings ?? []).map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <AlertCircle size={12} className="mt-0.5 shrink-0" style={{ color: '#ffd60a' }} />
              <span style={{ color: 'rgba(255,214,10,0.65)', fontFamily: 'Inter' }}>{item}</span>
            </div>
          ))}
          {runQuery.data.errors.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <AlertCircle size={12} className="mt-0.5 shrink-0" style={{ color: '#ff3366' }} />
              <span style={{ color: 'rgba(255,51,102,0.7)', fontFamily: 'Inter' }}>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
