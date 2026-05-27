import { Wifi, Play, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePython } from '../hooks/usePython'

interface BufferbloatResult {
  grade: 'A' | 'B' | 'C' | 'D' | '?'
  baseline_ms: number | null
  loaded_ms: number | null
  increase_ms: number | null
  explanation: string
}

interface ServerPing {
  name: string
  game: string
  host: string
  region: string
  ping_ms: number | null
  quality: 'excellent' | 'good' | 'warning' | 'bad' | 'unreachable'
}

interface GamerNetworkResult {
  ping_ms: number | null
  jitter_ms: number | null
  packet_loss_percent: number
  bufferbloat: BufferbloatResult
  server_pings: ServerPing[]
  quality_score: number
  connection_type: string
  problems: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function netScoreColor(s: number) {
  if (s >= 86) return '#00ff88'
  if (s >= 71) return '#AEEAF8'
  if (s >= 51) return '#ffd60a'
  return '#ff3366'
}

function qualityColor(q: string) {
  if (q === 'excellent') return '#00ff88'
  if (q === 'good')      return '#AEEAF8'
  if (q === 'warning')   return '#ffd60a'
  return '#ff3366'
}

function bbGradeColor(g: string) {
  if (g === 'A') return '#00ff88'
  if (g === 'B') return '#AEEAF8'
  if (g === 'C') return '#ffd60a'
  if (g === 'D') return '#ff3366'
  return 'rgba(184,184,208,0.3)'
}

function MetricBox({
  label, value, unit, sub, color,
}: { label: string; value: string; unit: string; sub?: string; color?: string }) {
  const col = color ?? '#e0e0f0'
  return (
    <div className="flex flex-col gap-1.5 rounded-xl p-3"
      style={{ background: 'rgba(2,15,41,0.8)', border: '1px solid rgba(174,234,248,0.07)' }}>
      <span style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.14em', color: 'rgba(174,234,248,0.4)' }}>
        {label}
      </span>
      <div className="flex items-end gap-1">
        <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: '1.6rem', color: col, lineHeight: 1, filter: `drop-shadow(0 0 8px ${col}55)` }}>
          {value}
        </span>
        <span className="mb-0.5" style={{ fontFamily: 'Rajdhani', fontSize: '0.7rem', color: 'rgba(184,184,208,0.4)' }}>{unit}</span>
      </div>
      {sub && <p style={{ fontFamily: 'Inter', fontSize: '0.65rem', color: 'rgba(184,184,208,0.35)', lineHeight: 1.3 }}>{sub}</p>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Network() {
  const { t } = useTranslation()
  const { data, loading, error, invoke } = usePython<GamerNetworkResult>()

  const run = () => invoke('gamer_network_test')
  const d = data

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '1.4rem', letterSpacing: '0.06em', color: '#e0e0f0' }}>
            {t('network.title')}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(28,115,191,0.65)', fontFamily: 'Rajdhani', letterSpacing: '0.1em' }}>
            {t('network.subtitle')}
          </p>
        </div>
        <button onClick={run} disabled={loading}
          className="btn-primary flex items-center gap-2 py-2 px-4"
          style={{ fontSize: '0.72rem', letterSpacing: '0.1em', fontFamily: 'Rajdhani', fontWeight: 700 }}>
          {loading
            ? <><RefreshCw size={13} className="animate-spin" /> {t('network.diagnosing')}</>
            : <><Play size={13} /> {t('network.start')}</>
          }
        </button>
      </div>

