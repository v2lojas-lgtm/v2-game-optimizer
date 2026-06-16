import { useState, useRef } from 'react'
import { Mail, Hash, Key, CheckCircle, AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import logoImg from '../assets/lgo.png.png'

interface Props {
  onActivated: () => void
  mode?: 'activate' | 'renew' | 'trial_expired'
}

const TEST_KEY = 'V2GO-TEST-0000-0000'
const TEST_EMAIL = 'test@v2go.dev'

function formatKey(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16)
  return clean.match(/.{1,4}/g)?.join('-') ?? clean
}

function formatCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6)
}

export default function Activation({ onActivated, mode = 'activate' }: Props) {
  const isRenew        = mode === 'renew'
  const isTrialExpired = mode === 'trial_expired'

  // 'email' = novo fluxo (e-mail + código). 'legacy' = chave antiga, mantida como rede de segurança.
  const [authMethod, setAuthMethod] = useState<'email' | 'legacy'>('email')
  const [stage, setStage]           = useState<'email' | 'code'>('email')

  const [email, setEmail]     = useState('')
  const [code, setCode]       = useState('')
  const [key, setKey]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleEmailInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setEmail(e.target.value)
  }

  const handleCodeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setCode(formatCode(e.target.value))
  }

  const handleKeyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setKey(formatKey(e.target.value))
  }

  const requestCode = async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.python.invoke('request_code', { email: trimmed }) as any
      if (result?.ok) {
        setStage('code')
      } else {
        setError(result?.error ?? 'Erro ao enviar código')
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao enviar código')
    } finally {
      setLoading(false)
    }
  }

  const confirmCode = async () => {
    const trimmedCode = code.trim()
    if (trimmedCode.length !== 6) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.python.invoke('verify_code', { email: email.trim(), code: trimmedCode }) as any
      if (result?.ok) {
        setSuccess(true)
        setTimeout(onActivated, 1200)
      } else {
        setError(result?.error ?? 'Código inválido')
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao validar o código')
    } finally {
      setLoading(false)
    }
  }

  const activateWithKey = async () => {
    const trimmed = key.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.python.invoke('activate_key', { key: trimmed }) as any
      if (result?.ok) {
        setSuccess(true)
        setTimeout(onActivated, 1200)
      } else {
        setError(result?.error ?? 'Chave inválida')
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao validar a chave')
    } finally {
      setLoading(false)
    }
  }

  const fillTestEmail = () => {
    setEmail(TEST_EMAIL)
    setError(null)
    inputRef.current?.focus()
  }

  const fillTestKey = () => {
    setKey(TEST_KEY)
    setError(null)
    inputRef.current?.focus()
  }

  const emailValid = /\S+@\S+\.\S+/.test(email.trim())
  const codeValid  = code.length === 6
  const keyValid   = key.replace(/-/g, '').length === 16

  return (
    <div
      className="flex flex-col items-center justify-center h-screen px-6"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(28,115,191,0.12) 0%, rgba(71,35,136,0.06) 40%, #010723 70%)',
      }}
    >
      {/* Subtle grid overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(28,115,191,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(28,115,191,0.04) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div className="relative w-full max-w-sm space-y-8">

        {/* Logo + Title */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              {/* Outer glow ring */}
              <div className="absolute inset-0 rounded-2xl" style={{
                background: 'radial-gradient(circle, rgba(28,115,191,0.3) 0%, rgba(71,35,136,0.2) 50%, transparent 70%)',
                filter: 'blur(12px)',
                transform: 'scale(1.4)',
              }} />
              <img
                src={logoImg}
                alt="V2 Game Optimizer"
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '20px',
                  objectFit: 'cover',
                  position: 'relative',
                  filter: 'drop-shadow(0 0 12px rgba(28,115,191,0.8)) drop-shadow(0 0 24px rgba(144,97,206,0.5))',
                }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <h1 style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 700,
              fontSize: '1.6rem',
              letterSpacing: '0.12em',
              color: '#e8eaf8',
              textShadow: '0 0 30px rgba(174,234,248,0.4)',
            }}>
              V2 GAME OPTIMIZER
            </h1>
            {(isRenew || isTrialExpired) && (
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '0.6rem',
                  letterSpacing: '0.18em',
                  fontWeight: 700,
                  color: isTrialExpired ? 'rgba(144,97,206,0.9)' : 'rgba(255,214,10,0.8)',
                  background: isTrialExpired ? 'rgba(144,97,206,0.1)' : 'rgba(255,214,10,0.08)',
                  border: `1px solid ${isTrialExpired ? 'rgba(144,97,206,0.25)' : 'rgba(255,214,10,0.2)'}`,
                  borderRadius: '4px',
                  padding: '2px 8px',
                }}>
                  {isTrialExpired ? 'AVALIAÇÃO ENCERRADA' : 'LICENÇA EXPIRADA'}
                </span>
              </div>
            )}
            <p style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '0.7rem',
              letterSpacing: '0.2em',
              color: isTrialExpired
                ? 'rgba(144,97,206,0.6)'
                : isRenew
                ? 'rgba(255,214,10,0.5)'
                : 'rgba(28,115,191,0.65)',
            }}>
              {isTrialExpired
                ? 'ASSINE PARA CONTINUAR USANDO'
                : isRenew
                ? 'RENOVE PARA CONTINUAR USANDO'
                : 'ATIVE SEU ACESSO PARA CONTINUAR'}
            </p>
          </div>
        </div>

        {/* Activation card */}
        <div className="card-glow space-y-5">
          {authMethod === 'email' ? (
            <>
              <div className="flex items-center gap-2" style={{ color: 'rgba(174,234,248,0.55)' }}>
                {stage === 'email' ? <Mail size={14} /> : <Hash size={14} />}
                <span style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '0.7rem',
                  letterSpacing: '0.16em',
                  fontWeight: 600,
                }}>
                  {stage === 'email' ? 'SEU E-MAIL DE COMPRA' : 'CÓDIGO RECEBIDO POR E-MAIL'}
                </span>
              </div>

              {stage === 'email' ? (
                <div className="space-y-3">
                  <input
                    ref={inputRef}
                    type="email"
                    value={email}
                    onChange={handleEmailInput}
                    onKeyDown={e => e.key === 'Enter' && emailValid && !loading && requestCode()}
                    placeholder="seu@email.com"
                    spellCheck={false}
                    style={{
                      width: '100%',
                      background: 'rgba(2,15,41,0.8)',
                      border: `1px solid ${error ? 'rgba(255,51,102,0.5)' : 'rgba(28,115,191,0.25)'}`,
                      borderRadius: '10px',
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.95rem',
                      color: '#fff',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      boxShadow: error ? '0 0 12px rgba(255,51,102,0.15)' : 'none',
                    }}
                    onFocus={e => {
                      if (!error) e.target.style.borderColor = 'rgba(174,234,248,0.4)'
                      if (!error) e.target.style.boxShadow = '0 0 16px rgba(28,115,191,0.2)'
                    }}
                    onBlur={e => {
                      if (!error) e.target.style.borderColor = 'rgba(28,115,191,0.25)'
                      if (!error) e.target.style.boxShadow = 'none'
                    }}
                  />
                  {error && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: '#ff3366' }}>
                      <AlertCircle size={13} className="shrink-0" />
                      {error}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs" style={{ color: 'rgba(200,204,232,0.5)' }}>
                    Enviamos um código de 6 dígitos para <strong style={{ color: '#fff' }}>{email}</strong>.
                  </p>
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={handleCodeInput}
                    onKeyDown={e => e.key === 'Enter' && codeValid && !loading && confirmCode()}
                    placeholder="000000"
                    maxLength={6}
                    spellCheck={false}
                    style={{
                      width: '100%',
                      background: 'rgba(2,15,41,0.8)',
                      border: `1px solid ${error ? 'rgba(255,51,102,0.5)' : success ? 'rgba(0,255,136,0.4)' : 'rgba(28,115,191,0.25)'}`,
                      borderRadius: '10px',
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '1.4rem',
                      letterSpacing: '0.4em',
                      color: '#fff',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      boxShadow: error
                        ? '0 0 12px rgba(255,51,102,0.15)'
                        : success
                        ? '0 0 12px rgba(0,255,136,0.15)'
                        : 'none',
                    }}
                    onFocus={e => {
                      if (!error && !success) e.target.style.borderColor = 'rgba(174,234,248,0.4)'
                      if (!error && !success) e.target.style.boxShadow = '0 0 16px rgba(28,115,191,0.2)'
                    }}
                    onBlur={e => {
                      if (!error && !success) e.target.style.borderColor = 'rgba(28,115,191,0.25)'
                      if (!error && !success) e.target.style.boxShadow = 'none'
                    }}
                  />

                  {error && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: '#ff3366' }}>
                      <AlertCircle size={13} className="shrink-0" />
                      {error}
                    </div>
                  )}

                  {success && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: '#00ff88' }}>
                      <CheckCircle size={13} className="shrink-0" />
                      {isRenew ? 'Acesso renovado! Entrando...' : 'Acesso liberado! Entrando...'}
                    </div>
                  )}

                  {!success && (
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => { setStage('email'); setCode(''); setError(null) }}
                        style={{ fontSize: '0.7rem', color: 'rgba(174,234,248,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        ← Usar outro e-mail
                      </button>
                      <button
                        onClick={requestCode}
                        disabled={loading}
                        style={{ fontSize: '0.7rem', color: 'rgba(174,234,248,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Reenviar código
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={stage === 'email' ? requestCode : confirmCode}
                disabled={(stage === 'email' ? !emailValid : !codeValid) || loading || success}
                className="btn-primary w-full"
                style={((stage === 'email' ? !emailValid : !codeValid) || loading || success) ? { opacity: 0.35, cursor: 'not-allowed', transform: 'none' } : {}}
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /> {stage === 'email' ? 'ENVIANDO...' : 'VALIDANDO...'}</>
                ) : success ? (
                  <><CheckCircle size={14} /> {isRenew ? 'RENOVADO' : 'ATIVADO'}</>
                ) : stage === 'email' ? (
                  'ENVIAR CÓDIGO'
                ) : (
                  isRenew ? 'RENOVAR ACESSO' : 'CONFIRMAR CÓDIGO'
                )}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2" style={{ color: 'rgba(174,234,248,0.55)' }}>
                <Key size={14} />
                <span style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '0.7rem',
                  letterSpacing: '0.16em',
                  fontWeight: 600,
                }}>CHAVE DE LICENÇA</span>
              </div>

              <div className="space-y-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={key}
                  onChange={handleKeyInput}
                  onKeyDown={e => e.key === 'Enter' && keyValid && !loading && activateWithKey()}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  maxLength={19}
                  spellCheck={false}
                  style={{
                    width: '100%',
                    background: 'rgba(2,15,41,0.8)',
                    border: `1px solid ${error ? 'rgba(255,51,102,0.5)' : success ? 'rgba(0,255,136,0.4)' : 'rgba(28,115,191,0.25)'}`,
                    borderRadius: '10px',
                    padding: '12px 16px',
                    textAlign: 'center',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '1rem',
                    letterSpacing: '0.2em',
                    color: '#fff',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxShadow: error
                      ? '0 0 12px rgba(255,51,102,0.15)'
                      : success
                      ? '0 0 12px rgba(0,255,136,0.15)'
                      : 'none',
                  }}
                  onFocus={e => {
                    if (!error && !success) e.target.style.borderColor = 'rgba(174,234,248,0.4)'
                    if (!error && !success) e.target.style.boxShadow = '0 0 16px rgba(28,115,191,0.2)'
                  }}
                  onBlur={e => {
                    if (!error && !success) e.target.style.borderColor = 'rgba(28,115,191,0.25)'
                    if (!error && !success) e.target.style.boxShadow = 'none'
                  }}
                />

                {error && (
                  <div className="flex items-center gap-2 text-xs" style={{ color: '#ff3366' }}>
                    <AlertCircle size={13} className="shrink-0" />
                    {error}
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 text-xs" style={{ color: '#00ff88' }}>
                    <CheckCircle size={13} className="shrink-0" />
                    {isRenew ? 'Licença renovada! Entrando...' : 'Licença ativada! Entrando...'}
                  </div>
                )}
              </div>

              <button
                onClick={activateWithKey}
                disabled={!keyValid || loading || success}
                className="btn-primary w-full"
                style={(!keyValid || loading || success) ? { opacity: 0.35, cursor: 'not-allowed', transform: 'none' } : {}}
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /> VALIDANDO...</>
                ) : success ? (
                  <><CheckCircle size={14} /> {isRenew ? 'RENOVADO' : 'ATIVADO'}</>
                ) : (
                  isRenew ? 'RENOVAR LICENÇA' : 'ATIVAR LICENÇA'
                )}
              </button>
            </>
          )}

          <button
            onClick={() => {
              setAuthMethod(authMethod === 'email' ? 'legacy' : 'email')
              setError(null)
              setStage('email')
            }}
            style={{
              fontSize: '0.65rem',
              color: 'rgba(174,234,248,0.3)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'center',
              width: '100%',
            }}
          >
            {authMethod === 'email' ? 'Tenho uma chave de licença antiga' : '← Voltar pra ativação por e-mail'}
          </button>
        </div>

        {/* Links */}
        <div className="text-center space-y-3">
          {isTrialExpired ? (
            <a
              href="https://mk20creative.com/loja/produto/v2-game-optimizer"
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '0.8rem',
                letterSpacing: '0.12em',
                fontWeight: 700,
                padding: '10px 24px',
                borderRadius: '10px',
                textDecoration: 'none',
                background: 'linear-gradient(135deg, #9061CE, #6B21A8)',
                color: '#fff',
                boxShadow: '0 0 20px rgba(144,97,206,0.4)',
              }}
            >
              <ExternalLink size={13} />
              ASSINAR — R$19,90/MÊS
            </a>
          ) : (
            <a
              href="https://mk20creative.com/loja/produto/v2-game-optimizer"
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '0.7rem',
                letterSpacing: '0.1em',
                color: isRenew ? 'rgba(255,214,10,0.6)' : 'rgba(28,115,191,0.7)',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = isRenew ? '#ffd60a' : '#AEEAF8')}
              onMouseLeave={e => (e.currentTarget.style.color = isRenew ? 'rgba(255,214,10,0.6)' : 'rgba(28,115,191,0.7)')}
            >
              <ExternalLink size={11} />
              {isRenew ? 'RENOVAR ACESSO' : 'ASSINAR AGORA'}
            </a>
          )}

          {/* Test mode — dev only */}
          {import.meta.env.DEV && (
            <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(174,234,248,0.05)' }}>
              <p style={{ fontSize: '0.65rem', color: 'rgba(200,204,232,0.2)', marginBottom: '6px', fontFamily: 'Rajdhani', letterSpacing: '0.1em' }}>
                MODO TESTE
              </p>
              <button
                onClick={authMethod === 'email' ? fillTestEmail : fillTestKey}
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.7rem',
                  color: 'rgba(200,204,232,0.25)',
                  letterSpacing: '0.12em',
                  transition: 'color 0.15s',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(174,234,248,0.6)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(200,204,232,0.25)')}
              >
                {authMethod === 'email' ? TEST_EMAIL : TEST_KEY}
              </button>
              {authMethod === 'email' && stage === 'code' && (
                <p style={{ fontSize: '0.65rem', color: 'rgba(200,204,232,0.2)', marginTop: '4px' }}>código: 000000</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
