import { useId } from 'react'
import { translate } from '../lib/settings.tsx'

/**
 * LabFix loading animation: a glass filling with water around the wrench.
 * The styles (`.lf-*`) live in index.html so the very same animation is
 * already showing before any JavaScript has loaded, with no jump when React takes over.
 */
function Glass() {
  const id = useId().replace(/:/g, '')
  return (
    <div className="lf-orb" aria-hidden="true">
      <span className="lf-ring" />
      <span className="lf-ring lf-r2" />
      <svg className="lf-glass" viewBox="0 0 120 120">
        <defs>
          <clipPath id={`clip-${id}`}>
            <circle cx="60" cy="60" r="50" />
          </clipPath>
          <linearGradient id={`water-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#59a1fc" />
            <stop offset="1" stopColor="#1549d4" />
          </linearGradient>
        </defs>
        <circle className="lf-bowl" cx="60" cy="60" r="50" />
        <g clipPath={`url(#clip-${id})`}>
          <g className="lf-level">
            <path className="lf-wave lf-back" fill="#59a1fc" d="M0 62q15-8 30 0t30 0 30 0 30 0 30 0 30 0V140H0z" />
            <path className="lf-wave" fill={`url(#water-${id})`} d="M0 66q15 8 30 0t30 0 30 0 30 0 30 0 30 0V140H0z" />
          </g>
        </g>
        <circle className="lf-rim" cx="60" cy="60" r="50" />
        <path className="lf-shine" d="M30 42a36 36 0 0 1 16-16" />
        <g transform="translate(26 26) scale(1.06)">
          <path className="lf-tool" d="M38.5 17.5a9 9 0 0 0-11.7 11.4L16 39.7a3.5 3.5 0 0 0 5 5l10.8-10.8a9 9 0 0 0 11.4-11.7l-5.6 5.6-4.2-1.2-1.2-4.2z" />
          <circle className="lf-dot" cx="46" cy="44" r="6" />
        </g>
      </svg>
    </div>
  )
}

/** Full-screen loader: app start-up and while sign-in is being checked. */
export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div className="lf-splash" role="status" aria-live="polite">
      <Glass />
      <div className="lf-word">
        Lab<b>Fix</b>
      </div>
      <div className="lf-bar">
        <span />
      </div>
      <div className="lf-text">{label ?? translate('Loading…')}</div>
    </div>
  )
}

/** Smaller loader inside a page, e.g. while a list is loading. */
export function Loader({ label }: { label?: string }) {
  return (
    <div className="lf-splash lf-inline text-slate-700" role="status" aria-live="polite">
      <Glass />
      <div className="lf-text">{label ?? translate('Loading…')}</div>
    </div>
  )
}
