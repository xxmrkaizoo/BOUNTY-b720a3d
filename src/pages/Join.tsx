import { FirebaseError } from 'firebase/app'
import { Ban, Building, ClipboardList, HardHat, Lock, Mail, ShieldCheck, User } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import ForgotPassword from '../components/ForgotPassword.tsx'
import Logo from '../components/Logo.tsx'
import SettingsButton from '../components/SettingsButton.tsx'
import WaterBackground from '../components/WaterBackground.tsx'
import { useAuth, type PendingInvite } from '../hooks/useAuth.tsx'
import { translate as tr, useT } from '../lib/settings.tsx'
import { getInvite } from '../services/invites.ts'
import type { Invite } from '../types.ts'

function friendly(e: unknown): string {
  if (e instanceof FirebaseError) {
    switch (e.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return tr('Wrong email or password.')
      case 'auth/email-already-in-use':
        return tr('That email already has an account. Choose “I already have an account”.')
      case 'auth/weak-password':
        return tr('Password must be at least 6 characters.')
      case 'auth/invalid-email':
        return tr('Please enter a valid email.')
      case 'auth/too-many-requests':
        return tr('Too many attempts. Please wait a few minutes.')
      case 'auth/network-request-failed':
        return tr('Network error. Check your internet connection.')
    }
    return e.message
  }
  return tr('Something went wrong. Please try again.')
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <WaterBackground />
      <SettingsButton />
      <div className="glass w-full max-w-md animate-fade-up rounded-[2rem] p-6 sm:p-9">
        <div className="mb-6"><Logo /></div>
        {children}
      </div>
    </div>
  )
}

function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400 [&_svg]:size-4">{icon}</span>
      {children}
    </div>
  )
}

/**
 * Landing page for the link sent to a maintenance company.
 * New technicians sign up here and are registered under that company;
 * returning technicians just sign in. Then they go straight to the job.
 */
