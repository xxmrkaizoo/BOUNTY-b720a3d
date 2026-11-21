import { Ban } from 'lucide-react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import SettingsButton from './components/SettingsButton.tsx'
import WaterBackground from './components/WaterBackground.tsx'
import { AuthProvider, useAuth } from './hooks/useAuth.tsx'
import { useT } from './lib/settings.tsx'
import ComputerHistory from './pages/ComputerHistory.tsx'
import Computers from './pages/Computers.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Join from './pages/Join.tsx'
import Login from './pages/Login.tsx'
import Maintenance from './pages/Maintenance.tsx'
import MonthlyReport from './pages/MonthlyReport.tsx'
import NewTicket from './pages/NewTicket.tsx'
import Portal from './pages/Portal.tsx'
import QrStickers from './pages/QrStickers.tsx'
import Reports from './pages/Reports.tsx'
import Settings from './pages/Settings.tsx'
import TicketDetail from './pages/TicketDetail.tsx'
import Users from './pages/Users.tsx'
import Vendors from './pages/Vendors.tsx'
import { LoadingScreen } from './components/Loading.tsx'

type Access = 'any' | 'internal' | 'admin' | 'technician'

function Loading() {
  const t = useT()
  return <LoadingScreen label={t('Loading…')} />
}

function NoAccess() {
  const { signOut, removed } = useAuth()
  const t = useT()
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <WaterBackground />
      <SettingsButton />
      <div className="card max-w-sm p-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-100/80 text-rose-600"><Ban className="size-6" /></div>
        <h1 className="mt-4 text-lg font-bold text-ink-900">{removed ? t('Account removed') : t('Access removed')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {removed ? t('Your LabFix account was deleted by a lab admin.') : t('Your LabFix access was turned off by a lab admin.')}{' '}
          {t('Contact the lab if you think this is a mistake.')}
        </p>
        <button className="btn-secondary mt-6" onClick={signOut}>{t('Sign out')}</button>
      </div>
    </div>
  )
}

/** Only same-site paths are allowed as a post-login destination. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : null
}

/** Gate a route by role. Technicians always land in their portal. */
function Protected({ children, access = 'any' }: { children: ReactNode; access?: Access }) {
  const { user, profile, loading, isAdmin, isInternal, isTechnician, removed } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (user && removed) return <NoAccess />
  if (!user || !profile) {
    // Remember where they were going (e.g. a scanned QR sticker) and return after sign-in.
    const here = location.pathname + location.search
    return <Navigate to={here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`} replace />
  }
  if (profile.role === 'disabled') return <NoAccess />
  if (access === 'internal' && !isInternal) return <Navigate to={isTechnician ? '/portal' : '/'} replace />
  if (access === 'admin' && !isAdmin) return <Navigate to={isTechnician ? '/portal' : '/'} replace />
  if (access === 'technician' && !isTechnician) return <Navigate to="/" replace />
  return <>{children}</>
}

function LoginRoute() {
  const { user, profile, loading, isTechnician, removed } = useAuth()
  const [params] = useSearchParams()
  if (loading) return <Loading />
  if (user && removed) return <NoAccess />
  if (user && profile) return <Navigate to={safeNext(params.get('next')) ?? (isTechnician ? '/portal' : '/')} replace />
  return <Login />
}

/** QR sticker link: /r/<computerId> opens the report form for that PC. */
function QrRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`/tickets/new?computer=${encodeURIComponent(id)}`} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/join/:code" element={<Join />} />
          <Route path="/r/:id" element={<QrRedirect />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<Protected access="internal"><Dashboard /></Protected>} />
            <Route path="tickets/new" element={<Protected access="internal"><NewTicket /></Protected>} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="computers" element={<Protected access="internal"><Computers /></Protected>} />
            <Route path="computers/qr" element={<Protected access="admin"><QrStickers /></Protected>} />
            <Route path="computers/:id" element={<Protected access="internal"><ComputerHistory /></Protected>} />
            <Route path="maintenance" element={<Protected access="admin"><Maintenance /></Protected>} />
            <Route path="reports/monthly" element={<Protected access="internal"><MonthlyReport /></Protected>} />
            <Route path="reports" element={<Protected access="internal"><Reports /></Protected>} />
            <Route path="settings" element={<Settings />} />
            <Route path="portal" element={<Protected access="technician"><Portal /></Protected>} />
            <Route path="vendors" element={<Protected access="admin"><Vendors /></Protected>} />
            <Route path="users" element={<Protected access="admin"><Users /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
