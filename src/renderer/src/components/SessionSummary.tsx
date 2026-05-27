import { useTranslation } from 'react-i18next'
import { X, Cpu, Wifi, Thermometer, MemoryStick, Zap, ChevronRight, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface StatBlock { avg: number; max: number; min: number }

export interface SessionSummaryData {
  game:            string
  game_name:       string
  duration_min:    number
  cpu:             StatBlock | null
  ram:             StatBlock | null
  ping:            StatBlock | null
  gpu_temp:        StatBlock | null
  grade:           'A' | 'B' | 'C' | 'D'
  recommendations: string[]
  sample_count:    number
}

function gradeColor(g: string) {
  if (g === 'A') return '#00ff88'
  if (g === 'B') return '#AEEAF8'
  if (g === 'C') return '#ffd60a'
  return '#ff3366'
}

function MetricChip({
  icon: Icon, label, value, unit, warn
}: {
  icon: React.ElementType
  label: string
  value: string
  unit: string
  warn?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5 rounded-xl"
      style={{
        background: warn ? 'rgba(255,214,10,0.06)' : 'rgba(6,36,95,0.4)',
        border: `1px solid ${warn ? 'rgba(255,214,10,0.15)' : 'rgba(28,115,191,0.12)'}`,
        minWidth: '90px',
      }}>
      <div className="flex items-center gap-1.5">
        <Icon size={10} style={{ color: warn ? '#ffd60a' : 'rgba(174,234,248,0.5)' }} />
        <span style={{ fontFamily: 'Rajdhani', fontSize: '0.58rem', letterSpacing: '0.1em', color: 'rgba(184,184,208,0.4)' }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '1rem', fontWeight: 700, color: warn ? '#ffd60a' : '#e0e0f0' }}>
          {value}
        </span>
        <span style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', color: 'rgba(184,184,208,0.35)' }}>{unit}</span>
      </div>
    </div>
  )
}

export default function SessionSummary({
  data,
  onClose,
}: {
  data: SessionSummaryData
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const gc = gradeColor(data.grade)

  const dMin  = Math.floor(data.duration_min)
  const dSec  = Math.round((data.duration_min - dMin) * 60)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(1,7,35,0.85)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="relative flex flex-col rounded-2xl overflow-hidden"
        style={{
          width: '480px',
          maxHeight: '88vh',
          background: 'linear-gradient(160deg, rgba(6,20,60,0.98) 0%, rgba(2,10,40,0.99) 100%)',
          border: '1px solid rgba(28,115,191,0.18)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(28,115,191,0.1)' }}>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: `${gc}15`, border: `1px solid ${gc}30` }}>
              <Star size={12} style={{ color: gc }} />
            </div>
            <div>
              <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.16em', color: 'rgba(184,184,208,0.5)' }}>
                {t('session.title')}
              </p>
              <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.06em', color: '#e0e0f0', lineHeight: 1.1 }}>
                {data.game_name}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'rgba(184,184,208,0.05)', border: '1px solid rgba(184,184,208,0.08)' }}>
            <X size={13} style={{ color: 'rgba(184,184,208,0.4)' }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Grade + duration */}
          <div className="flex items-center gap-4">
            {/* Grade circle */}
            <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl shrink-0"
              style={{ background: `${gc}10`, border: `2px solid ${gc}30` }}>
              <span style={{ fontFamily: 'Rajdhani', fontWeight: 900, fontSize: '2rem', color: gc, lineHeight: 1 }}>
                {data.grade}
              </span>
            </div>
            <div className="flex-1">
              <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.78rem', color: gc, letterSpacing: '0.04em' }}>
                {t(`session.grade_desc.${data.grade}`)}
              </p>
              <p style={{ fontFamily: 'JetBrains Mono', fontSize: '0.7rem', color: 'rgba(184,184,208,0.4)', marginTop: '4px' }}>
                {dMin}min {dSec}s &nbsp;·&nbsp; {t('session.samples', { count: data.sample_count })}
              </p>
            </div>
          </div>

          {/* Metrics */}
          <div>
            <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.14em', color: 'rgba(184,184,208,0.35)', marginBottom: '8px' }}>
              {t('session.performance')}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.cpu && (
                <MetricChip icon={Cpu} label={t('session.avg_cpu')}
                  value={data.cpu.avg.toFixed(0)} unit="%"
                  warn={data.cpu.avg > 80} />
              )}
              {data.ram && (
                <MetricChip icon={MemoryStick} label={t('session.peak_ram')}
                  value={data.ram.max.toFixed(0)} unit="%"
                  warn={data.ram.max > 85} />
              )}
              {data.ping && (
                <MetricChip icon={Wifi} label={t('session.avg_ping')}
                  value={data.ping.avg.toFixed(0)} unit="ms"
                  warn={data.ping.avg > 60} />
              )}
              {data.gpu_temp && (
                <MetricChip icon={Thermometer} label={t('session.max_temp')}
                  value={data.gpu_temp.max.toFixed(0)} unit="°C"
                  warn={data.gpu_temp.max > 82} />
              )}
            </div>
          </div>

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div>
              <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.14em', color: 'rgba(174,234,248,0.4)', marginBottom: '8px' }}>
                {t('session.recommendations')}
              </p>
              <div className="space-y-2">
                {data.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(6,36,95,0.3)', border: '1px solid rgba(28,115,191,0.1)' }}>
                    <ChevronRight size={11} className="mt-0.5 shrink-0" style={{ color: '#AEEAF8' }} />
                    <span style={{ fontFamily: 'Inter', fontSize: '0.72rem', color: 'rgba(184,184,208,0.7)', lineHeight: 1.5 }}>
                      {rec}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4"
          style={{ borderTop: '1px solid rgba(28,115,191,0.1)' }}>
          <button
            onClick={() => { onClose(); navigate('/diagnosis') }}
            className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5"
            style={{ fontSize: '0.72rem', letterSpacing: '0.1em', fontFamily: 'Rajdhani', fontWeight: 700 }}
          >
            <Zap size={13} />
            {t('session.optimize_next')}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm transition-colors"
            style={{
              fontFamily: 'Rajdhani', fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.08em',
              background: 'rgba(184,184,208,0.05)',
              border: '1px solid rgba(184,184,208,0.1)',
              color: 'rgba(184,184,208,0.5)',
            }}
          >
            {t('session.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
