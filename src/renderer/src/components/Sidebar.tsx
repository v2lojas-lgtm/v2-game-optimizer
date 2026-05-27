import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Cpu, Activity, Wifi, BarChart2,
  Gamepad2, Rocket, Settings, Shield, ScanSearch, Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

function NavItem({ to, icon: Icon, labelKey, accent = 'cyan' }: {
  to: string; icon: React.ElementType; labelKey: string; accent?: string
}) {
  const { t } = useTranslation()
  const label = t(labelKey)
  const accentColor  = accent === 'green' ? '#00ff88' : accent === 'violet' ? '#9061CE' : '#AEEAF8'
  const accentBg     = accent === 'green' ? 'rgba(0,255,136,0.08)' : accent === 'violet' ? 'rgba(144,97,206,0.1)' : 'rgba(28,115,191,0.1)'
  const accentBorder = accent === 'green' ? 'rgba(0,255,136,0.2)'  : accent === 'violet' ? 'rgba(144,97,206,0.3)' : 'rgba(28,115,191,0.3)'

  return (
    <NavLink to={to}>
      {({ isActive }) => (
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 group"
          style={isActive ? {
            background: accentBg,
            border: `1px solid ${accentBorder}`,
            boxShadow: `0 0 16px ${accentBg}`,
          } : {
            border: '1px solid transparent',
          }}
        >
          {/* Icon */}
          <div className="relative flex items-center justify-center w-7 h-7 rounded-md shrink-0 transition-all"
            style={isActive ? {
              background: `${accentColor}18`,
            } : {
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            <Icon
              size={14}
              style={isActive
                ? { color: accentColor, filter: `drop-shadow(0 0 6px ${accentColor})` }
                : { color: 'rgba(200,204,232,0.3)' }
              }
              className="group-hover:!text-slate-300 transition-colors"
            />
            {isActive && (
              <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
              />
            )}
          </div>

          {/* Label */}
          <span
            className="text-xs font-semibold transition-colors"
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              letterSpacing: '0.06em',
              color: isActive ? accentColor : 'rgba(200,204,232,0.35)',
            }}
          >
            {label.toUpperCase()}
          </span>
        </div>
      )}
    </NavLink>
  )
}

const NAV_ITEMS = [
  { to: '/dashboard',  icon: LayoutDashboard, labelKey: 'nav.dashboard'  },
  { to: '/hardware',   icon: Cpu,             labelKey: 'nav.hardware'   },
  { to: '/processes',  icon: Activity,        labelKey: 'nav.processes'  },
  { to: '/network',    icon: Wifi,            labelKey: 'nav.network'    },
  { to: '/benchmark',  icon: BarChart2,       labelKey: 'nav.benchmark'  },
  { to: '/profiles',   icon: Gamepad2,        labelKey: 'nav.profiles'   },
  { to: '/optimize',   icon: Rocket,          labelKey: 'nav.optimize'   },
  { to: '/tournament', icon: Zap,             labelKey: 'nav.tournament', accent: 'violet' },
  { to: '/diagnosis',  icon: ScanSearch,      labelKey: 'nav.diagnosis'  },
]

const BOTTOM_ITEMS = [
  { to: '/anticheat', icon: Shield,   labelKey: 'nav.integrity', accent: 'green' },
  { to: '/settings',  icon: Settings, labelKey: 'nav.settings',  accent: 'none'  },
]

export default function Sidebar() {
  return (
    <aside
      className="flex flex-col shrink-0"
      style={{
        width: '180px',
        background: 'linear-gradient(180deg, rgba(1,7,35,0.98) 0%, rgba(2,15,41,0.96) 100%)',
        borderRight: '1px solid rgba(28,115,191,0.08)',
        boxShadow: 'inset -1px 0 0 rgba(28,115,191,0.05)',
      }}
    >
      {/* Main nav */}
      <nav className="flex-1 flex flex-col gap-0.5 p-3 pt-4">
        {NAV_ITEMS.map(item => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-3 divider" />

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5 p-3 pb-4">
        {BOTTOM_ITEMS.map(item => (
          <NavItem key={item.to} {...item} />
        ))}
      </div>
    </aside>
  )
}
