import { useEffect, useState } from 'react'
import { Activity, X, RefreshCw, AlertTriangle, ShieldOff, Globe, MessageSquare, Radio, Music, Cloud, Wrench, Monitor } from 'lucide-react'
import { usePython } from '../hooks/usePython'
import { useTranslation } from 'react-i18next'

interface Process {
  pid:      number
  name:     string
  cpu:      number
  ram_mb:   number
  status:   string
  username: string
  closeable:boolean
  system:   boolean
}

interface InterferenceProcess {
  pid:      number
  exe:      string
  name:     string
  category: string
  reason:   string
  cpu:      number
  ram_mb:   number
  username: string
}

interface InterferenceResult {
  processes:     InterferenceProcess[]
  count:         number
  total_ram_mb:  number
  total_ram_pct: number
}

interface ProcessList {
  processes:         Process[]
  total_count:       number
  closeable_count:   number
  closeable_ram_mb:  number
  closeable_ram_pct: number
}

interface CloseResult {
  results:      { pid: number; name: string; ok: boolean; error?: string }[]
  closed_count: number
  error_count:  number
}

// ── Category icon + color ─────────────────────────────────────────────────────

function categoryIcon(cat: string) {
  const props = { size: 11 }
  switch (cat) {
    case 'browser':       return <Globe {...props} />
    case 'communication': return <MessageSquare {...props} />
    case 'streaming':     return <Radio {...props} />
    case 'media':         return <Music {...props} />
    case 'cloud':         return <Cloud {...props} />
    case 'updater':       return <Wrench {...props} />
    case 'system':        return <Monitor {...props} />
    default:              return <Activity {...props} />
  }
}

function categoryColor(cat: string) {
  switch (cat) {
    case 'browser':       return '#AEEAF8'
    case 'communication': return '#9061CE'
    case 'streaming':     return '#ff3366'
    case 'media':         return '#ffd60a'
    case 'cloud':         return '#00ff88'
    case 'updater':       return 'rgba(184,184,208,0.5)'
    case 'system':        return 'rgba(184,184,208,0.4)'
    default:              return 'rgba(184,184,208,0.35)'
  }
}

