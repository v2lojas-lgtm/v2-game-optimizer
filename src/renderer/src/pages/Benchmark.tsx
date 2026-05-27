import { useState, useEffect } from 'react'
import { BarChart2, Play, Cpu, HardDrive, MemoryStick, Activity, Clock } from 'lucide-react'
import { usePython } from '../hooks/usePython'
import { useTranslation } from 'react-i18next'

interface BenchResult {
  cpu:     { score: number; ops_per_sec: number }
  disk:    { read_mbps: number; write_mbps: number }
  ram:     { total_gb: number; available_gb: number; percent: number; speed_mhz: number | null }
  latency: { avg_latency_ms: number; max_latency_ms: number }
  overall_score: number
}

interface HistoryEntry {
  id: number; ts: number; overall: number
  cpu_score: number; disk_read: number; ram_pct: number
}

function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const r = size * 0.38, circ = 2 * Math.PI * r, dash = (score / 100) * circ
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a1a24" strokeWidth={size*0.08} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.08}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }} />
      <text x={size/2} y={size/2 + size*0.07} textAnchor="middle" fill="white"
        fontSize={size*0.22} fontWeight="bold" fontFamily="JetBrains Mono, monospace"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}>
        {score}
      </text>
    </svg>
  )
}

function MetricRow({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-dark-700 last:border-0">
      <div className="p-1.5 bg-dark-700 rounded-lg"><Icon size={14} className="text-brand-400" /></div>
      <div className="flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-medium text-white font-mono">{value}</p>
      </div>
      {sub && <span className="text-xs text-slate-600">{sub}</span>}
    </div>
  )
}

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Benchmark() {
  const { t } = useTranslation()
  const benchQ   = usePython<BenchResult>()
  const historyQ = usePython<HistoryEntry[]>()
  const [started, setStarted] = useState(false)

  useEffect(() => { historyQ.invoke('benchmark_history', { limit: 8 }) }, [])

  const run = async () => {
    setStarted(true)
    await benchQ.invoke('benchmark')
    historyQ.invoke('benchmark_history', { limit: 8 })
  }

  const data = benchQ.data
  const history = historyQ.data ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">{t('benchmark.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('benchmark.subtitle')}</p>
        </div>
        <button onClick={run} disabled={benchQ.loading} className="btn-primary flex items-center gap-2 py-2.5 px-5">
          {benchQ.loading
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('benchmark.running')}</>
            : <><Play size={15} /> {t('benchmark.run')}</>}
        </button>
      </div>

      {benchQ.error && <div className="card border-red-500/20 bg-red-500/5 text-red-400 text-sm">{benchQ.error}</div>}

      {benchQ.loading && (
        <div className="card text-center py-12">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 border-4 border-dark-600 border-t-brand-500 rounded-full animate-spin" />
          </div>
          <p className="text-slate-400 font-medium">Executando testes...</p>
          <p className="text-slate-600 text-sm mt-1">CPU · Disco · RAM · Latência — ~10 segundos</p>
        </div>
      )}

      {data && !benchQ.loading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card col-span-1 flex flex-col items-center justify-center gap-3 py-6">
            <ScoreRing score={data.overall_score} size={110} />
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider">{t('benchmark.overall')}</p>
              <p className={`text-sm font-semibold mt-0.5 ${data.overall_score >= 75 ? 'text-emerald-400' : data.overall_score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {data.overall_score >= 75 ? t('common.excellent') : data.overall_score >= 50 ? t('common.good') : t('common.critical')}
              </p>
            </div>
          </div>

          <div className="card col-span-2 space-y-0">
            <MetricRow icon={Cpu}       label="CPU Single-Thread"      value={`${data.cpu.score} / 100`}        sub={`${(data.cpu.ops_per_sec/1000).toFixed(0)}k ops/s`} />
            <MetricRow icon={HardDrive} label="Disco — Leitura"        value={`${data.disk.read_mbps} MB/s`}    sub={`Escrita: ${data.disk.write_mbps} MB/s`} />
            <MetricRow icon={MemoryStick} label="RAM Disponível"       value={`${data.ram.available_gb} GB`}    sub={data.ram.speed_mhz ? `${data.ram.speed_mhz} MHz` : `Total: ${data.ram.total_gb} GB`} />
            <MetricRow icon={Activity}  label="Latência do Sistema"    value={`${data.latency.avg_latency_ms} ms`} sub={`Max: ${data.latency.max_latency_ms} ms`} />
          </div>

          <div className="card col-span-3 space-y-2">
            <h2 className="text-sm font-semibold text-white">Análise</h2>
            {data.disk.read_mbps < 500  && <p className="text-sm text-amber-400">Disco lento ({data.disk.read_mbps} MB/s) — considere migrar para SSD NVMe</p>}
            {data.disk.read_mbps >= 500 && <p className="text-sm text-emerald-400">Disco rápido ({data.disk.read_mbps} MB/s) — sem gargalo de armazenamento</p>}
            {data.ram.percent > 80      && <p className="text-sm text-red-400">RAM quase cheia ({data.ram.percent}%) — feche aplicativos antes de jogar</p>}
            {data.overall_score >= 75   && <p className="text-sm text-emerald-400">Sistema em ótimas condições para jogos competitivos</p>}
          </div>
        </div>
      )}

      {!started && !benchQ.loading && (
        <div className="card text-center py-10 text-slate-600">
          <BarChart2 size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Clique em "Iniciar Benchmark" para medir o desempenho</p>
        </div>
      )}

      {/* Histórico */}
      {history.length > 0 && (
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-white">{t('benchmark.history')}</h2>
          </div>
          <div className="space-y-0 divide-y divide-dark-700">
            {history.map((h, i) => (
              <div key={h.id} className="flex items-center gap-4 py-2.5 text-sm">
                <span className="text-slate-600 text-xs w-32 shrink-0">{formatTs(h.ts)}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono font-bold text-base ${h.overall >= 75 ? 'text-emerald-400' : h.overall >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                    {h.overall}
                  </span>
                  <span className="text-slate-600 text-xs">/ 100</span>
                </div>
                <span className="text-slate-500 text-xs">CPU {h.cpu_score}/100</span>
                <span className="text-slate-500 text-xs">Disco {h.disk_read?.toFixed(0)} MB/s</span>
                <span className="text-slate-500 text-xs">RAM {h.ram_pct?.toFixed(0)}%</span>
                {i === 0 && <span className="ml-auto text-xs bg-brand-500/15 text-brand-400 px-2 py-0.5 rounded-full">mais recente</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
