import { useEffect, useState } from 'react'
import type { Priority, Ticket } from '../types.ts'
import { translate as t } from './settings.tsx'

const HOUR = 3_600_000

/** How long the maintenance company has to fix a fault, by priority. */
export const SLA_HOURS: Record<Priority, number> = {
  critical: 4,
  high: 24,
  medium: 72,
  low: 168,
}

/**
 * ok      – still open, plenty of time
 * soon    – still open, less than a quarter of the time left
 * overdue – still open, past the deadline
 * met     – fixed before the deadline
 * missed  – fixed, but late
 */
export type SlaState = 'ok' | 'soon' | 'overdue' | 'met' | 'missed'

export interface Sla {
  state: SlaState
  due: Date
  /** Active: time left (negative when overdue). Done: how early (+) or late (−) it was fixed. */
  diffMs: number
}

export function slaDue(ticket: Pick<Ticket, 'createdAt' | 'priority'>): Date | null {
  if (!ticket.createdAt) return null
  return new Date(ticket.createdAt.getTime() + SLA_HOURS[ticket.priority] * HOUR)
}

export function slaOf(ticket: Ticket, now = Date.now()): Sla | null {
  const due = slaDue(ticket)
  if (!due) return null
  const done = ticket.status === 'resolved' || ticket.status === 'closed'
  if (done) {
    if (!ticket.resolvedAt) return null
    const diffMs = due.getTime() - ticket.resolvedAt.getTime()
    return { state: diffMs >= 0 ? 'met' : 'missed', due, diffMs }
  }
  const diffMs = due.getTime() - now
  const window = SLA_HOURS[ticket.priority] * HOUR
  return { state: diffMs < 0 ? 'overdue' : diffMs < window / 4 ? 'soon' : 'ok', due, diffMs }
}

export const isOverdue = (ticket: Ticket, now = Date.now()) => slaOf(ticket, now)?.state === 'overdue'

/** Compact duration: 45m, 3h, 2d 4h. */
export function shortSpan(ms: number): string {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60_000))
  if (m < 60) return t('{n}m', { n: m })
  const h = Math.floor(m / 60)
  if (h < 48) return t('{n}h', { n: h })
  const d = Math.floor(h / 24)
  const rest = h % 24
  return rest ? `${t('{n}d', { n: d })} ${t('{n}h', { n: rest })}` : t('{n}d', { n: d })
}

/** Readable deadline target, e.g. "within 4 hours". */
export function slaTarget(p: Priority): string {
  const h = SLA_HOURS[p]
  return h < 48 ? t('within {n} hours', { n: h }) : t('within {n} days', { n: h / 24 })
}

/** Re-renders every `ms` so countdowns stay current. */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
