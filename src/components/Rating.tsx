import { Star } from 'lucide-react'
import { useState } from 'react'
import { formatDateTime } from '../lib/format.ts'
import { useT } from '../lib/settings.tsx'
import type { TicketRating } from '../types.ts'

/** Read-only stars, e.g. ★★★★☆. `value` may be a fraction (averages). */
export function Stars({ value, size = 'size-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`relative ${size}`}>
          <Star className={`absolute inset-0 ${size} text-slate-300`} />
          <span className="absolute inset-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(1, value - i + 1)) * 100}%` }}>
            <Star className={`${size} fill-amber-400 text-amber-400`} />
          </span>
        </span>
      ))}
    </span>
  )
}

const HINTS = ['', 'Very poor', 'Poor', 'Okay', 'Good', 'Excellent']

/**
 * "How was the repair?" card on a finished ticket. The reporter (or an admin)
 * rates it once; everyone else sees the result.
 */
export function RatingCard({
  rating,
  canRate,
  onRate,
}: {
  rating: TicketRating | null | undefined
  canRate: boolean
  onRate: (stars: number, comment: string) => Promise<void>
}) {
  const t = useT()
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (rating) {
    return (
      <section className="card space-y-2 p-5">
        <h2 className="font-bold text-slate-900">{t('Repair rating')}</h2>
        <div className="flex items-center gap-2">
          <Stars value={rating.stars} size="size-5" />
          <span className="text-sm font-semibold text-slate-700">{t(HINTS[rating.stars])}</span>
        </div>
        {rating.comment && <p className="rounded-xl bg-white/60 p-3 text-sm text-slate-700 ring-1 ring-white">“{rating.comment}”</p>}
        <p className="text-xs text-slate-400">{rating.by?.name} · {formatDateTime(rating.at)}</p>
      </section>
    )
  }
  if (!canRate) return null

  const shown = hover || stars
  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-bold text-slate-900">{t('How was the repair?')}</h2>
        <p className="text-xs text-slate-500">{t('Your rating goes into the maintenance company’s scorecard.')}</p>
      </div>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setHover(i)}
            onClick={() => setStars(i)}
            className="rounded-lg p-0.5 transition hover:scale-110"
            aria-label={t('{n} stars', { n: i })}
            aria-pressed={stars === i}
          >
            <Star className={`size-7 ${i <= shown ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
          </button>
        ))}
        <span className="ml-2 text-sm font-semibold text-slate-600">{shown ? t(HINTS[shown]) : ''}</span>
      </div>
      <textarea className="input" rows={2} maxLength={500} placeholder={t('Comment (optional)')} value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        className="btn-primary w-full"
        disabled={!stars || busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await onRate(stars, comment)
          } catch (e) {
            setError(e instanceof Error ? e.message : t('Action failed'))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? t('Saving…') : t('Submit rating')}
      </button>
    </section>
  )
}
