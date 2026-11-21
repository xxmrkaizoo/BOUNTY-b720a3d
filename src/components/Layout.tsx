import { Building, CalendarClock, ChartColumn, Download, CirclePlus, ClipboardList, LayoutDashboard, LogOut, Menu, Monitor, Settings, Users, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.tsx'
import { useInstall } from '../lib/pwa.ts'
import { useT } from '../lib/settings.tsx'
import SettingsButton from './SettingsButton.tsx'
import Logo from './Logo.tsx'
import { NoticesProvider, NotificationBell } from './Notifications.tsx'
import ScheduleRunner from './ScheduleRunner.tsx'
import WaterBackground from './WaterBackground.tsx'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  admin?: boolean
}

/** Maintenance-company technicians get their own, smaller menu. */
const TECH_NAV: NavItem[] = [{ to: '/portal', label: 'Repair jobs', icon: ClipboardList }]

const NAV: NavItem[] = [
  { to: '/', label: 'Tickets', icon: LayoutDashboard, end: true },
  { to: '/tickets/new', label: 'Report Fault', icon: CirclePlus },
  { to: '/computers', label: 'Computers', icon: Monitor },
  { to: '/reports', label: 'Reports', icon: ChartColumn },
  { to: '/maintenance', label: 'Planned jobs', icon: CalendarClock, admin: true },
  { to: '/vendors', label: 'Maintenance Co.', icon: Building, admin: true },
  { to: '/users', label: 'Users', icon: Users, admin: true },
]

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
}

function Sidebar({ onNavigate, bell }: { onNavigate?: () => void; bell?: boolean }) {
  const { profile, isAdmin, isTechnician, signOut } = useAuth()
  const t = useT()
  const items = isTechnician ? TECH_NAV : NAV.filter((n) => !n.admin || isAdmin)
  const install = useInstall()

  return (
    <div className="keep-white flex h-full flex-col border-r border-white/10 bg-linear-to-b from-brand-800/90 via-ink-900/90 to-ink-950/95 text-slate-300 shadow-[inset_-1px_0_0_rgb(255_255_255/0.06)] backdrop-blur-2xl">
      <div className="flex items-center justify-between gap-2 pt-6 pr-3 pb-8 pl-5">
        <Link to={isTechnician ? '/portal' : '/'} onClick={onNavigate}><Logo dark /></Link>
        {bell && <NotificationBell dark />}
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{t('Menu')}</p>
        {items.map(({ to, label, icon: Icon, end, admin }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive ? 'bg-white/15 text-on shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-2 bottom-2 left-0 w-1 rounded-r-full bg-accent-400 shadow-[0_0_12px_rgb(34_211_238/0.8)]" />}
                <Icon className={`size-[18px] ${isActive ? 'text-brand-300' : 'text-slate-400 group-hover:text-slate-200'}`} />
                {t(label)}
                {admin && (
                  <span className="ml-auto rounded-md bg-accent-500/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-400">{t('ADMIN')}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Settings: pinned to the bottom-left on every page */}
      <div className="space-y-1 px-3">
        {install.state === 'available' && (
          <button
            onClick={install.install}
            className="flex w-full items-center gap-3 rounded-xl bg-accent-500/15 px-3 py-2.5 text-sm font-semibold text-accent-300 transition hover:bg-accent-500/25"
          >
            <Download className="size-[18px]" /> {t('Install app')}
          </button>
        )}
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive ? 'bg-white/15 text-on' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
            }`
          }
        >
          <Settings className="size-[18px]" /> {t('Settings')}
        </NavLink>
      </div>

      <div className="m-3 mt-2 rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-linear-to-br from-accent-400 to-brand-600 text-sm font-bold text-on">
            {initials(profile?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-on">{profile?.name}</div>
            {isTechnician ? (
              <div className="line-clamp-2 text-xs leading-snug text-slate-400" title={profile?.vendorName}>
                {t('Technician')} · {profile?.vendorName}
              </div>
            ) : (
              <div className="text-xs text-slate-400">{profile?.role === 'admin' ? t('Admin') : t('Staff')}</div>
            )}
          </div>
          <button onClick={signOut} title={t('Sign out')} aria-label={t('Sign out')} className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-on">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open])

  return (
    <NoticesProvider>
    <ScheduleRunner />
    <div className="min-h-screen lg:pl-64 print:pl-0">
      <div className="print:hidden"><WaterBackground /></div>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block print:hidden!">
        <Sidebar bell />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/60 bg-white/50 px-4 py-3 backdrop-blur-xl lg:hidden print:hidden">
        <Link to="/"><Logo /></Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button onClick={() => setOpen(true)} className="btn-ghost p-2" aria-label={t('Open menu')}>
            <Menu className="size-5!" />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-fade-up shadow-2xl">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button
              onClick={() => setOpen(false)}
              className="absolute top-5 right-3 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-on"
              aria-label={t('Close menu')}
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}

      {/* Phones: the sidebar is hidden, so settings get a floating button. */}
      <SettingsButton className="lg:hidden print:hidden" />

      <main key={pathname} className="mx-auto max-w-6xl animate-fade-up px-4 pt-6 pb-24 sm:px-6 lg:px-10 lg:py-10 print:max-w-none print:animate-none print:p-0">
        <Outlet />
      </main>
    </div>
    </NoticesProvider>
  )
}
