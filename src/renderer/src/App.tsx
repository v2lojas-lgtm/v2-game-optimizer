import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import logoImg from './assets/lgo.png.png'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import Dashboard from './pages/Dashboard'
import Hardware from './pages/Hardware'
import Network from './pages/Network'
import Profiles from './pages/Profiles'
import Optimize from './pages/Optimize'
import Processes from './pages/Processes'
import Benchmark from './pages/Benchmark'
import Integrity from './pages/Integrity'
import Settings from './pages/Settings'
import Activation from './pages/Activation'
import OverlayPage from './pages/Overlay'
import Diagnosis from './pages/Diagnosis'
import Tournament from './pages/Tournament'
import SessionSummary, { type SessionSummaryData } from './components/SessionSummary'
import './overlay.css'

function OverlayShell() {
  return (
    <div className="overlay-root">
      <OverlayPage />
    </div>
  )
}

interface AutoCloseToast {
  count: number
  names: string[]
}

function MainShell() {
  const [sessionData, setSessionData] = useState<SessionSummaryData | null>(null)
  const [autoCloseToast, setAutoCloseToast] = useState<AutoCloseToast | null>(null)

  useEffect(() => {
    if (!window.api?.python?.onEvent) return
    const unsub = window.api.python.onEvent(async (event, data) => {
      if (event === 'session_summary' && data) {
        setSessionData(data as SessionSummaryData)
      }

      if (event === 'game_start') {
        const enabled = localStorage.getItem('v2_autoclose_procs') === 'true'
        if (!enabled) return
        try {
          const procs = await window.api.python.invoke('interference_processes') as Array<{ pid: number; name: string; running: boolean }>
          const targets = (procs ?? []).filter(p => p.running)
          if (targets.length === 0) return
          const pids = targets.map(p => p.pid)
          await window.api.python.invoke('close_selected', { pids })
          setAutoCloseToast({ count: targets.length, names: targets.slice(0, 3).map(p => p.name) })
          setTimeout(() => setAutoCloseToast(null), 4000)
        } catch {
          // silently ignore — auto-close is best-effort
        }
      }
    })
    return unsub
  }, [])

  return (
    <div className="flex flex-col h-screen text-slate-200" style={{ background: '#010723' }}>
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/hardware" element={<Hardware />} />
            <Route path="/processes" element={<Processes />} />
            <Route path="/network" element={<Network />} />
            <Route path="/benchmark" element={<Benchmark />} />
            <Route path="/profiles" element={<Profiles />} />
            <Route path="/optimize"    element={<Optimize />} />
            <Route path="/tournament"  element={<Tournament />} />
            <Route path="/diagnosis"   element={<Diagnosis />} />
            <Route path="/anticheat" element={<Integrity />} />
            <Route path="/settings"  element={<Settings />} />
          </Routes>
        </main>
      </div>

      {/* Session Summary modal — appears automatically when game closes */}
      {sessionData && (
        <SessionSummary
          data={sessionData}
          onClose={() => setSessionData(null)}
        />
      )}

      {/* Auto-close toast — shown briefly when processes are closed on game_start */}
      {autoCloseToast && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-xl"
          style={{
            background: 'rgba(2,15,41,0.97)',
            border: '1px solid rgba(0,255,136,0.2)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(0,255,136,0.06)',
            backdropFilter: 'blur(12px)',
            maxWidth: 320,
            animation: 'fadeInUp 0.25s ease',
          }}
        >
          <div
            className="mt-0.5 w-2 h-2 rounded-full shrink-0"
            style={{ background: '#00ff88', boxShadow: '0 0 6px #00ff88', marginTop: 5 }}
          />
          <div className="min-w-0">
            <p style={{ fontFamily: 'Rajdhani', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.1em', color: 'rgba(0,255,136,0.85)' }}>
              AUTO-CLOSE — {autoCloseToast.count} APP{autoCloseToast.count > 1 ? 'S' : ''} FECHADO{autoCloseToast.count > 1 ? 'S' : ''}
            </p>
            <p style={{ fontFamily: 'Inter', fontSize: '0.65rem', color: 'rgba(184,184,208,0.45)', marginTop: 2 }}>
              {autoCloseToast.names.join(', ')}{autoCloseToast.count > 3 ? ` +${autoCloseToast.count - 3}` : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-5"
      style={{ background: '#010723' }}>
      <img
        src={logoImg}
        alt="V2"
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          filter: 'drop-shadow(0 0 16px rgba(28,115,191,0.8)) drop-shadow(0 0 32px rgba(144,97,206,0.4))',
        }}
      />
      <div
        className="animate-spin rounded-full"
        style={{
          width: '20px',
          height: '20px',
          border: '2px solid rgba(28,115,191,0.15)',
          borderTopColor: '#1C73BF',
        }}
      />
    </div>
  )
}

type LicenseState = 'checking' | 'ok' | 'required' | 'expired'

export default function App() {
  const location = useLocation()
  const [license, setLicense] = useState<LicenseState>('checking')

  useEffect(() => {
    // Overlay route and browser preview skip license check
    if (location.pathname === '/overlay' || !window.api?.python?.invoke) {
      setLicense('ok')
      return
    }
    window.api.python.invoke('check_license')
      .then((res: any) => {
        if (res?.valid) setLicense('ok')
        else if (res?.reason === 'expired') setLicense('expired')
        else setLicense('required')
      })
      .catch(() => setLicense('required'))
  }, [])

  if (location.pathname === '/overlay') return <OverlayShell />
  if (license === 'checking') return <LoadingScreen />
  if (license === 'required') return <Activation onActivated={() => setLicense('ok')} />
  if (license === 'expired')  return <Activation onActivated={() => setLicense('ok')} mode="renew" />
  return <MainShell />
}
