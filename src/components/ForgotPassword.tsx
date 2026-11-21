import { FirebaseError } from 'firebase/app'
import { ArrowLeft, KeyRound, Mail, MailCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth.tsx'
import { useT } from '../lib/settings.tsx'

const RESEND_AFTER = 30 // seconds

/**
 * "Forgot password?" panel: sends a Firebase password-reset email.
 * For privacy it always says "if an account exists…", so nobody can use it
 * to find out which emails are registered.
 */
export default function ForgotPassword({ initialEmail = '', returnTo, onBack }: { initialEmail?: string; returnTo?: string; onBack: () => void }) {
  const { resetPassword } = useAuth()
  const t = useT()
  const [email, setEmail] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await resetPassword(email, returnTo)
      setSentTo(email.trim())
      setWait(RESEND_AFTER)
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : ''
      if (code === 'auth/user-not-found') {
        // Don't reveal whether the account exists.
        setSentTo(email.trim())
        setWait(RESEND_AFTER)
      } else if (code === 'auth/invalid-email' || code === 'auth/missing-email') {
        setError(t('Please enter a valid email address.'))
      } else if (code === 'auth/too-many-requests') {
        setError(t('Too many requests. Please wait a few minutes and try again.'))
      } else if (code === 'auth/network-request-failed') {
        setError(t('Network error. Check your internet connection.'))
      } else {
        setError(t('Could not send the email. Please try again.'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <div className="animate-fade-up text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100/80 text-emerald-600"><MailCheck className="size-6" /></div>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-ink-900">{t('Check your email')}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t('If an account exists for {email}, we’ve sent a link to reset your password.', { email: sentTo })}
        </p>
        <ul className="mt-5 space-y-1.5 rounded-2xl bg-white/60 p-4 text-left text-xs text-slate-600 ring-1 ring-white">
          <li>• {t('The link opens a page where you choose a new password.')}</li>
          <li>• {t('Then come back here and sign in with it.')}</li>
          <li>• {t('Not there after a minute? Check your spam or junk folder.')}</li>
        </ul>
        <button className="btn-secondary mt-5 w-full" disabled={busy || wait > 0} onClick={() => send()}>
          {wait > 0 ? t('Resend email in {n}s', { n: wait }) : busy ? t('Sending…') : t('Resend email')}
        </button>
        <button className="btn-ghost mt-2 w-full" onClick={onBack}>
          <ArrowLeft /> {t('Back to sign in')}
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <div className="grid size-12 place-items-center rounded-2xl bg-brand-100/80 text-brand-600"><KeyRound className="size-5" /></div>
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{t('Forgot your password?')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('Enter your account email and we’ll send you a link to set a new one.')}</p>
      <form onSubmit={send} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="reset-email">{t('Email')}</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="reset-email"
              type="email"
              className="input pl-10"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}
        <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
          {busy ? t('Sending…') : t('Send reset link')}
        </button>
      </form>
      <button className="btn-ghost mt-3 w-full" onClick={onBack}>
        <ArrowLeft /> {t('Back to sign in')}
      </button>
      <p className="mt-4 text-center text-xs text-slate-400">{t('Signed up with Google? Just use “Continue with Google”, no password needed.')}</p>
    </div>
  )
}
