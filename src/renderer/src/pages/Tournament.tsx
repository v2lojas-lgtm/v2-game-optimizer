import { useState, useEffect } from 'react'
import { Zap, Shield, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import { usePython } from '../hooks/usePython'
import { useTranslation } from 'react-i18next'

interface TournamentResult {
  ok: boolean
  active: boolean
  actions?: string[]
  errors?: string[]
  activated_at?: number | null
  duration_min?: number | null
}

interface TournamentStatus {
  active: boolean
  activated_at: number | null
  duration_min: number | null
}

const ACTIONS_PREVIEW = [
  { label: 'Timer Resolution 1ms',           desc: 'Scheduler de 15.6ms → 1ms — cada frame mais preciso' },
  { label: 'CPU Core Parking desativado',     desc: 'Todos os núcleos ativos — sem micro-stutter de wake-up' },
  { label: 'Algoritmo de Nagle desativado',   desc: 'TCP_NODELAY — pacotes saem imediatamente' },
  { label: 'Network Throttling removido',     desc: 'Sem limite de 10 pps — rede sem restrição' },
  { label: 'Plano Alto Desempenho',           desc: 'CPU e GPU sem throttling de energia' },
  { label: 'Game Bar + Fullscreen opts OFF',  desc: 'Overhead da Microsoft removido' },
  { label: 'Serviços de background suspensos', desc: 'Search, OneDrive, Updates — dormindo durante o jogo' },
  { label: 'RAM standby limpa',              desc: 'Memória standby liberada antes do jogo carregar' },
]

export default function Tournament() {
  const { t } = useTranslation()
  const enableQuery  = usePython<TournamentResult>()
  const disableQuery = usePython<TournamentResult>()
  const statusQuery  = usePython<TournamentStatus>()

  const [result, setResult] = useState<TournamentResult | null>(null)

  useEffect(() => {
    statusQuery.invoke('tournament_status')
  }, [])

  const status  = statusQuery.data
  const active  = result?.active ?? status?.active ?? false
  const loading = enableQuery.loading || disableQuery.loading

  const handleEnable = async () => {
    const res = await enableQuery.invoke('tournament_enable') as TournamentResult
    if (res) {
      setResult(res)
      statusQuery.invoke('tournament_status')
    }
  }

  const handleDisable = async () => {
    const res = await disableQuery.invoke('tournament_disable') as TournamentResult
    if (res) {
      setResult(res)
      statusQuery.invoke('tournament_status')
    }
  }

  // Duration ticker
  const [_tick, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [active])

  const duration = status?.duration_min ?? result?.duration_min

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '1.4rem', letterSpacing: '0.06em', color: '#e0e0f0' }}>
          {t('tournament.title')}
        </h1>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(28,115,191,0.65)', fontFamily: 'Rajdhani', letterSpacing: '0.1em' }}>
          {t('tournament.subtitle')}
        </p>
      </div>

      {/* Main card */}
      <div className="relative rounded-2xl overflow-hidden"
        style={{
          background: active
            ? 'linear-gradient(135deg, rgba(0,20,10,0.98) 0%, rgba(0,40,20,0.6) 100%)'
            : 'linear-gradient(135deg, rgba(2,15,41,0.98) 0%, rgba(4,25,70,0.7) 100%)',
          border: `1px solid ${active ? 'rgba(0,255,136,0.25)' : 'rgba(144,97,206,0.2)'}`,
          boxShadow: active
            ? '0 0 60px rgba(0,255,136,0.08), inset 0 1px 0 rgba(0,255,136,0.06)'
            : '0 0 60px rgba(144,97,206,0.06), inset 0 1px 0 rgba(174,234,248,0.04)',
          padding: '32px 28px',
        }}
      >
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: active
            ? 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,255,136,0.06), transparent)'
            : 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(144,97,206,0.08), transparent)',
        }} />

        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* Status indicator */}
          {active ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl"
                style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', animation: 'livePulse 2s ease-in-out infinite' }}>
                <Zap size={14} style={{ color: '#00ff88', filter: 'drop-shadow(0 0 6px #00ff88)' }} />
                <span style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.18em', color: '#00ff88' }}>
                  {t('tournament.active_badge')}
                </span>
              </div>
              {duration != null && (
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.7rem', color: 'rgba(0,255,136,0.45)' }}>
                  {duration.toFixed(0)} min ativo
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl"
                style={{
                  background: 'rgba(144,97,206,0.12)',
                  border: '1px solid rgba(144,97,206,0.25)',
                  boxShadow: '0 0 30px rgba(144,97,206,0.1)',
                }}>
                <Zap size={28} style={{ color: '#9061CE', filter: 'drop-shadow(0 0 10px rgba(144,97,206,0.8))' }} />
              </div>
              <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.2em', color: 'rgba(144,97,206,0.6)', marginTop: '4px' }}>
                ZERO DELAY MODE
              </p>
            </div>
          )}

          {/* Main button */}
          {active ? (
            <button
              onClick={handleDisable}
              disabled={loading}
              className="flex items-center gap-3 rounded-xl transition-all"
              style={{
                padding: '12px 36px',
                fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.14em',
                color: 'rgba(184,184,208,0.7)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(184,184,208,0.12)',
              }}
            >
              {loading ? <RefreshCw size={15} className="animate-spin" /> : null}
              {loading ? t('common.applying') : t('tournament.deactivate')}
            </button>
          ) : (
            <button
              onClick={handleEnable}
              disabled={loading}
              className="flex items-center gap-3 rounded-xl transition-all"
              style={{
                padding: '14px 48px',
                fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.18em',
                color: loading ? 'rgba(184,184,208,0.5)' : '#fff',
                background: loading
                  ? 'rgba(144,97,206,0.2)'
                  : 'linear-gradient(135deg, #472388 0%, #1C73BF 100%)',
                border: `1px solid ${loading ? 'rgba(144,97,206,0.2)' : 'rgba(174,234,248,0.15)'}`,
                boxShadow: loading ? 'none' : '0 4px 24px rgba(144,97,206,0.3), 0 0 40px rgba(28,115,191,0.15)',
              }}
            >
              {loading ? <><RefreshCw size={15} className="animate-spin" /> {t('common.applying')}</> : <><Zap size={15} /> {t('tournament.activate')}</>}
            </button>
          )}

          {/* Warning */}
          {!active && (
            <div className="flex items-start gap-2 px-4 py-2.5 rounded-lg"
              style={{ background: 'rgba(255,214,10,0.05)', border: '1px solid rgba(255,214,10,0.12)', maxWidth: 420, width: '100%' }}>
              <Shield size={11} className="shrink-0 mt-0.5" style={{ color: 'rgba(255,214,10,0.5)' }} />
              <p style={{ fontFamily: 'Inter', fontSize: '0.68rem', color: 'rgba(255,214,10,0.55)', lineHeight: 1.5 }}>
                Requer privilégios de administrador para algumas otimizações. Restauração automática ao clicar em "Desativar".
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Result actions list */}
      {result?.actions && result.actions.length > 0 && (
        <div className="card space-y-2">
          <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.14em', color: active ? 'rgba(0,255,136,0.5)' : 'rgba(184,184,208,0.4)' }}>
            {active ? 'AÇÕES APLICADAS' : 'AÇÕES RESTAURADAS'}
          </p>
          {result.actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-xs" style={{ color: 'rgba(184,184,208,0.6)', fontFamily: 'Inter' }}>
              <CheckCircle size={11} style={{ color: '#00ff88', flexShrink: 0 }} />
              {a}
            </div>
          ))}
          {result.errors?.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,51,102,0.6)', fontFamily: 'Inter' }}>
              <AlertCircle size={11} style={{ color: '#ff3366', flexShrink: 0 }} />
              {e}
            </div>
          ))}
        </div>
      )}

      {/* What it does — preview */}
      {!active && !result && (
        <div className="space-y-2">
          <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.16em', color: 'rgba(174,234,248,0.3)' }}>
            O QUE O MODO TORNEIO FAZ
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ACTIONS_PREVIEW.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{ background: 'rgba(2,15,41,0.6)', border: '1px solid rgba(174,234,248,0.05)' }}>
                <div className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'rgba(144,97,206,0.6)', boxShadow: '0 0 5px rgba(144,97,206,0.4)' }} />
                <div className="min-w-0">
                  <p style={{ fontFamily: 'Rajdhani', fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.04em', color: 'rgba(224,224,240,0.7)', lineHeight: 1.2 }}>
                    {a.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(184,184,208,0.3)', fontFamily: 'Inter', lineHeight: 1.4 }}>
                    {a.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anti-cheat note */}
      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
        style={{ background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.08)' }}>
        <Shield size={11} className="shrink-0 mt-0.5" style={{ color: 'rgba(0,255,136,0.35)' }} />
        <p style={{ fontFamily: 'Inter', fontSize: '0.65rem', color: 'rgba(0,255,136,0.4)', lineHeight: 1.5 }}>
          <strong style={{ color: 'rgba(0,255,136,0.55)' }}>Anti-Cheat Safe:</strong> Todas as otimizações operam apenas em espaço de usuário (userspace) via APIs oficiais do Windows — sem hooks de kernel, sem injeção de DLL. Compatível com VAC, Vanguard, EasyAntiCheat e FACEIT.
        </p>
      </div>
    </div>
  )
}