export default function Join() {
  const { code = '' } = useParams()
  const [params] = useSearchParams()
  const ticketId = params.get('ticket')
  const { user, profile, loading, profileError, signIn, signUp, signInWithGoogle, signOut } = useAuth()
  const t = useT()

  const [invite, setInvite] = useState<Invite | null | undefined>(undefined)
  const [mode, setMode] = useState<'signup' | 'signin' | 'reset'>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getInvite(code)
      .then((inv) => !cancelled && setInvite(inv && inv.active ? inv : null))
      .catch(() => !cancelled && setInvite(null))
    return () => {
      cancelled = true
    }
  }, [code])

  const target = ticketId ? `/tickets/${ticketId}` : '/portal'

  if (loading || invite === undefined) {
    return <Shell><p className="text-sm text-slate-500">{t('Checking your invite…')}</p></Shell>
  }

  // Already signed in as a technician of this company → go to the job.
  if (user && profile?.role === 'technician' && (!invite || profile.vendorId === invite.vendorId)) {
    return <Navigate to={target} replace />
  }

  if (!invite) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-rose-100/80 text-rose-600"><Ban className="size-6" /></div>
          <h1 className="text-xl font-bold text-ink-900">{t('This link has expired')}</h1>
          <p className="text-sm text-slate-500">{t('The lab may have created a new link. Please ask them to send it again.')}</p>
        </div>
      </Shell>
    )
  }

  // Signed in with some other account (lab staff, or another company).
  if (user && profile) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-ink-900">{t('You’re signed in as {name}', { name: profile.name })}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {profile.role === 'technician'
            ? t('This account is a technician of {company}, so it can’t join {invite}.', { company: profile.vendorName, invite: invite.vendorName })
            : t('This is a lab staff/admin account, so it can’t join {invite}.', { invite: invite.vendorName })}{' '}
          {t('Sign out, then open the link again to sign up as a technician.')}
        </p>
        <button className="btn-primary mt-6 w-full" onClick={signOut}>{t('Sign out')}</button>
      </Shell>
    )
  }

  const pending: PendingInvite = { code, vendorId: invite.vendorId, vendorName: invite.vendorName }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signup') await signUp(name, email, password, pending)
      else await signIn(email, password)
    } catch (err) {
      setError(friendly(err))
    } finally {
      setBusy(false)
    }
  }

  async function onGoogle() {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle(pending)
    } catch (err) {
      const c = (err as { code?: string }).code
      if (c !== 'auth/popup-closed-by-user' && c !== 'auth/cancelled-popup-request') setError(friendly(err))
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'reset') {
    // After resetting, come back to this same invite link.
    const back = `/join/${code}${ticketId ? `?ticket=${ticketId}` : ''}`
    return (
      <Shell>
        <ForgotPassword initialEmail={email} returnTo={back} onBack={() => setMode('signin')} />
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="keep-white flex items-start gap-3 rounded-2xl bg-linear-to-br from-brand-700 to-ink-900 p-4 text-on shadow-lift">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15"><HardHat className="size-5" /></span>
        <div>
          <div className="text-xs font-semibold tracking-wide text-brand-200 uppercase">{t('Maintenance portal invite')}</div>
          <div className="mt-0.5 flex items-center gap-1.5 font-bold"><Building className="size-4 text-accent-300" /> {invite.vendorName}</div>
          {ticketId && <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-300"><ClipboardList className="size-3.5" /> {t('A repair job is waiting for you')}</div>}
        </div>
      </div>

      <h1 className="mt-6 text-xl font-bold tracking-tight text-ink-900">
        {mode === 'signup' ? t('Create your technician account') : t('Welcome back')}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {mode === 'signup'
          ? t('You’ll be registered under {company} and see only jobs sent to your company.', { company: invite.vendorName })
          : t('Sign in to open the job.')}
      </p>

      {(error || profileError) && (
        <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{error ?? t(profileError ?? '')}</p>
      )}

      {mode === 'signup' && (
        <>
          <button type="button" onClick={onGoogle} disabled={busy} className="btn-secondary mt-6 w-full py-3">
            <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {t('Sign up with Google')}
          </button>
          <div className="my-5 flex items-center gap-3 text-xs font-medium text-slate-400">
            <div className="h-px flex-1 bg-slate-300/60" /> {t('or with email')} <div className="h-px flex-1 bg-slate-300/60" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className={`space-y-4 ${mode === 'signin' ? 'mt-6' : ''}`}>
        {mode === 'signup' && (
          <div>
            <label className="label" htmlFor="jname">{t('Your name')}</label>
            <Field icon={<User />}>
              <input id="jname" className="input pl-10" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Technician name')} />
            </Field>
          </div>
        )}
        <div>
          <label className="label" htmlFor="jemail">{t('Work email')}</label>
          <Field icon={<Mail />}>
            <input id="jemail" type="email" className="input pl-10" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label className="label" htmlFor="jpw">{t('Password')}</label>
            {mode === 'signin' && (
              <button type="button" className="text-xs font-semibold text-brand-600 hover:text-brand-700" onClick={() => setMode('reset')}>
                {t('Forgot password?')}
              </button>
            )}
          </div>
          <Field icon={<Lock />}>
            <input
              id="jpw"
              type="password"
              className="input pl-10"
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
        <button className="btn-primary w-full py-3" disabled={busy}>
          {busy ? t('Please wait…') : mode === 'signup' ? t('Join {company}', { company: invite.vendorName }) : t('Sign in')}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        {mode === 'signup' ? t('Already joined before?') : t('First time here?')}{' '}
        <button
          type="button"
          className="font-semibold text-brand-600 hover:text-brand-700"
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup')
            setError(null)
          }}
        >
          {mode === 'signup' ? t('I already have an account') : t('Create an account')}
        </button>
      </p>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="size-3.5" /> {t('You’ll only see jobs sent to {company}.', { company: invite.vendorName })}
      </p>
    </Shell>
  )
}
