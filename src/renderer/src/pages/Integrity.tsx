import { useState, useEffect } from 'react'
import { Shield, RefreshCw, CheckCircle, AlertTriangle, XCircle, Monitor, Wifi, Eye, Cpu, Clock } from 'lucide-react'
import { usePython } from '../hooks/usePython'
import { useTranslation } from 'react-i18next'

interface CategoryResult {
  score: number
  issues: string[]
}

interface IntegrityData {
  overall: number
  rating: 'EXCELENTE' | 'BOM' | 'ATENÇÃO' | 'SUSPEITO'
  pc:       CategoryResult & { cpu_pct: number; ram_pct: number; temp: number | null }
  network:  CategoryResult & { ping_ms: number | null; jitter_ms: number | null; loss_pct: number }
  software: CategoryResult & { suspicious: string[]; attention: string[] }
  inputs:   CategoryResult & { virtual_devices: string[]; note: string }
  issues:   string[]
}

interface HistoryEntry {
  id: number; ts: number; overall: number
  pc_score: number; network_score: number; software_score: number
}

const RATING_CONFIG = {
  EXCELENTE: { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5',  icon: CheckCircle },
  BOM:       { color: 'text-brand-400',   border: 'border-brand-500/30',   bg: 'bg-brand-500/5',    icon: CheckCircle },
  ATENÇÃO:   { color: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/5',    icon: AlertTriangle },
  SUSPEITO:  { color: 'text-red-400',     border: 'border-red-500/30',     bg: 'bg-red-500/5',      icon: XCircle },
}

function ScoreBar({ label, score, icon: Icon }: { label: string; score: number; icon: React.ElementType }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-brand-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'
  const text  = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-brand-400' : score >= 40 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-slate-500" />
          <span className="text-sm text-slate-400">{label}</span>
        </div>
        <span className={`font-mono text-sm font-semibold ${text}`}>{score}/100</span>
      </div>
      <div className="h-2 bg-dark-600 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  )
}

function BigScore({ score, rating }: { score: number; rating: IntegrityData['rating'] }) {
  const cfg = RATING_CONFIG[rating]
  const r = 54, circ = 2 * Math.PI * r
  const strokeColor = rating === 'EXCELENTE' ? '#10b981' : rating === 'BOM' ? '#0ea5e9' : rating === 'ATENÇÃO' ? '#f59e0b' : '#ef4444'

  return (
    <div className={`card ${cfg.border} ${cfg.bg} flex flex-col items-center justify-center py-8 gap-3`}>
      <div className="relative">
        <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={70} cy={70} r={r} fill="none" stroke="#1a1a24" strokeWidth={10} />
          <circle
            cx={70} cy={70} r={r} fill="none"
            stroke={strokeColor} strokeWidth={10}
            strokeDasharray={`${(score / 100) * circ} ${circ}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1.2s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono text-4xl font-bold ${cfg.color}`}>{score}</span>
          <span className="text-slate-500 text-xs mt-0.5">/ 100</span>
        </div>
      </div>
      <div className="text-center">
        <p className={`text-lg font-bold tracking-wide ${cfg.color}`}>{rating}</p>
        <p className="text-xs text-slate-500 mt-0.5">Competitive Integrity Score</p>
      </div>
    </div>
  )
}

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function scoreColor(s: number) {
  return s >= 75 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : 'text-red-400'
}

export default function Integrity() {
  const { t } = useTranslation()
  const integrityQ = usePython<IntegrityData>()
  const historyQ   = usePython<HistoryEntry[]>()
  const [ran, setRan] = useState(false)

  useEffect(() => { historyQ.invoke('integrity_history', { limit: 8 }) }, [])

  const run = async () => {
    setRan(true)
    await integrityQ.invoke('integrity_score')
    historyQ.invoke('integrity_history', { limit: 8 })
  }

  const data    = integrityQ.data
  const history = historyQ.data ?? []
  const rating  = data?.rating ?? 'BOM'
  const cfg     = RATING_CONFIG[rating]
  const RatingIcon = cfg.icon

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">{t('integrity.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('integrity.subtitle')}</p>
        </div>
        <button onClick={run} disabled={integrityQ.loading} className="btn-primary flex items-center gap-2 py-2.5 px-5">
          {integrityQ.loading
            ? <><RefreshCw size={15} className="animate-spin" /> {t('integrity.running')}</>
            : <><Shield size={15} /> {ran ? t('integrity.rerun') : t('integrity.run')}</>
          }
        </button>
      </div>

      {integrityQ.error && (
        <div className="card border-red-500/20 bg-red-500/5 text-red-400 text-sm">{integrityQ.error}</div>
      )}

      {!ran && !integrityQ.loading && (
        <div className="card text-center py-14 text-slate-600">
          <Shield size={40} className="mx-auto mb-4 opacity-20" />
          <p className="text-sm font-medium">Clique em "Analisar Agora" para verificar a integridade</p>
          <p className="text-xs mt-1 text-slate-700">PC · Rede · Software · Dispositivos de Input</p>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-3 gap-4">
          <BigScore score={data.overall} rating={data.rating} />

          <div className="card col-span-2 space-y-4">
            <h2 className="text-sm font-semibold text-white">Breakdown</h2>
            <ScoreBar label={t('integrity.pc_stability'   )} score={data.pc.score}       icon={Cpu}     />
            <ScoreBar label={t('integrity.network_quality')} score={data.network.score}  icon={Wifi}    />
            <ScoreBar label={t('integrity.software'       )} score={data.software.score} icon={Eye}     />
            <ScoreBar label={t('integrity.input'          )} score={data.inputs.score}   icon={Monitor} />

            <div className="pt-3 border-t border-dark-600 grid grid-cols-3 gap-3 text-xs">
              <div className="text-center">
                <p className="text-slate-500">Ping</p>
                <p className="text-white font-mono font-semibold mt-0.5">
                  {data.network.ping_ms != null ? `${data.network.ping_ms}ms` : '—'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-500">CPU</p>
                <p className="text-white font-mono font-semibold mt-0.5">{data.pc.cpu_pct}%</p>
              </div>
              <div className="text-center">
                <p className="text-slate-500">RAM</p>
                <p className="text-white font-mono font-semibold mt-0.5">{data.pc.ram_pct}%</p>
              </div>
            </div>
          </div>

          {data.issues.length > 0 && (
            <div className="col-span-3 card space-y-2">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <RatingIcon size={14} className={cfg.color} />
                {t('integrity.issues')}
              </h2>
              {data.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-slate-400">{issue}</span>
                </div>
              ))}
            </div>
          )}

          {data.issues.length === 0 && (
            <div className="col-span-3 card border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3">
              <CheckCircle size={18} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-emerald-400 font-medium text-sm">Nenhum problema detectado</p>
                <p className="text-slate-500 text-xs mt-0.5">Sistema em ótimas condições para jogo competitivo</p>
              </div>
            </div>
          )}

          {data.software.suspicious.length > 0 && (
            <div className="col-span-3 card border-red-500/20 bg-red-500/5 space-y-1">
              <p className="text-red-400 font-semibold text-sm">Software suspeito detectado</p>
              {data.software.suspicious.map(s => (
                <p key={s} className="text-xs text-red-300 font-mono">{s}</p>
              ))}
            </div>
          )}

          <div className="col-span-3 text-xs text-slate-600 text-center">{data.inputs.note}</div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-white">{t('integrity.history')}</h2>
          </div>
          <div className="space-y-0 divide-y divide-dark-700">
            {history.map((h, i) => (
              <div key={h.id} className="flex items-center gap-4 py-2.5 text-sm">
                <span className="text-slate-600 text-xs w-32 shrink-0">{formatTs(h.ts)}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono font-bold text-base ${scoreColor(h.overall)}`}>{h.overall}</span>
                  <span className="text-slate-600 text-xs">/ 100</span>
                </div>
                <span className="text-slate-500 text-xs">PC {h.pc_score}/100</span>
                <span className="text-slate-500 text-xs">Rede {h.network_score}/100</span>
                <span className="text-slate-500 text-xs">Software {h.software_score}/100</span>
                {i === 0 && <span className="ml-auto text-xs bg-brand-500/15 text-brand-400 px-2 py-0.5 rounded-full">{t('integrity.latest')}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
