import { FirebaseError } from 'firebase/app'
import { Activity, Lock, Mail, PhoneCall, QrCode, ShieldCheck, User, Wrench } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import ForgotPassword from '../components/ForgotPassword.tsx'
import SettingsButton from '../components/SettingsButton.tsx'
import Logo from '../components/Logo.tsx'
import WaterBackground from '../components/WaterBackground.tsx'
import { useAuth } from '../hooks/useAuth.tsx'
import { translate as tr, useT } from '../lib/settings.tsx'

function friendlyError(e: unknown): string {
  if (e instanceof FirebaseError) {
    switch (e.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return tr('Wrong email or password.')
      case 'auth/email-already-in-use':
        return tr('That email already has an account. Sign in instead.')
      case 'auth/weak-password':
        return tr('Password must be at least 6 characters.')
      case 'auth/invalid-email':
        return tr('Please enter a valid email.')
      case 'auth/configuration-not-found':
      case 'auth/operation-not-allowed':
        return tr('Sign-in is not enabled for this app yet. An admin must enable it in Firebase Console → Authentication → Sign-in method.')
      case 'auth/unauthorized-domain':
        return tr('This website address is not allowed to sign in. Add it in Firebase Console → Authentication → Settings → Authorized domains.')
      case 'auth/account-exists-with-different-credential':
        return tr('This email already has an account with a different sign-in method. Sign in with email and password.')
      case 'auth/too-many-requests':
        return tr('Too many attempts. Please wait a few minutes and try again.')
      case 'auth/network-request-failed':
        return tr('Network error. Check your internet connection.')
    }
    return e.message
  }
  return tr('Something went wrong. Please try again.')
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-4">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-300 ring-1 ring-white/10 [&_svg]:size-5">{icon}</div>
      <div>
        <div className="font-semibold text-on">{title}</div>
        <div className="text-sm text-slate-400">{text}</div>
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

export default function Login() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const t = useT()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(params.get('mode') === 'reset' ? 'reset' : 'signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signin') await signIn(email, password)
      else await signUp(name, email, password)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onGoogle() {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      // Closing the Google window on purpose isn't an error.
      const code = (err as { code?: string }).code
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError(friendlyError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <WaterBackground />
      <SettingsButton />
      {/* Brand panel */}
      <section className="keep-white relative m-3 hidden overflow-hidden rounded-[2rem] bg-linear-to-br from-brand-700 via-brand-900 to-ink-950 p-12 shadow-lift lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-40 -right-40 size-[32rem] rounded-full bg-accent-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-brand-400/30 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="relative"><Logo dark /></div>

        <div className="relative my-auto max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-400/10 px-3 py-1 text-xs font-semibold text-brand-300 ring-1 ring-brand-400/20">
            <span className="size-1.5 animate-pulse rounded-full bg-brand-400" /> {t('Lab maintenance, simplified')}
          </span>
          <h1 className="mt-5 text-4xl leading-tight font-extrabold tracking-tight text-on xl:text-5xl">
            {t('Broken PC?')} <br />
            <span className="bg-linear-to-r from-accent-300 to-brand-300 bg-clip-text text-transparent">{t('Fixed faster.')}</span>
          </h1>
          <p className="mt-4 text-slate-400">
            {t('Report faulty lab computers in seconds, track every repair live, and reach your maintenance company with one tap.')}
          </p>
          <div className="mt-10 space-y-6">
            <Feature icon={<Wrench />} title={t('Report in seconds')} text={t('Pick the lab and PC, describe the problem, done.')} />
            <Feature icon={<PhoneCall />} title={t('One-tap vendor call')} text={t('Phone, WhatsApp or email with details pre-filled.')} />
            <Feature icon={<Activity />} title={t('Live repair tracking')} text={t('Every status change and call logged on a timeline.')} />
          </div>
        </div>

        <p className="relative flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="size-4" /> {t('Secured with Firebase Authentication')}
        </p>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="glass w-full max-w-md animate-fade-up rounded-[2rem] p-6 sm:p-10">
          <div className="mb-8 lg:hidden"><Logo /></div>
          {mode === 'reset' ? (
            <ForgotPassword
              initialEmail={email || params.get('email') || ''}
              onBack={() => {
                setMode('signin')
                setError(null)
              }}
            />
          ) : (
          <>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {mode === 'signin' ? t('Welcome back') : t('Create your account')}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'signin' ? t('Sign in to report and track lab repairs.') : t('Join your lab team on LabFix.')}
          </p>
          {params.get('next')?.startsWith('/tickets/new') && (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-800 ring-1 ring-brand-200">
              <QrCode className="size-4 shrink-0" /> {t('Sign in to report the PC you scanned. You’ll go straight to the form.')}
            </p>
          )}

          <button type="button" onClick={onGoogle} disabled={busy} className="btn-secondary mt-8 w-full py-3">
            <GoogleIcon />
            {t('Continue with Google')}
          </button>

          <div className="my-6 flex items-center gap-3 text-xs font-medium text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            {t('or with email')}
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label" htmlFor="name">{t('Full name')}</label>
                <Field icon={<User />}>
                  <input id="name" className="input pl-10" required placeholder={t('e.g. Ahmad bin Ali')} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">{t('Email')}</label>
              <Field icon={<Mail />}>
                <input id="email" type="email" className="input pl-10" required autoComplete="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label className="label" htmlFor="password">{t('Password')}</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                    onClick={() => {
                      setMode('reset')
                      setError(null)
                    }}
                  >
                    {t('Forgot password?')}
                  </button>
                )}
              </div>
              <Field icon={<Lock />}>
                <input
                  id="password"
                  type="password"
                  className="input pl-10"
                  required
                  minLength={6}
                  placeholder={t('At least 6 characters')}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </div>
            {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}
            <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
              {busy ? t('Please wait…') : mode === 'signin' ? t('Sign in') : t('Create account')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === 'signin' ? t('New to LabFix?') : t('Already have an account?')}{' '}
            <button
              type="button"
              className="font-semibold text-brand-600 hover:text-brand-700"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(null)
              }}
            >
              {mode === 'signin' ? t('Create an account') : t('Sign in')}
            </button>
          </p>
          </>
          )}
        </div>
      </section>
    </div>
  )
}
