import { AlarmClock, CircleCheck, Timer, TimerOff } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  COMPUTER_STATUS_LABEL,
  COMPUTER_STATUS_STYLE,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
} from '../lib/constants.ts'
import { formatDateTime } from '../lib/format.ts'
import { useT } from '../lib/settings.tsx'
import { shortSpan, slaOf, type SlaState } from '../lib/sla.ts'
import type { ComputerStatus, Priority, Ticket, TicketStatus } from '../types.ts'

function Pill({ className, children, dot }: { className: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${className}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const t = useT()
  return <Pill dot className={STATUS_STYLE[status]}>{t(STATUS_LABEL[status])}</Pill>
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const t = useT()
  return <Pill className={PRIORITY_STYLE[priority]}>{t(PRIORITY_LABEL[priority])}</Pill>
}

export function ComputerStatusBadge({ status }: { status: ComputerStatus }) {
  const t = useT()
  return <Pill dot className={COMPUTER_STATUS_STYLE[status]}>{t(COMPUTER_STATUS_LABEL[status])}</Pill>
}

const SLA_STYLE: Record<SlaState, string> = {
  ok: 'bg-slate-50 text-slate-600 ring-slate-200',
  soon: 'bg-amber-50 text-amber-700 ring-amber-200',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-200',
  met: 'bg-emerald-50/80 text-emerald-700 ring-emerald-200',
  missed: 'bg-orange-50 text-orange-700 ring-orange-200',
}

/** Fix-deadline badge: "3h left", "Overdue 2h", "On time", "Late". */
export function SlaBadge({ ticket, now, hideOk }: { ticket: Ticket; now: number; hideOk?: boolean }) {
  const t = useT()
  const sla = slaOf(ticket, now)
  if (!sla || (hideOk && sla.state === 'ok')) return null
  const Icon = sla.state === 'overdue' ? AlarmClock : sla.state === 'met' ? CircleCheck : sla.state === 'missed' ? TimerOff : Timer
  const text =
    sla.state === 'overdue'
      ? t('Overdue {d}', { d: shortSpan(sla.diffMs) })
      : sla.state === 'met'
        ? t('On time')
        : sla.state === 'missed'
          ? t('Late by {d}', { d: shortSpan(sla.diffMs) })
          : t('{d} left', { d: shortSpan(sla.diffMs) })
  return (
    <span title={t('Fix deadline: {date}', { date: formatDateTime(sla.due) })} className="inline-flex">
      <Pill className={SLA_STYLE[sla.state]}>
        <Icon className="size-3.5" />
        {text}
      </Pill>
    </span>
  )
}