      {error && (
        <div className="card text-xs" style={{ borderColor: 'rgba(255,51,102,0.2)', color: 'rgba(255,51,102,0.8)' }}>{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card flex flex-col items-center gap-3 py-8">
          <div className="animate-spin rounded-full"
            style={{ width: 28, height: 28, border: '2px solid rgba(28,115,191,0.1)', borderTopColor: '#1C73BF' }} />
          <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.12em', color: 'rgba(174,234,248,0.5)' }}>
            MEDINDO PING · BUFFERBLOAT · SERVIDORES...
          </p>
          <p style={{ fontFamily: 'Inter', fontSize: '0.68rem', color: 'rgba(184,184,208,0.3)' }}>
            Pode levar 15–25s — testando latência sob carga simultânea
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !d && !error && (
        <div className="card flex flex-col items-center gap-4 py-10" style={{ borderColor: 'rgba(28,115,191,0.06)' }}>
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl"
            style={{ background: 'rgba(28,115,191,0.07)', border: '1px solid rgba(28,115,191,0.14)' }}>
            <Wifi size={22} style={{ color: 'rgba(174,234,248,0.35)' }} />
          </div>
          <div className="space-y-1 text-center">
            <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.82rem', letterSpacing: '0.1em', color: 'rgba(184,184,208,0.4)' }}>
              DIAGNÓSTICO DE REDE GAMER
            </p>
            <p style={{ fontFamily: 'Inter', fontSize: '0.7rem', color: 'rgba(184,184,208,0.25)', maxWidth: 340 }}>
              Diferente do Speedtest — mede o que realmente importa para hit registration e latência em jogo
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {d && !loading && (
        <>
          {/* Quality score + connection type */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{
              background: `linear-gradient(135deg, rgba(2,15,41,0.95) 0%, rgba(6,36,95,0.4) 100%)`,
              border: `1px solid ${netScoreColor(d.quality_score)}20`,
            }}>
            <div className="flex flex-col items-center gap-0.5 pr-4" style={{ borderRight: '1px solid rgba(174,234,248,0.08)' }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: '2.2rem', lineHeight: 1, color: netScoreColor(d.quality_score), filter: `drop-shadow(0 0 10px ${netScoreColor(d.quality_score)}88)` }}>
                {d.quality_score}
              </span>
              <span style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.58rem', letterSpacing: '0.14em', color: netScoreColor(d.quality_score) }}>
                NET SCORE
              </span>
            </div>
            <div className="flex-1 space-y-1">
              <p style={{ fontFamily: 'Rajdhani', fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.04em', color: '#e0e0f0' }}>
                {d.connection_type}
              </p>
              {d.problems.map((p, i) => (
                <p key={i} className="flex items-start gap-1.5 text-xs" style={{ color: p.includes('saudável') ? 'rgba(0,255,136,0.6)' : 'rgba(255,214,10,0.65)', fontFamily: 'Inter', lineHeight: 1.4 }}>
                  {p.includes('saudável')
                    ? <CheckCircle size={10} className="shrink-0 mt-0.5" style={{ color: '#00ff88' }} />
                    : <AlertTriangle size={10} className="shrink-0 mt-0.5" style={{ color: '#ffd60a' }} />
                  }
                  {p}
                </p>
              ))}
            </div>
          </div>

          {/* Main metrics */}
          <div className="grid grid-cols-3 gap-2.5">
            <MetricBox
              label="PING MÉDIO"
              value={d.ping_ms != null ? d.ping_ms.toFixed(0) : '—'}
              unit="ms"
              sub={d.ping_ms != null ? (d.ping_ms < 30 ? 'Excelente' : d.ping_ms < 60 ? 'Bom' : d.ping_ms < 100 ? 'Elevado' : 'Crítico') : 'Sem resposta'}
              color={d.ping_ms != null ? (d.ping_ms < 30 ? '#00ff88' : d.ping_ms < 60 ? '#AEEAF8' : d.ping_ms < 100 ? '#ffd60a' : '#ff3366') : 'rgba(184,184,208,0.3)'}
            />
            <MetricBox
              label="JITTER"
              value={d.jitter_ms != null ? d.jitter_ms.toFixed(1) : '—'}
              unit="ms"
              sub={d.jitter_ms != null ? (d.jitter_ms < 5 ? 'Estável' : d.jitter_ms < 15 ? 'Aceitável' : 'Instável') : '—'}
              color={d.jitter_ms != null ? (d.jitter_ms < 5 ? '#00ff88' : d.jitter_ms < 15 ? '#AEEAF8' : '#ffd60a') : 'rgba(184,184,208,0.3)'}
            />
            <MetricBox
              label="PERDA PACOTES"
              value={d.packet_loss_percent.toFixed(1)}
              unit="%"
              sub={d.packet_loss_percent === 0 ? 'Nenhuma perda' : d.packet_loss_percent < 2 ? 'Tolerável' : 'Problemático'}
              color={d.packet_loss_percent === 0 ? '#00ff88' : d.packet_loss_percent < 2 ? '#ffd60a' : '#ff3366'}
            />
          </div>

          {/* Bufferbloat */}
          {d.bufferbloat && (
            <div className="rounded-xl p-4 space-y-2"
              style={{
                background: 'rgba(2,15,41,0.8)',
                border: `1px solid ${bbGradeColor(d.bufferbloat.grade)}22`,
              }}>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.14em', color: 'rgba(174,234,248,0.4)' }}>
                    BUFFERBLOAT
                  </p>
                  <p style={{ fontFamily: 'Inter', fontSize: '0.72rem', color: 'rgba(184,184,208,0.6)', lineHeight: 1.4, maxWidth: 360 }}>
                    {d.bufferbloat.explanation}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-0.5 shrink-0 pl-4">
                  <span style={{
                    fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '2rem', lineHeight: 1,
                    color: bbGradeColor(d.bufferbloat.grade),
                    filter: `drop-shadow(0 0 10px ${bbGradeColor(d.bufferbloat.grade)}88)`,
                  }}>
                    {d.bufferbloat.grade}
                  </span>
                  <span style={{ fontFamily: 'Rajdhani', fontSize: '0.55rem', letterSpacing: '0.12em', color: 'rgba(184,184,208,0.3)' }}>
                    GRAU
                  </span>
                </div>
              </div>
              {d.bufferbloat.baseline_ms != null && d.bufferbloat.loaded_ms != null && (
                <div className="flex items-center gap-3 pt-1">
                  <div className="text-center">
                    <p style={{ fontFamily: 'JetBrains Mono', fontSize: '0.9rem', fontWeight: 700, color: '#AEEAF8' }}>
                      {d.bufferbloat.baseline_ms}ms
                    </p>
                    <p style={{ fontFamily: 'Rajdhani', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'rgba(174,234,248,0.35)' }}>IDLE</p>
                  </div>
                  <div style={{ color: 'rgba(184,184,208,0.25)', fontSize: '0.8rem' }}>→</div>
                  <div className="text-center">
                    <p style={{ fontFamily: 'JetBrains Mono', fontSize: '0.9rem', fontWeight: 700, color: bbGradeColor(d.bufferbloat.grade) }}>
                      {d.bufferbloat.loaded_ms}ms
                    </p>
                    <p style={{ fontFamily: 'Rajdhani', fontSize: '0.55rem', letterSpacing: '0.1em', color: 'rgba(184,184,208,0.35)' }}>SOB CARGA</p>
                  </div>
                  <div style={{ color: 'rgba(184,184,208,0.25)', fontSize: '0.8rem' }}>·</div>
                  <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.72rem', color: bbGradeColor(d.bufferbloat.grade) }}>
                    +{d.bufferbloat.increase_ms}ms de aumento
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Game server pings */}
          {d.server_pings.length > 0 && (
            <div className="space-y-2">
              <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.16em', color: 'rgba(174,234,248,0.35)' }}>
                {t('network.servers_title')}
              </p>
              <div className="space-y-1.5">
                {d.server_pings.map((s) => {
                  const col = qualityColor(s.quality)
                  const pct = s.ping_ms != null ? Math.min((s.ping_ms / 150) * 100, 100) : 0
                  return (
                    <div key={s.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(2,15,41,0.7)', border: '1px solid rgba(174,234,248,0.05)' }}>
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col, boxShadow: `0 0 5px ${col}` }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span style={{ fontFamily: 'Rajdhani', fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.04em', color: 'rgba(224,224,240,0.75)' }}>
                            {s.name}
                          </span>
                          <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: '0.75rem', color: col, flexShrink: 0 }}>
                            {s.ping_ms != null ? `${s.ping_ms}ms` : '—'}
                          </span>
                        </div>
                        {/* Mini bar */}
                        <div className="mt-1 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(174,234,248,0.06)' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: '9999px', transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                      <span style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', letterSpacing: '0.08em', color: 'rgba(184,184,208,0.3)', flexShrink: 0 }}>
                        {s.region}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
