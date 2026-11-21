import { Timestamp, type DocumentSnapshot } from 'firebase/firestore'
import { getLocale, translate as t } from './settings.tsx'

/** Short human ticket code, e.g. LF-3F9A2C */
export function ticketCode(id: string): string {
  return `LF-${id.slice(0, 6).toUpperCase()}`
}

/**
 * Firestore Timestamps nested inside a field (e.g. `rating.at`) are not
 * converted by fromDoc, so accept them here too.
 */
type DateLike = Date | { toDate: () => Date } | null | undefined
function asDate(d: DateLike): Date | null {
  if (!d) return null
  if (d instanceof Date) return d
  return typeof d.toDate === 'function' ? d.toDate() : null
}

export function formatDateTime(input: DateLike): string {
  const d = asDate(input)
  if (!d) return '—'
  return d.toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

export function timeAgo(input: DateLike): string {
  const d = asDate(input)
  if (!d) return t('just now')
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 60) return t('just now')
  const m = Math.round(s / 60)
  if (m < 60) return t('{n}m ago', { n: m })
  const h = Math.round(m / 60)
  if (h < 24) return t('{n}h ago', { n: h })
  const days = Math.round(h / 24)
  return t('{n}d ago', { n: days })
}

/** Convert a Firestore doc into a plain object, turning Timestamps into Dates. */
export function fromDoc<T>(snap: DocumentSnapshot): T {
  const raw = snap.data({ serverTimestamps: 'estimate' }) ?? {}
  const out: Record<string, unknown> = { id: snap.id }
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v instanceof Timestamp ? v.toDate() : v
  }
  return out as T
}

/** Digits only, for wa.me links (expects international format, e.g. 60123456789). */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}
