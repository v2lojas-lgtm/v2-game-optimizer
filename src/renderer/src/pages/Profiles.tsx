import { useState, useEffect } from 'react'
import { Target, Zap, Monitor, CheckCircle, AlertCircle, Info, RefreshCw, Copy, ChevronRight } from 'lucide-react'
import { usePython } from '../hooks/usePython'
import { useTranslation } from 'react-i18next'

interface GameProfile {
  id: string
  name: string
  icon: string
  installed: boolean
  running: boolean
  modes: Record<string, string>
  current_options: string | null
}

const MODE_META: Record<string, { label: string; icon: React.ElementType; desc: string }> = {
  competitive: { label: 'Competitivo',  icon: Target,  desc: 'Máximo FPS e menor latência' },
  quality:     { label: 'Qualidade',    icon: Monitor, desc: 'Mais qualidade visual' },
}

function GameCard({
  game,
  selected,
  onClick,
}: {
  game: GameProfile
  selected: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      disabled={!game.installed}
      className={`card text-left flex items-center gap-3 w-full transition-all ${
        selected
          ? 'border-brand-500/50 bg-brand-500/8'
          : game.installed
          ? 'hover:border-dark-500 hover:bg-dark-700'
          : 'opacity-35 cursor-not-allowed'
      }`}
    >
      <span className="text-2xl">{game.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{game.name}</p>
        <p className={`text-xs mt-0.5 ${game.installed ? 'text-emerald-400' : 'text-slate-600'}`}>
          {game.installed ? t('profiles.installed') : t('profiles.not_inst')}
        </p>
      </div>
      {game.running && (
        <span className="text-xs bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full shrink-0">Rodando</span>
      )}
      {selected && <ChevronRight size={14} className="text-brand-400 shrink-0" />}
    </button>
  )
}

export default function Profiles() {
  const { t } = useTranslation()
  const profilesQ = usePython<GameProfile[]>()
  const applyQ    = usePython<{ ok: boolean; message?: string; error?: string }>()
  const [selected, setSelected] = useState<string | null>(null)
  const [applied, setApplied]   = useState<string | null>(null)
  const [copied, setCopied]     = useState(false)

  useEffect(() => {
    profilesQ.invoke('game_profiles')
  }, [])

  const profiles = profilesQ.data ?? []
  const game     = profiles.find(p => p.id === selected) ?? null

  const applyMode = async (mode: string) => {
    if (!game) return
    const opts = game.modes[mode]
    if (!opts) return
    await applyQ.invoke('set_cs2_options', { options: opts })
    setApplied(mode)
    profilesQ.invoke('game_profiles')
  }

  const copyOptions = (opts: string) => {
    navigator.clipboard.writeText(opts).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">{t('profiles.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('profiles.subtitle')}</p>
        </div>
        <button
          onClick={() => { profilesQ.invoke('game_profiles'); setApplied(null) }}
          disabled={profilesQ.loading}
          className="btn-ghost flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} className={profilesQ.loading ? 'animate-spin' : ''} />
          {t('common.update')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {profilesQ.loading && profiles.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card h-16 animate-pulse bg-dark-700" />
            ))
          : profiles.map(p => (
              <GameCard
                key={p.id}
                game={p}
                selected={selected === p.id}
                onClick={() => { setSelected(p.id); setApplied(null) }}
              />
            ))
        }
      </div>

      {!game && !profilesQ.loading && (
        <div className="card text-center py-10 text-slate-600">
          <Zap size={28} className="mx-auto mb-3 opacity-25" />
          <p className="text-sm">Selecione um jogo instalado para configurar as launch options</p>
        </div>
      )}

      {game && (
        <div className="space-y-4">
          {/* Current options */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                {game.icon} {game.name} — {t('profiles.current_opt')}
              </h2>
              {game.current_options && (
                <button
                  onClick={() => copyOptions(game.current_options!)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <Copy size={12} />
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              )}
            </div>
            {game.current_options ? (
              <pre className="text-xs text-slate-400 font-mono bg-dark-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {game.current_options}
              </pre>
            ) : (
              <p className="text-xs text-slate-600 italic">{t('profiles.no_options')}</p>
            )}
          </div>

          {/* Presets */}
          {Object.keys(game.modes).length > 0 && (
            <div className="card space-y-3">
              <h2 className="text-sm font-semibold text-white">{t('profiles.apply_preset')}</h2>

              {applyQ.data?.ok && (
                <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 border ${
                  (applyQ.data as any)?.steam_open
                    ? 'text-brand-300 bg-brand-500/8 border-brand-500/20'
                    : 'text-emerald-400 bg-emerald-500/8 border-emerald-500/20'
                }`}>
                  {(applyQ.data as any)?.steam_open
                    ? <Info size={14} className="shrink-0 mt-0.5" />
                    : <CheckCircle size={14} className="shrink-0 mt-0.5" />
                  }
                  <span>{applyQ.data.message ?? 'Launch options atualizadas!'}</span>
                </div>
              )}
              {applyQ.data?.ok === false && (
                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{applyQ.data.error ?? 'Erro ao aplicar'}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {Object.entries(game.modes).map(([modeId, opts]) => {
                  const meta = MODE_META[modeId]
                  const Icon = meta?.icon ?? Zap
                  const isActive = applied === modeId
                  return (
                    <div key={modeId} className={`rounded-lg border p-3 space-y-2 transition-all ${
                      isActive ? 'border-brand-500/40 bg-brand-500/8' : 'border-dark-600'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className={isActive ? 'text-brand-400' : 'text-slate-500'} />
                          <span className={`text-sm font-medium ${isActive ? 'text-brand-400' : 'text-slate-300'}`}>
                            {meta?.label ?? modeId}
                          </span>
                        </div>
                        {isActive && <CheckCircle size={13} className="text-emerald-400" />}
                      </div>
                      <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap break-all leading-relaxed">
                        {opts}
                      </pre>
                      <button
                        onClick={() => applyMode(modeId)}
                        disabled={applyQ.loading}
                        className={`w-full text-xs py-1.5 rounded-md font-medium transition-colors ${
                          isActive
                            ? 'bg-brand-500/20 text-brand-400 hover:bg-brand-500/30'
                            : 'bg-dark-600 text-slate-400 hover:bg-dark-500 hover:text-white'
                        }`}
                      >
                        {applyQ.loading ? t('common.applying') : isActive ? t('profiles.reapply') : t('common.apply')}
                      </button>
                    </div>
                  )
                })}
              </div>

              <p className="text-xs text-slate-600">{t('profiles.steam_note')}</p>
            </div>
          )}

          {Object.keys(game.modes).length === 0 && (
            <div className="card text-center py-6 text-slate-600">
              <p className="text-sm">Suporte a presets em breve para {game.name}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
