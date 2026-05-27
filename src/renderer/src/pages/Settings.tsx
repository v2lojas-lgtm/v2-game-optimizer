import { useState, useEffect } from 'react'
import { Trash2, CheckCircle, AlertCircle, ShieldOff, Key } from 'lucide-react'
import { usePython } from '../hooks/usePython'
import { useTranslation } from 'react-i18next'
import { setLanguage, SUPPORTED_LANGS, type SupportedLang } from '../i18n'

interface StartupInfo { enabled: boolean; supported: boolean; error?: string }
interface AppInfo     { version: string; python: string; platform: string }
interface ClearResult { ok: boolean; cleared?: string[]; error?: string }
interface LicenseInfo {
  valid: boolean
  key: string | null
  reason: string
  expires_at?: number
  days_remaining?: number
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">{children}</h2>
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-dark-700 last:border-0">
      <div>
        <p className="text-sm text-white">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <div className="ml-4 shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${
        checked ? 'bg-brand-500' : 'bg-dark-600'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ height: '22px', width: '40px' }}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-0'
        }`}
        style={{ width: '18px', height: '18px' }}
      />
    </button>
  )
}

function formatExpiry(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Settings() {
  const { t, i18n } = useTranslation()
  const startupQ   = usePython<StartupInfo>()
  const setStQ     = usePython<{ ok: boolean; error?: string }>()
  const clearQ     = usePython<ClearResult>()
  const appInfoQ   = usePython<AppInfo>()
  const licenseQ   = usePython<LicenseInfo>()
  const deactivateQ = usePython<{ ok: boolean; error?: string }>()

  const [clearMsg, setClearMsg]         = useState<string | null>(null)
  const [clearType, setClearType]       = useState<'benchmark' | 'integrity' | 'optimization' | 'all'>('all')
  const [deactivated, setDeactivated]   = useState(false)
  const [autoClose, setAutoClose]       = useState(() => localStorage.getItem('v2_autoclose_procs') === 'true')
  const currentLang = i18n.language as SupportedLang

  useEffect(() => {
    startupQ.invoke('get_startup')
    appInfoQ.invoke('app_info')
    licenseQ.invoke('check_license')
  }, [])

  const handleStartup = async (enabled: boolean) => {
    await setStQ.invoke('set_startup', { enabled })
    startupQ.invoke('get_startup')
  }

  const handleAutoClose = (v: boolean) => {
    setAutoClose(v)
    localStorage.setItem('v2_autoclose_procs', v ? 'true' : 'false')
  }

  const handleClear = async () => {
    const r = await clearQ.invoke('clear_history', { type: clearType })
    if (r?.ok) {
      setClearMsg(t('settings.cleared_ok'))
      setTimeout(() => setClearMsg(null), 3000)
    }
  }

  const handleDeactivate = async () => {
    if (!confirm(t('settings.deactivate_confirm'))) return
    await deactivateQ.invoke('deactivate')
    setDeactivated(true)
  }

  const startup  = startupQ.data
  const appInfo  = appInfoQ.data
  const licInfo  = licenseQ.data

  const CLEAR_OPTIONS = [
    { value: 'all',          label: t('settings.clear_options.all') },
    { value: 'benchmark',    label: t('settings.clear_options.benchmark') },
    { value: 'integrity',    label: t('settings.clear_options.integrity') },
    { value: 'optimization', label: t('settings.clear_options.optimization') },
  ] as const

  return (
    <div className="space-y-7 max-w-xl">
      <div>
        <h1 className="text-xl font-semibold text-white">{t('settings.title')}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t('settings.subtitle')}</p>
      </div>

      {/* Sistema */}
      <div>
        <SectionTitle>{t('settings.system_section')}</SectionTitle>
        <div className="card space-y-0">
          <Row label={t('settings.startup_label')} sub={t('settings.startup_sub')}>
            {startupQ.loading
              ? <div className="w-10 h-5 bg-dark-600 rounded-full animate-pulse" />
              : startup?.supported === false
              ? <span className="text-xs text-slate-600">{t('settings.not_supported')}</span>
              : <Toggle
                  checked={startup?.enabled ?? false}
                  onChange={handleStartup}
                  disabled={setStQ.loading}
                />
            }
          </Row>

          {setStQ.data?.ok === false && (
            <p className="text-xs text-red-400 pb-2">{setStQ.data.error}</p>
          )}

          <Row label={t('settings.overlay_label')} sub={t('settings.overlay_sub')}>
            <div className="flex items-center gap-1.5">
              {['Ctrl', 'Shift', 'O'].map(k => (
                <kbd key={k} className="px-2 py-0.5 text-xs font-mono bg-dark-600 border border-dark-500 rounded text-slate-300">{k}</kbd>
              ))}
            </div>
          </Row>

          <Row label={t('settings.autoclose_label')} sub={t('settings.autoclose_sub')}>
            <Toggle checked={autoClose} onChange={handleAutoClose} />
          </Row>
        </div>
      </div>

      {/* Idioma */}
      <div>
        <SectionTitle>{t('settings.language_label')}</SectionTitle>
        <div className="card space-y-0">
          <Row label={t('settings.language_label')} sub={t('settings.language_sub')}>
            <div className="flex items-center gap-1.5">
              {SUPPORTED_LANGS.map(lang => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{
                    fontFamily: 'Rajdhani',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    background: currentLang === lang ? 'rgba(28,115,191,0.2)' : 'rgba(184,184,208,0.05)',
                    border: `1px solid ${currentLang === lang ? 'rgba(28,115,191,0.4)' : 'rgba(184,184,208,0.1)'}`,
                    color: currentLang === lang ? '#AEEAF8' : 'rgba(184,184,208,0.4)',
                  }}
                >
                  {lang === 'pt-BR' ? 'PT' : lang === 'en' ? 'EN' : 'ES'}
                </button>
              ))}
            </div>
          </Row>
        </div>
      </div>

      {/* Histórico */}
      <div>
        <SectionTitle>{t('settings.history_section')}</SectionTitle>
        <div className="card space-y-4">
          <p className="text-xs text-slate-500">{t('settings.history_desc')}</p>

          <div className="flex items-center gap-3">
            <select
              value={clearType}
              onChange={e => setClearType(e.target.value as typeof clearType)}
              className="flex-1 bg-dark-700 border border-dark-600 text-sm text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500/50"
            >
              {CLEAR_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={handleClear}
              disabled={clearQ.loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors"
            >
              <Trash2 size={14} />
              {clearQ.loading ? t('settings.clearing') : t('settings.clear_btn')}
            </button>
          </div>

          {clearMsg && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle size={14} />
              {clearMsg}
            </div>
          )}
          {clearQ.data?.ok === false && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle size={14} />
              {clearQ.data.error}
            </div>
          )}
        </div>
      </div>

      {/* Licença */}
      <div>
        <SectionTitle>{t('settings.license_section')}</SectionTitle>
        <div className="card space-y-0">

          {/* Chave + validade */}
          <Row
            label={t('settings.license_key')}
            sub={licInfo?.valid && licInfo.expires_at
              ? `${t('settings.expires_at')} ${formatExpiry(licInfo.expires_at)}`
              : t('settings.license_sub')}
          >
            {licenseQ.loading
              ? <span className="text-xs text-slate-600">{t('common.loading')}</span>
              : licInfo?.valid
              ? <div className="flex items-center gap-2">
                  <CheckCircle size={13} className="text-emerald-400" />
                  <span className="font-mono text-xs text-slate-400">{licInfo.key}</span>
                </div>
              : licInfo?.reason === 'expired'
              ? <span className="text-xs text-red-400 font-medium">{t('settings.expired_lbl')}</span>
              : <span className="text-xs text-slate-600 italic">{t('settings.not_activated')}</span>
            }
          </Row>

          {/* Aviso de expiração próxima (< 30 dias) */}
          {licInfo?.valid && (licInfo.days_remaining ?? 999) <= 30 && (
            <Row
              label={t('settings.expiring_soon')}
              sub={t('settings.days_remaining', { days: licInfo.days_remaining ?? 0 })}
            >
              <a
                href="https://v2gameoptimizer.com"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                style={{ color: 'rgba(255,214,10,0.8)' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ffd60a')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,214,10,0.8)')}
              >
                <Key size={12} />
                {t('settings.renew_btn')}
              </a>
            </Row>
          )}

          {/* Desativar */}
          {licInfo?.valid && !deactivated && (
            <Row label={t('settings.deactivate')} sub={t('settings.deactivate_sub')}>
              <button
                onClick={handleDeactivate}
                disabled={deactivateQ.loading}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                <ShieldOff size={13} />
                {deactivateQ.loading ? t('settings.deactivating') : t('settings.deactivate')}
              </button>
            </Row>
          )}

          {deactivated && (
            <div className="flex items-center gap-2 py-2 text-sm text-amber-400">
              <Key size={13} />
              {t('settings.deactivated')}
            </div>
          )}
        </div>
      </div>

      {/* Sobre */}
      <div>
        <SectionTitle>{t('settings.about_section')}</SectionTitle>
        <div className="card space-y-0">
          <Row label={t('settings.version_label')} sub="V2 Game Optimizer">
            <span className="font-mono text-sm text-slate-400">{appInfo?.version ?? '—'}</span>
          </Row>
          <Row label={t('settings.python_label')} sub={t('settings.python_sub')}>
            <span className="font-mono text-sm text-slate-400">{appInfo?.python ?? '—'}</span>
          </Row>
          <Row label={t('settings.db_label')} sub={t('settings.db_sub')}>
            <span className="text-xs text-slate-500">%APPDATA%\V2GameOptimizer</span>
          </Row>
        </div>
      </div>
    </div>
  )
}