function cpuColor(pct: number) {
  if (pct > 20) return '#ff3366'
  if (pct > 5)  return '#ffd60a'
  return 'rgba(184,184,208,0.5)'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Processes() {
  const { t } = useTranslation()
  const listQuery = usePython<ProcessList>()
  const intQuery  = usePython<InterferenceResult>()
  const closeQuery = usePython<CloseResult>()

  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set())
  const [terminating, setTerminating]   = useState<number | null>(null)
  const [feedback, setFeedback]         = useState<string | null>(null)
  const [autoClose, setAutoClose]       = useState(
    () => localStorage.getItem('v2_autoclose_procs') === 'true'
  )

  const loadList = () => listQuery.invoke('process_list', { limit: 40 })
  const loadInt  = () => intQuery.invoke('interference_processes')

  useEffect(() => {
    loadList()
    loadInt()
    const id = setInterval(() => { loadList(); loadInt() }, 6000)
    return () => clearInterval(id)
  }, [])

  const toggleSelect = (pid: number) => {
    setSelectedPids(prev => {
      const next = new Set(prev)
      next.has(pid) ? next.delete(pid) : next.add(pid)
      return next
    })
  }

  const selectAll = () => {
    const all = intQuery.data?.processes.map(p => p.pid) ?? []
    setSelectedPids(new Set(all))
  }

  const deselectAll = () => setSelectedPids(new Set())

  const closeSelected = async () => {
    const pids = [...selectedPids]
    if (pids.length === 0) return

    const res = await closeQuery.invoke('close_selected', { pids })
    if (res) {
      const count = res.closed_count
      setFeedback(t('processes.closed_ok', { count }))
      setSelectedPids(new Set())
      setTimeout(() => { loadList(); loadInt() }, 600)
    }
    setTimeout(() => setFeedback(null), 4000)
  }

  const terminate = async (pid: number, name: string) => {
    setTerminating(pid)
    try {
      const res = await window.api?.python?.invoke('terminate_pid', { pid }) as any
      if (res?.ok) {
        setFeedback(`✓ ${name} encerrado`)
        loadList()
      } else {
        setFeedback(`✗ ${res?.error ?? 'Erro'}`)
      }
    } finally {
      setTerminating(null)
      setTimeout(() => setFeedback(null), 3000)
    }
  }

  const handleAutoClose = (v: boolean) => {
    setAutoClose(v)
    localStorage.setItem('v2_autoclose_procs', String(v))
  }

  const interference = intQuery.data?.processes ?? []
  const procs        = listQuery.data?.processes ?? []
  const totalRam     = intQuery.data?.total_ram_mb ?? 0
  const selCount     = selectedPids.size

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '1.4rem', letterSpacing: '0.06em', color: '#e0e0f0' }}>
            {t('processes.title')}
          </h1>
          <p style={{ fontSize: '0.7rem', color: 'rgba(28,115,191,0.6)', fontFamily: 'Rajdhani', letterSpacing: '0.1em', marginTop: '2px' }}>
            {listQuery.data
              ? t('processes.subtitle', { total: listQuery.data.total_count, closeable: interference.length })
              : '—'
            }
          </p>
        </div>
        <button onClick={() => { loadList(); loadInt() }} disabled={listQuery.loading}
          className="btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} className={listQuery.loading ? 'animate-spin' : ''} />
          {t('common.update')}
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className="px-3 py-2 rounded-lg text-xs"
          style={{ background: feedback.startsWith('✗') ? 'rgba(255,51,102,0.08)' : 'rgba(0,255,136,0.08)', color: feedback.startsWith('✗') ? '#ff3366' : '#00ff88', border: `1px solid ${feedback.startsWith('✗') ? 'rgba(255,51,102,0.2)' : 'rgba(0,255,136,0.2)'}` }}>
          {feedback}
        </div>
      )}

      {/* ── INTERFERÊNCIA ───────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded"
              style={{ background: 'rgba(255,51,102,0.12)', border: '1px solid rgba(255,51,102,0.2)' }}>
              <ShieldOff size={10} style={{ color: '#ff3366' }} />
            </div>
            <span style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.16em', color: '#ff3366' }}>
              {t('processes.interference_title')}
            </span>
            {interference.length > 0 && (
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6rem', color: 'rgba(255,51,102,0.5)' }}>
                {interference.length}
              </span>
            )}
          </div>

          {interference.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={selectAll} style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', letterSpacing: '0.08em', color: 'rgba(174,234,248,0.5)' }}>
                {t('processes.select_all')}
              </button>
              <span style={{ color: 'rgba(184,184,208,0.2)' }}>·</span>
              <button onClick={deselectAll} style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', letterSpacing: '0.08em', color: 'rgba(184,184,208,0.35)' }}>
                {t('processes.deselect_all')}
              </button>
            </div>
          )}
        </div>

        {/* Interference subtitle */}
        {interference.length > 0 && (
          <p style={{ fontFamily: 'Inter', fontSize: '0.68rem', color: 'rgba(184,184,208,0.4)' }}>
            {t('processes.interference_sub')}
          </p>
        )}

        {/* Interference cards */}
        {interference.length === 0 && !intQuery.loading && (
          <div className="flex items-center gap-2 px-3 py-3 rounded-xl"
            style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.1)' }}>
            <span style={{ fontSize: '0.7rem', color: 'rgba(0,255,136,0.6)', fontFamily: 'Rajdhani' }}>
              ✓ {t('processes.no_interference')}
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          {interference.map(proc => {
            const selected = selectedPids.has(proc.pid)
            const col = categoryColor(proc.category)
            return (
              <button key={proc.pid} onClick={() => toggleSelect(proc.pid)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                style={{
                  background: selected ? 'rgba(255,51,102,0.06)' : 'rgba(2,15,41,0.7)',
                  border: `1px solid ${selected ? 'rgba(255,51,102,0.25)' : 'rgba(184,184,208,0.06)'}`,
                }}>
                {/* Checkbox */}
                <div className="w-4 h-4 rounded shrink-0 flex items-center justify-center transition-all"
                  style={{
                    background: selected ? '#ff3366' : 'transparent',
                    border: `1.5px solid ${selected ? '#ff3366' : 'rgba(184,184,208,0.2)'}`,
                  }}>
                  {selected && (
                    <svg viewBox="0 0 12 12" width="9" height="9">
                      <path d="M2 6l3 3 5-5" stroke="#010723" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Category icon */}
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${col}12`, border: `1px solid ${col}20`, color: col }}>
                  {categoryIcon(proc.category)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: 'Rajdhani', fontWeight: 600, fontSize: '0.82rem', color: '#e0e0f0', letterSpacing: '0.04em' }}>
                      {proc.name}
                    </span>
                    <span style={{ fontFamily: 'Rajdhani', fontSize: '0.58rem', letterSpacing: '0.08em', color: `${col}90`, background: `${col}10`, border: `1px solid ${col}20`, borderRadius: '3px', padding: '0 4px' }}>
                      {t(`processes.categories.${proc.category}`)}
                    </span>
                  </div>
                  <p style={{ fontFamily: 'Inter', fontSize: '0.66rem', color: 'rgba(184,184,208,0.4)', lineHeight: 1.3, marginTop: '1px' }}>
                    {proc.reason}
                  </p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 shrink-0 text-right">
                  <div>
                    <p style={{ fontFamily: 'JetBrains Mono', fontSize: '0.72rem', color: cpuColor(proc.cpu) }}>
                      {proc.cpu.toFixed(1)}%
                    </p>
                    <p style={{ fontFamily: 'Rajdhani', fontSize: '0.55rem', color: 'rgba(184,184,208,0.3)' }}>CPU</p>
                  </div>
                  <div>
                    <p style={{ fontFamily: 'JetBrains Mono', fontSize: '0.72rem', color: proc.ram_mb > 300 ? '#ffd60a' : 'rgba(184,184,208,0.7)' }}>
                      {proc.ram_mb >= 1024 ? `${(proc.ram_mb / 1024).toFixed(1)}G` : `${proc.ram_mb}M`}
                    </p>
                    <p style={{ fontFamily: 'Rajdhani', fontSize: '0.55rem', color: 'rgba(184,184,208,0.3)' }}>RAM</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Action bar */}
        {interference.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(6,36,95,0.3)', border: '1px solid rgba(28,115,191,0.12)' }}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={11} style={{ color: '#ffd60a' }} />
              <span style={{ fontFamily: 'Inter', fontSize: '0.68rem', color: 'rgba(255,214,10,0.7)' }}>
                {t('processes.could_free', { ram: totalRam })}
              </span>
            </div>
            <button
              onClick={closeSelected}
              disabled={selCount === 0 || closeQuery.loading}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.08em',
                background: selCount > 0 ? 'rgba(255,51,102,0.15)' : 'rgba(184,184,208,0.04)',
                border: `1px solid ${selCount > 0 ? 'rgba(255,51,102,0.3)' : 'rgba(184,184,208,0.08)'}`,
                color: selCount > 0 ? '#ff3366' : 'rgba(184,184,208,0.25)',
              }}
            >
              {closeQuery.loading
                ? t('processes.closing')
                : t('processes.close_selected', { count: selCount })}
            </button>
          </div>
        )}

        {/* Auto-close toggle */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(6,36,95,0.2)', border: '1px solid rgba(28,115,191,0.08)' }}>
          <div>
            <p style={{ fontFamily: 'Rajdhani', fontWeight: 600, fontSize: '0.75rem', color: '#e0e0f0', letterSpacing: '0.04em' }}>
              {t('processes.auto_close')}
            </p>
            <p style={{ fontFamily: 'Inter', fontSize: '0.65rem', color: 'rgba(184,184,208,0.4)', marginTop: '1px' }}>
              {t('processes.auto_close_sub')}
            </p>
          </div>
          <button onClick={() => handleAutoClose(!autoClose)}
            className="relative shrink-0 transition-colors"
            style={{ width: '36px', height: '20px', borderRadius: '10px', background: autoClose ? '#1C73BF' : 'rgba(184,184,208,0.12)', border: `1px solid ${autoClose ? '#1C73BF' : 'rgba(184,184,208,0.15)'}` }}>
            <span className="absolute top-0.5 transition-transform"
              style={{ left: '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transform: autoClose ? 'translateX(16px)' : 'translateX(0)' }} />
          </button>
        </div>
      </div>

      {/* ── TODOS OS PROCESSOS ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.16em', color: 'rgba(184,184,208,0.4)' }}>
            {t('processes.all_title')}
          </span>
          <div className="flex-1 h-px" style={{ background: 'rgba(184,184,208,0.06)' }} />
        </div>

        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(28,115,191,0.1)' }}>
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] px-3 py-2"
            style={{ background: 'rgba(6,36,95,0.3)', borderBottom: '1px solid rgba(28,115,191,0.1)' }}>
            {[t('processes.col_process'), t('processes.col_cpu'), t('processes.col_ram'), t('processes.col_user'), ''].map((h, i) => (
              <span key={i} style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.6rem', letterSpacing: '0.12em', color: 'rgba(184,184,208,0.3)' }}>
                {h}
              </span>
            ))}
          </div>

          <div style={{ maxHeight: 'calc(100vh - 480px)', overflowY: 'auto' }}>
            {procs.map(proc => (
              <div key={proc.pid}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center px-3 py-1.5 transition-colors"
                style={{
                  borderBottom: '1px solid rgba(28,115,191,0.05)',
                  background: proc.closeable ? 'rgba(255,51,102,0.02)' : 'transparent',
                }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Activity size={10} style={{ color: proc.closeable ? '#ff3366' : 'rgba(184,184,208,0.2)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.68rem', color: proc.closeable ? 'rgba(255,51,102,0.8)' : 'rgba(184,184,208,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {proc.name}
                  </span>
                  {proc.closeable && (
                    <span style={{ fontFamily: 'Rajdhani', fontSize: '0.55rem', color: 'rgba(255,51,102,0.5)', background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.15)', borderRadius: '3px', padding: '0 3px', flexShrink: 0 }}>
                      {t('processes.close_btn')}
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.7rem', color: cpuColor(proc.cpu) }}>
                  {proc.cpu.toFixed(1)}%
                </span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.7rem', color: 'rgba(184,184,208,0.5)' }}>
                  {proc.ram_mb >= 1024 ? `${(proc.ram_mb / 1024).toFixed(1)} GB` : `${proc.ram_mb} MB`}
                </span>
                <span style={{ fontFamily: 'Inter', fontSize: '0.65rem', color: 'rgba(184,184,208,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {proc.username}
                </span>
                <div className="pl-2">
                  {!proc.system && (
                    <button onClick={() => terminate(proc.pid, proc.name)}
                      disabled={terminating === proc.pid}
                      className="w-5 h-5 flex items-center justify-center rounded transition-colors"
                      style={{ color: 'rgba(184,184,208,0.2)' }}
                      title={`Encerrar ${proc.name}`}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {procs.length === 0 && !listQuery.loading && (
              <div className="py-8 text-center" style={{ color: 'rgba(184,184,208,0.3)', fontSize: '0.75rem' }}>
                Nenhum processo encontrado
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
