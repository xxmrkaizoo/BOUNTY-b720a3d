import type { Ticket } from '../types.ts'
import { slaOf } from './sla.ts'

/** Shared numbers for Reports, the monthly report, company scorecards and PC history. */

export const CURRENCY = 'RM'

export const isDone = (t: Ticket) => t.status === 'resolved' || t.status === 'closed'

export const fixHours = (t: Ticket) => (t.resolvedAt && t.createdAt ? (t.resolvedAt.getTime() - t.createdAt.getTime()) / 3_600_000 : null)

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** true = fixed before the deadline, false = late, null = not fixed yet. */
export const onTime = (t: Ticket) => {
  const s = slaOf(t)
  return s?.state === 'met' ? true : s?.state === 'missed' ? false : null
}

export const pct = (xs: (boolean | null)[]) => {
  const known = xs.filter((x): x is boolean => x !== null)
  return known.length ? Math.round((known.filter(Boolean).length / known.length) * 100) : null
}

export const costOf = (t: Ticket) => (typeof t.repair?.cost === 'number' && Number.isFinite(t.repair.cost) ? t.repair.cost : 0)

export function fmtDuration(h: number | null) {
  if (h === null) return '—'
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`
  return `${(h / 24).toFixed(1)} d`
}

export function fmtMoney(n: number) {
  return `${CURRENCY} ${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
}

export interface CompanyScore {
  vendorId: string
  name: string
  jobs: number
  done: number
  avgFix: number | null
  onTimePct: number | null
  rating: number | null
  ratings: number
  reopened: number
  cost: number
  open: number
}

/** Scorecard per maintenance company, from the tickets handed to it. */
export function companyScores(tickets: Ticket[]): CompanyScore[] {
  const map = new Map<string, Ticket[]>()
  for (const t of tickets) {
    if (!t.vendorId) continue
    map.set(t.vendorId, [...(map.get(t.vendorId) ?? []), t])
  }
  return [...map.entries()]
    .map(([vendorId, list]) => {
      const done = list.filter(isDone)
      const stars = list.map((t) => t.rating?.stars).filter((s): s is number => typeof s === 'number')
      return {
        vendorId,
        name: list[0].vendorName ?? '—',
        jobs: list.length,
        done: done.length,
        avgFix: avg(done.map(fixHours).filter((h): h is number => h !== null)),
        onTimePct: pct(done.map(onTime)),
        rating: avg(stars),
        ratings: stars.length,
        reopened: list.filter((t) => (t.reopenCount ?? 0) > 0).length,
        cost: sum(list.map(costOf)),
        open: list.length - done.length,
      }
    })
    .sort((a, b) => b.jobs - a.jobs)
}

/** A PC is worth replacing when it keeps breaking or repairs get expensive. */
export const REPLACE_FAULTS_6M = 3
export const REPLACE_COST = 1500

export interface PcHealth {
  faults: number
  faults6m: number
  cost: number
  downtimeHours: number
  replace: boolean
  reason: 'faults' | 'cost' | null
}

export function pcHealth(tickets: Ticket[], now = Date.now()): PcHealth {
  const sixMonths = now - 182 * 86_400_000
  const faults6m = tickets.filter((t) => (t.createdAt?.getTime() ?? 0) >= sixMonths).length
  const cost = sum(tickets.map(costOf))
  const downtimeHours = sum(
    tickets.map((t) => {
      if (!t.createdAt) return 0
      const end = t.resolvedAt?.getTime() ?? (isDone(t) ? t.createdAt.getTime() : now)
      return (end - t.createdAt.getTime()) / 3_600_000
    }),
  )
  const reason = faults6m >= REPLACE_FAULTS_6M ? 'faults' : cost >= REPLACE_COST ? 'cost' : null
  return { faults: tickets.length, faults6m, cost, downtimeHours, replace: reason !== null, reason }
}
