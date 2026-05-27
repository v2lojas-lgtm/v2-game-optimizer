import { useState, useEffect } from 'react'
import {
  ScanSearch, Cpu, MemoryStick, Thermometer, Wifi,
  Settings2, AlertTriangle, Info, RefreshCw, Zap,
  ChevronRight, TrendingUp, Sparkles,
} from 'lucide-react'
import { usePython } from '../hooks/usePython'
import { useTranslation } from 'react-i18next'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiagIssue {
  id: string
  category: 'cpu' | 'ram' | 'thermal' | 'network' | 'system' | 'interference'
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
  fix: string
  impact: string
}

interface DiagResult {
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  grade_label: string
  summary: string
  bottleneck: DiagIssue | null
  issues: DiagIssue[]
  counts: { critical: number; warning: number; info: number }
}

interface SmartResult {
  before: DiagResult
  after: DiagResult
  score_gain: number
  issues_fixed: number
  fixed_issues: DiagIssue[]
  actions_applied: string[]
  actions_errors: string[]
}

interface HistoryRow { id: number; ts: number; score: number; grade: string }

// ── Percentile estimate ───────────────────────────────────────────────────────
// Based on a distribution of gaming PC scores (higher = less common to achieve)
function scorePercentile(score: number): number {
  // Interpolated from typical optimization distributions
  const table: [number, number][] = [
    [0, 0], [30, 12], [45, 25], [55, 40], [65, 55],
    [72, 65], [78, 72], [82, 79], [86, 85], [90, 91],
    [95, 96], [100, 99],
  ]
  for (let i = 1; i < table.length; i++) {
    const [s0, p0] = table[i - 1]
    const [s1, p1] = table[i]
    if (score <= s1) {
      const t = (score - s0) / (s1 - s0)
      return Math.round(p0 + t * (p1 - p0))
    }
  }
  return 99
}

// ── Score gauge ───────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 86) return '#00ff88'
  if (s >= 71) return '#AEEAF8'
  if (s >= 51) return '#ffd60a'
  if (s >= 31) return '#ff6b2b'
  return '#ff3366'
}

function ScoreGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const R = size === 'sm' ? 34 : 46
  const CX = size === 'sm' ? 44 : 60
  const CY = size === 'sm' ? 50 : 68
  const SW = size === 'sm' ? 7 : 9
  const vW = size === 'sm' ? 88 : 120
  const vH = size === 'sm' ? 80 : 110
  const fSz = size === 'sm' ? '18px' : '26px'

  const totalDeg = 240, startDeg = 150
  const toXY = (deg: number): [number, number] => {
    const r = (deg * Math.PI) / 180
    return [CX + R * Math.cos(r), CY + R * Math.sin(r)]
  }
  const [sx, sy] = toXY(startDeg)
  const [ex, ey] = toXY(startDeg + totalDeg)
  const trackPath = `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${R} ${R} 0 1 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`
  const pct = Math.max(0.5, Math.min(99.9, score))
  const pDeg = (pct / 100) * totalDeg
  const [px, py] = toXY(startDeg + pDeg)
  const la = pDeg > 180 ? 1 : 0
  const progressPath = `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${R} ${R} 0 ${la} 1 ${px.toFixed(1)} ${py.toFixed(1)}`
  const col = scoreColor(score)

  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} width={size === 'sm' ? 120 : 160} height={size === 'sm' ? 109 : 150}>
      <path d={trackPath} fill="none" stroke="rgba(174,234,248,0.07)" strokeWidth={SW} strokeLinecap="round" />
      <path d={progressPath} fill="none" stroke={col} strokeWidth={SW} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 5px ${col}cc)` }} />
      <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
        style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, fontSize: fSz, fill: '#fff', letterSpacing: '-1px' }}>
        {score}
      </text>
      {size === 'md' && (
        <text x={CX} y={CY + 19} textAnchor="middle"
          style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: '7.5px', fill: col, letterSpacing: '2.5px' }}>
          GAMING SCORE
        </text>
      )}
    </svg>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const W = 100, H = 28
  const mn = Math.min(...values), mx = Math.max(...values)
  const rng = mx - mn || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - mn) / rng) * (H - 6) - 3
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const lastCol = scoreColor(values[values.length - 1])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      <polyline points={pts} fill="none" stroke={lastCol} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${lastCol}88)` }} />
    </svg>
  )
}

