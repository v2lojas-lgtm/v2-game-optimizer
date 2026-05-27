import { Minus, Square, X, Layers, Zap } from 'lucide-react'
import { useState, useEffect } from 'react'
import logoImg from '../assets/lgo.png.png'

interface BoostState {
  active: boolean
  game: string | null
  gameName?: string
}

export default function TitleBar() {
  const [_maximized, setMaximized]   = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [boost, setBoost]             = useState<BoostState>({ active: false, game: null })

  useEffect(() => {
    const check = async () => {
      if (!window.api?.window?.isMaximized) return
      setMaximized(await window.api.window.isMaximized())
    }
    check()

    // Listen for push events from Python watcher
    const unsub = window.api?.python?.onEvent?.((event: string, data: any) => {
      if (event === 'game_start') {
        setBoost({ active: true, game: data?.game, gameName: data?.name })
      }
      if (event === 'game_stop') {
        setBoost({ active: false, game: null })
      }
    })
    return () => unsub?.()
  }, [])

  const handleMaximize = async () => {
    if (!window.api?.window?.maximize) return
    await window.api.window.maximize()
    setMaximized(!!(await window.api.window.isMaximized()))
  }

  const toggleOverlay = async () => {
    if (!window.api?.overlay?.toggle) return
    setOverlayOpen(!!(await window.api.overlay.toggle()))
  }

  return (
    <div className="drag-region flex items-center justify-between shrink-0"
      style={{
        height: '42px',
        background: 'linear-gradient(180deg, rgba(1,7,35,0.99) 0%, rgba(2,15,41,0.97) 100%)',
        borderBottom: '1px solid rgba(28,115,191,0.1)',
        boxShadow: '0 1px 0 rgba(28,115,191,0.05)',
      }}
    >
      {/* Logo */}
      <div className="no-drag flex items-center gap-2.5 px-4">
        {/* Logo image */}
        <img
          src={logoImg}
          alt="V2 Game Optimizer"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            objectFit: 'cover',
            filter: 'drop-shadow(0 0 6px rgba(28,115,191,0.7)) drop-shadow(0 0 12px rgba(144,97,206,0.4))',
          }}
        />

        <div className="flex items-baseline gap-1.5">
          <span style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: '0.88rem',
            letterSpacing: '0.12em',
            color: '#e8eaf8',
            textShadow: '0 0 20px rgba(174,234,248,0.4)',
          }}>
            V2
          </span>
          <span style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 600,
            fontSize: '0.72rem',
            letterSpacing: '0.07em',
            color: 'rgba(28,115,191,0.75)',
          }}>
            GAME OPTIMIZER
          </span>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 ml-2 pl-2"
          style={{ borderLeft: '1px solid rgba(174,234,248,0.06)' }}>
          <span className="live-dot" />
          <span style={{ fontFamily: 'Rajdhani', fontSize: '0.6rem', letterSpacing: '0.14em', color: 'rgba(0,255,136,0.55)' }}>
            LIVE
          </span>
        </div>
      </div>

      {/* Center: boost badge + overlay toggle */}
      <div className="no-drag flex items-center gap-2">
        {/* Boost badge */}
        {boost.active && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{
              background: 'rgba(0,255,136,0.08)',
              border: '1px solid rgba(0,255,136,0.25)',
              boxShadow: '0 0 12px rgba(0,255,136,0.1)',
              animation: 'livePulse 2s ease-in-out infinite',
            }}
          >
            <Zap size={11} style={{ color: '#00ff88', filter: 'drop-shadow(0 0 4px #00ff88)' }} />
            <span style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '0.6rem',
              letterSpacing: '0.14em',
              fontWeight: 700,
              color: '#00ff88',
            }}>
              BOOST · {boost.gameName ?? boost.game?.toUpperCase()}
            </span>
          </div>
        )}

        <button
          onClick={toggleOverlay}
          title="Ativar/desativar overlay (Ctrl+Shift+O)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '8px',
            fontFamily: 'Rajdhani, sans-serif',
            letterSpacing: '0.08em',
            fontSize: '0.62rem',
            fontWeight: 600,
            transition: 'all 0.15s',
            color: overlayOpen ? '#AEEAF8' : 'rgba(200,204,232,0.3)',
            background: overlayOpen ? 'rgba(28,115,191,0.1)' : 'transparent',
            border: overlayOpen ? '1px solid rgba(28,115,191,0.3)' : '1px solid transparent',
            boxShadow: overlayOpen ? '0 0 12px rgba(28,115,191,0.15)' : 'none',
          }}
          onMouseEnter={e => {
            if (!overlayOpen) {
              e.currentTarget.style.color = 'rgba(200,204,232,0.6)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
            }
          }}
          onMouseLeave={e => {
            if (!overlayOpen) {
              e.currentTarget.style.color = 'rgba(200,204,232,0.3)'
              e.currentTarget.style.background = 'transparent'
            }
          }}
        >
          <Layers size={12} style={overlayOpen ? { filter: 'drop-shadow(0 0 4px rgba(174,234,248,0.8))' } : {}} />
          {overlayOpen ? 'OVERLAY ON' : 'OVERLAY'}
        </button>
      </div>

      {/* Window controls */}
      <div className="flex items-center no-drag">
        <button
          onClick={() => window.api?.window?.minimize?.()}
          className="flex items-center justify-center transition-colors"
          style={{ width: '46px', height: '42px', color: 'rgba(200,204,232,0.35)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#c8cce8'; e.currentTarget.style.background = 'rgba(28,115,191,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(200,204,232,0.35)'; e.currentTarget.style.background = '' }}
        >
          <Minus size={13} />
        </button>
        <button
          onClick={handleMaximize}
          className="flex items-center justify-center transition-colors"
          style={{ width: '46px', height: '42px', color: 'rgba(200,204,232,0.35)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#c8cce8'; e.currentTarget.style.background = 'rgba(28,115,191,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(200,204,232,0.35)'; e.currentTarget.style.background = '' }}
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => window.api?.window?.close?.()}
          className="flex items-center justify-center transition-colors"
          style={{ width: '46px', height: '42px', color: 'rgba(200,204,232,0.35)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,51,102,0.7)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(200,204,232,0.35)'; e.currentTarget.style.background = '' }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
