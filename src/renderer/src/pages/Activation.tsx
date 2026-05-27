import { useState, useRef } from 'react'
import { Key, CheckCircle, AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import logoImg from '../assets/lgo.png.png'

interface Props {
  onActivated: () => void
  mode?: 'activate' | 'renew'
}

const TEST_KEY = 'V2GO-TEST-0000-0000'

function formatKey(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16)
  return clean.match(/.{1,4}/g)?.join('-') ?? clean
}

export default function Activation({ onActivated, mode = 'activate' }: Props) {
  const isRenew = mode === 'renew'
  const [key, setKey]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setKey(formatKey(e.target.value))
  }

  const activate = async () => {
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

  const fillTest = () => {
    setKey(TEST_KEY)
    setError(null)
    inputRef.current?.focus()
  }

  const valid = key.replace(/-/g, '').length === 16

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
            {isRenew && (
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <span style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '0.6rem',
                  letterSpacing: '0.18em',
                  fontWeight: 700,
                  color: 'rgba(255,214,10,0.8)',
                  background: 'rgba(255,214,10,0.08)',
                  border: '1px solid rgba(255,214,10,0.2)',
                  borderRadius: '4px',
                  padding: '2px 8px',
                }}>
                  LICENÇA EXPIRADA
                </span>
              </div>
            )}
            <p style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '0.7rem',
              letterSpacing: '0.2em',
              color: isRenew ? 'rgba(255,214,10,0.5)' : 'rgba(28,115,191,0.65)',
            }}>
              {isRenew ? 'RENOVE PARA CONTINUAR USANDO' : 'ATIVE SUA LICENÇA PARA CONTINUAR'}
            </p>
          </div>
        </div>

        {/* Activation card */}
        <div className="card-glow space-y-5">
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
              onChange={handleInput}
              onKeyDown={e => e.key === 'Enter' && valid && !loading && activate()}
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
            onClick={activate}
            disabled={!valid || loading || success}
            className="btn-primary w-full"
            style={(!valid || loading || success) ? { opacity: 0.35, cursor: 'not-allowed', transform: 'none' } : {}}
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> VALIDANDO...</>
            ) : success ? (
              <><CheckCircle size={14} /> {isRenew ? 'RENOVADO' : 'ATIVADO'}</>
            ) : (
              isRenew ? 'RENOVAR LICENÇA' : 'ATIVAR LICENÇA'
            )}
          </button>
        </div>

        {/* Links */}
        <div className="text-center space-y-3">
          <a
            href="https://v2gameoptimizer.com"
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
            {isRenew ? 'RENOVAR ACESSO — v2gameoptimizer.com' : 'COMPRAR LICENÇA'}
          </a>

          {/* Test mode — dev only */}
          {import.meta.env.DEV && (
            <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(174,234,248,0.05)' }}>
              <p style={{ fontSize: '0.65rem', color: 'rgba(200,204,232,0.2)', marginBottom: '6px', fontFamily: 'Rajdhani', letterSpacing: '0.1em' }}>
                MODO TESTE
              </p>
              <button
                onClick={fillTest}
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
                {TEST_KEY}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