// ── Category / severity metadata ──────────────────────────────────────────────

const CAT_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  cpu:          { icon: Cpu,           label: 'CPU',           color: '#AEEAF8' },
  ram:          { icon: MemoryStick,   label: 'RAM',           color: '#9061CE' },
  thermal:      { icon: Thermometer,   label: 'TEMPERATURA',   color: '#ff6b2b' },
  network:      { icon: Wifi,          label: 'REDE',          color: '#00ff88' },
  system:       { icon: Settings2,     label: 'SISTEMA',       color: '#AEEAF8' },
  interference: { icon: AlertTriangle, label: 'INTERFERÊNCIA', color: '#ffd60a' },
}
const SEV = {
  critical: { color: '#ff3366', bg: 'rgba(255,51,102,0.08)',  border: 'rgba(255,51,102,0.25)',  label: 'CRÍTICO' },
  warning:  { color: '#ffd60a', bg: 'rgba(255,214,10,0.06)', border: 'rgba(255,214,10,0.2)',  label: 'AVISO'   },
  info:     { color: 'rgba(174,234,248,0.45)', bg: 'rgba(174,234,248,0.04)', border: 'rgba(174,234,248,0.1)', label: 'INFO' },
}

function IssueCard({ issue, compact = false }: { issue: DiagIssue; compact?: boolean }) {
  const [exp, setExp] = useState(false)
  const sev = SEV[issue.severity]
  const cat = CAT_META[issue.category] ?? CAT_META.system
  return (
    <button className="w-full text-left rounded-xl transition-all"
      style={{ background: sev.bg, border: `1px solid ${sev.border}`, padding: compact ? '8px 10px' : '10px 12px' }}
      onClick={() => setExp(e => !e)}>
      <div className="flex items-start gap-2.5">
        <div className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: sev.color, boxShadow: `0 0 5px ${sev.color}` }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span style={{ fontFamily: 'Rajdhani', fontWeight: 600, fontSize: compact ? '0.75rem' : '0.8rem', color: '#e0e0f0', letterSpacing: '0.03em' }}>
              {issue.title}
            </span>
            <span style={{ fontFamily: 'Rajdhani', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.1em', color: cat.color, background: `${cat.color}14`, border: `1px solid ${cat.color}25`, borderRadius: '3px', padding: '1px 4px' }}>
              {cat.label}
            </span>
          </div>
          {!compact && (
            <p className="text-xs mt-0.5" style={{ color: 'rgba(184,184,208,0.5)', fontFamily: 'Inter' }}>
              {issue.detail}
            </p>
          )}
          {exp && (
            <div className="mt-2 space-y-1">
              <p className="flex items-start gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter' }}>
                <Zap size={9} className="mt-0.5 shrink-0" style={{ color: sev.color }} />
                <span><span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Impacto: </span>{issue.impact}</span>
              </p>
              <p className="flex items-start gap-1 text-xs" style={{ color: 'rgba(0,255,136,0.7)', fontFamily: 'Inter' }}>
                <ChevronRight size={9} className="mt-0.5 shrink-0" style={{ color: '#00ff88' }} />
                <span><span style={{ color: '#00ff88', fontWeight: 600 }}>Fix: </span>{issue.fix}</span>
              </p>
            </div>
          )}
        </div>
        <ChevronRight size={11} style={{ color: 'rgba(174,234,248,0.2)', transform: exp ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, marginTop: 3 }} />
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Mode = 'idle' | 'diagnosing' | 'diagnosed' | 'smart_running' | 'smart_done'

export default function Diagnosis() {
  const { t } = useTranslation()
  const diagQuery  = usePython<DiagResult>()
  const smartQuery = usePython<SmartResult>()
  const histQuery  = usePython<HistoryRow[]>()
  const [mode, setMode] = useState<Mode>('idle')

  useEffect(() => {
    histQuery.invoke('diagnosis_history', { limit: 7 })
  }, [])

  const runDiagnosis = () => {
    setMode('diagnosing')
    diagQuery.invoke('run_diagnosis').then(() => setMode('diagnosed'))
  }

  const runSmartOptimize = () => {
    setMode('smart_running')
    smartQuery.invoke('run_smart_optimize').then(() => {
      setMode('smart_done')
      // Refresh history
      histQuery.invoke('diagnosis_history', { limit: 7 })
    })
  }

  const d     = diagQuery.data
  const smart = smartQuery.data
  const hist  = histQuery.data ?? []
  const histScores = [...hist].reverse().map(h => h.score)

  // Consistency delta: today vs yesterday
  const consistencyDelta = hist.length >= 2 ? hist[0].score - hist[1].score : null
  const todayScore       = hist.length > 0 ? hist[0].score : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '1.4rem', letterSpacing: '0.06em', color: '#e0e0f0' }}>
            {t('diagnosis.title')}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(28,115,191,0.65)', fontFamily: 'Rajdhani', letterSpacing: '0.1em' }}>
            DETECTA A CAUSA RAIZ · AUTO-FIX COM COMPARATIVO
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runDiagnosis}
            disabled={mode === 'diagnosing' || mode === 'smart_running'}
            className="flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all"
            style={{
              fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.1em',
              color: 'rgba(174,234,248,0.6)', background: 'rgba(28,115,191,0.08)',
              border: '1px solid rgba(28,115,191,0.2)',
            }}>
            <ScanSearch size={12} /> {t('diagnosis.run')}
          </button>
          <button onClick={runSmartOptimize}
            disabled={mode === 'diagnosing' || mode === 'smart_running'}
            className="btn-primary flex items-center gap-2 py-2 px-4"
            style={{ fontSize: '0.72rem', letterSpacing: '0.1em', fontFamily: 'Rajdhani', fontWeight: 700 }}>
            {mode === 'smart_running'
              ? <><RefreshCw size={13} className="animate-spin" /> {t('diagnosis.smart_running')}</>
              : <><Sparkles size={13} /> {t('diagnosis.smart_run')}</>
            }
          </button>
        </div>
      </div>

      {/* Daily consistency bar */}
      {(hist.length > 0 || histScores.length > 1) && (
        <div className="flex items-center gap-4 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(2,15,41,0.6)', border: '1px solid rgba(174,234,248,0.06)' }}>
          <div className="space-y-0.5">
            <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.14em', color: 'rgba(174,234,248,0.4)' }}>
              CONSISTÊNCIA
            </p>
            {todayScore !== null && (
              <div className="flex items-center gap-1.5">
                <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: '1.1rem', color: scoreColor(todayScore), lineHeight: 1 }}>
                  {todayScore}
                </span>
                {consistencyDelta !== null && (
                  <span style={{
                    fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.08em',
                    color: consistencyDelta >= 0 ? '#00ff88' : '#ff3366',
                  }}>
                    {consistencyDelta >= 0 ? '+' : ''}{consistencyDelta} {t('diagnosis.vs_yesterday')}
                  </span>
                )}
              </div>
            )}
          </div>
          {histScores.length >= 2 && <Sparkline values={histScores} />}
          <div className="flex-1" />
          {hist.length >= 2 && (() => {
            const avg = Math.round(hist.reduce((s, h) => s + h.score, 0) / hist.length)
            const today = hist[0].score
            const diff  = today - avg
            return (
              <p style={{ fontFamily: 'Inter', fontSize: '0.68rem', color: 'rgba(184,184,208,0.45)', textAlign: 'right' }}>
                {Math.abs(diff) < 3 ? t('diagnosis.consistency') :
                  diff > 0 ? t('diagnosis.above_weekly', { pts: diff }) : t('diagnosis.below_weekly', { pts: Math.abs(diff) })}
              </p>
            )
          })()}
        </div>
      )}

      {/* Smart optimize — loading */}
      {mode === 'smart_running' && (
        <div className="card flex flex-col items-center gap-4 py-8"
          style={{ borderColor: 'rgba(28,115,191,0.12)' }}>
          <div className="relative">
            <div className="animate-spin rounded-full" style={{ width: 36, height: 36, border: '2px solid rgba(28,115,191,0.1)', borderTopColor: '#1C73BF' }} />
            <Sparkles size={14} className="absolute inset-0 m-auto" style={{ color: '#AEEAF8' }} />
          </div>
          <div className="space-y-1 text-center">
            <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.12em', color: '#AEEAF8' }}>
              MEDINDO E OTIMIZANDO
            </p>
            <p style={{ fontFamily: 'Inter', fontSize: '0.7rem', color: 'rgba(184,184,208,0.4)' }}>
              Diagnóstico → Aplicando correções → Re-medindo...
            </p>
          </div>
        </div>
      )}

      {/* Smart optimize — before/after result */}
      {mode === 'smart_done' && smart && (
        <div className="space-y-3">
          {/* Score comparison */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(174,234,248,0.08)' }}>
            <div className="grid grid-cols-[1fr_auto_1fr]"
              style={{ background: 'linear-gradient(135deg, rgba(2,15,41,0.98) 0%, rgba(6,36,95,0.4) 100%)' }}>
              {/* Before */}
              <div className="flex flex-col items-center py-4 px-3">
                <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.14em', color: 'rgba(184,184,208,0.35)' }}>ANTES</p>
                <ScoreGauge score={smart.before.score} size="sm" />
                <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.08em', color: scoreColor(smart.before.score) }}>
                  {smart.before.grade} · {smart.before.grade_label}
                </p>
              </div>
              {/* Delta */}
              <div className="flex flex-col items-center justify-center px-2 gap-1">
                <div className="flex items-center gap-1">
                  <TrendingUp size={14} style={{ color: smart.score_gain >= 0 ? '#00ff88' : '#ff3366' }} />
                  <span style={{
                    fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: '1.4rem',
                    color: smart.score_gain >= 0 ? '#00ff88' : '#ff3366',
                    filter: `drop-shadow(0 0 8px ${smart.score_gain >= 0 ? '#00ff88' : '#ff3366'}88)`,
                  }}>
                    {smart.score_gain >= 0 ? '+' : ''}{smart.score_gain}
                  </span>
                </div>
                {smart.issues_fixed > 0 && (
                  <span style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.1em', color: 'rgba(0,255,136,0.6)' }}>
                    {smart.issues_fixed} RESOLVIDO{smart.issues_fixed > 1 ? 'S' : ''}
                  </span>
                )}
              </div>
              {/* After */}
              <div className="flex flex-col items-center py-4 px-3">
                <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.14em', color: 'rgba(0,255,136,0.5)' }}>DEPOIS</p>
                <ScoreGauge score={smart.after.score} size="sm" />
                <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.08em', color: scoreColor(smart.after.score) }}>
                  {smart.after.grade} · {smart.after.grade_label}
                </p>
                <p style={{ fontFamily: 'Rajdhani', fontSize: '0.58rem', letterSpacing: '0.08em', color: 'rgba(0,255,136,0.5)', marginTop: '3px' }}>
                  TOP {100 - scorePercentile(smart.after.score)}%
                </p>
              </div>
            </div>
            {/* Applied actions */}
            {smart.actions_applied.length > 0 && (
              <div className="px-4 py-3 space-y-1" style={{ borderTop: '1px solid rgba(174,234,248,0.06)' }}>
                <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.58rem', letterSpacing: '0.14em', color: 'rgba(0,255,136,0.4)' }}>
                  OTIMIZAÇÕES APLICADAS
                </p>
                {smart.actions_applied.map((a, i) => (
                  <p key={i} className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(184,184,208,0.5)', fontFamily: 'Inter' }}>
                    <span style={{ color: '#00ff88', fontSize: '0.6rem' }}>✓</span> {a}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Remaining issues */}
          {smart.after.issues.length > 0 && (
            <div className="space-y-2">
              <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.14em', color: 'rgba(174,234,248,0.35)' }}>
                PROBLEMAS RESTANTES (REQUEREM AÇÃO MANUAL)
              </p>
              {smart.after.issues.map(i => <IssueCard key={i.id} issue={i} compact />)}
            </div>
          )}
        </div>
      )}

      {/* Regular diagnosis — loading */}
      {mode === 'diagnosing' && (
        <div className="card flex flex-col items-center gap-4 py-8">
          <div className="animate-spin rounded-full" style={{ width: 32, height: 32, border: '2px solid rgba(28,115,191,0.1)', borderTopColor: '#1C73BF' }} />
          <div className="space-y-1 text-center">
            <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.12em', color: '#AEEAF8' }}>ANALISANDO SISTEMA</p>
            <p style={{ fontFamily: 'Inter', fontSize: '0.7rem', color: 'rgba(184,184,208,0.4)' }}>CPU, RAM, rede, configurações e interferências...</p>
          </div>
        </div>
      )}

      {/* Regular diagnosis result */}
      {mode === 'diagnosed' && d && (
        <>
          <div className="grid grid-cols-[auto_1fr] gap-3">
            {/* Gauge */}
            <div className="flex flex-col items-center justify-center rounded-xl px-4 py-3"
              style={{ background: 'linear-gradient(135deg,rgba(2,15,41,.95) 0%,rgba(6,36,95,.4) 100%)', border: `1px solid ${scoreColor(d.score)}20`, minWidth: 160 }}>
              <ScoreGauge score={d.score} />
              <div className="flex items-center gap-2 mt-1">
                <span style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.06em', color: scoreColor(d.score), filter: `drop-shadow(0 0 8px ${scoreColor(d.score)})` }}>{d.grade}</span>
                <span style={{ fontFamily: 'Rajdhani', fontSize: '0.7rem', letterSpacing: '0.1em', color: 'rgba(184,184,208,0.5)' }}>{d.grade_label.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {d.counts.critical > 0 && <span style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', letterSpacing: '0.08em', color: '#ff3366' }}>{d.counts.critical} CRÍTICO{d.counts.critical > 1 ? 'S' : ''}</span>}
                {d.counts.warning  > 0 && <span style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', letterSpacing: '0.08em', color: '#ffd60a' }}>{d.counts.warning} AVISO{d.counts.warning > 1 ? 'S' : ''}</span>}
                {d.counts.critical === 0 && d.counts.warning === 0 && <span style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', color: 'rgba(0,255,136,0.6)' }}>TUDO OK</span>}
              </div>
              {/* Percentile */}
              <div className="mt-2 px-2 py-1 rounded-lg" style={{ background: 'rgba(174,234,248,0.04)', border: '1px solid rgba(174,234,248,0.08)' }}>
                <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.1em', color: scoreColor(d.score), textAlign: 'center' }}>
                  TOP {100 - scorePercentile(d.score)}%
                </p>
                <p style={{ fontFamily: 'Rajdhani', fontSize: '0.55rem', letterSpacing: '0.06em', color: 'rgba(184,184,208,0.3)', textAlign: 'center' }}>
                  MELHOR QUE {scorePercentile(d.score)}%
                </p>
              </div>
            </div>
            {/* Summary + bottleneck */}
            <div className="space-y-2.5">
              <div className="rounded-xl px-4 py-3" style={{ background: 'linear-gradient(135deg,rgba(2,15,41,.95) 0%,rgba(6,36,95,.4) 100%)', border: '1px solid rgba(174,234,248,0.07)' }}>
                <p style={{ fontFamily: 'Rajdhani', fontSize: '0.62rem', letterSpacing: '0.14em', color: 'rgba(174,234,248,0.4)' }}>DIAGNÓSTICO</p>
                <p className="mt-1" style={{ fontFamily: 'Inter', fontSize: '0.78rem', color: 'rgba(224,224,240,0.85)', lineHeight: 1.5 }}>{d.summary}</p>
              </div>
              {d.bottleneck && (() => {
                const bn = d.bottleneck!, sev = SEV[bn.severity], cat = CAT_META[bn.category] ?? CAT_META.system
                const BnIcon = cat.icon
                return (
                  <div className="rounded-xl px-4 py-3 space-y-1.5" style={{ background: `${sev.color}08`, border: `1px solid ${sev.color}25` }}>
                    <div className="flex items-center gap-1.5">
                      <BnIcon size={10} style={{ color: sev.color }} />
                      <span style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.14em', color: sev.color }}>GARGALO PRINCIPAL</span>
                    </div>
                    <p style={{ fontFamily: 'Rajdhani', fontWeight: 600, fontSize: '0.82rem', color: '#e0e0f0', letterSpacing: '0.03em' }}>{bn.title}</p>
                    <p style={{ fontFamily: 'Inter', fontSize: '0.7rem', color: 'rgba(184,184,208,0.55)', lineHeight: 1.4 }}>{bn.impact}</p>
                    <p className="flex items-start gap-1" style={{ fontFamily: 'Inter', fontSize: '0.7rem', color: 'rgba(0,255,136,0.65)' }}>
                      <ChevronRight size={10} className="shrink-0 mt-0.5" />{bn.fix}
                    </p>
                  </div>
                )
              })()}
              {d.issues.length === 0 && (
                <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.15)' }}>
                  <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.1em', color: '#00ff88' }}>NENHUM PROBLEMA DETECTADO</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(0,255,136,0.5)', fontFamily: 'Inter' }}>Sistema otimizado para jogo competitivo</p>
                </div>
              )}
            </div>
          </div>

          {d.issues.length > 0 && (
            <div className="space-y-3">
              <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.16em', color: 'rgba(174,234,248,0.35)' }}>
                PROBLEMAS DETECTADOS — CLIQUE PARA DETALHES
              </p>
              <div className="space-y-1.5">
                {(['critical', 'warning', 'info'] as const).flatMap(sev =>
                  d.issues.filter(i => i.severity === sev).map(i => <IssueCard key={i.id} issue={i} />)
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Idle empty state */}
      {mode === 'idle' && !d && !smart && (
        <div className="card flex flex-col items-center gap-4 py-10" style={{ borderColor: 'rgba(28,115,191,0.08)' }}>
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: 'rgba(28,115,191,0.08)', border: '1px solid rgba(28,115,191,0.15)' }}>
            <ScanSearch size={22} style={{ color: 'rgba(174,234,248,0.4)' }} />
          </div>
          <div className="space-y-2 text-center">
            <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.1em', color: 'rgba(184,184,208,0.5)' }}>PRONTO PARA ANALISAR</p>
            <p style={{ fontFamily: 'Inter', fontSize: '0.7rem', color: 'rgba(184,184,208,0.3)', maxWidth: 300 }}>
              Use <strong style={{ color: 'rgba(174,234,248,0.5)' }}>MEDIR & OTIMIZAR</strong> para ver o antes/depois do seu score de uma vez.
            </p>
          </div>
        </div>
      )}

      {/* Re-run hint */}
      {(mode === 'diagnosed' || mode === 'smart_done') && (
        <div className="flex items-center justify-center gap-2">
          <Info size={10} style={{ color: 'rgba(174,234,248,0.2)' }} />
          <span style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'rgba(174,234,248,0.2)' }}>
            {t('diagnosis.run_again')}
          </span>
        </div>
      )}
    </div>
  )
}
