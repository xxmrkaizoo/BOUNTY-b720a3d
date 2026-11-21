import type { CallChannel, ComputerStatus, IssueCategory, Priority, TicketStatus } from '../types.ts'

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  assigned: 'Vendor Called',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const STATUS_STYLE: Record<TicketStatus, string> = {
  open: 'bg-amber-50 text-amber-700 ring-amber-200',
  assigned: 'bg-sky-50 text-sky-700 ring-sky-200',
  in_progress: 'bg-violet-50 text-violet-700 ring-violet-200',
  resolved: 'bg-emerald-50/80 text-emerald-700 ring-emerald-200',
  closed: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

export const PRIORITY_STYLE: Record<Priority, string> = {
  low: 'bg-slate-50 text-slate-600 ring-slate-200',
  medium: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
  high: 'bg-orange-50 text-orange-700 ring-orange-200',
  critical: 'bg-rose-600 text-on ring-rose-600',
}

export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  hardware: 'Hardware (won’t boot, RAM, disk…)',
  software: 'Software / OS',
  network: 'Network / Internet',
  peripheral: 'Keyboard / Mouse / Monitor',
  power: 'Power / PSU',
  other: 'Other',
}

/** Short category names for charts and lists. */
export const CATEGORY_SHORT: Record<IssueCategory, string> = {
  hardware: 'Hardware',
  software: 'Software / OS',
  network: 'Network / Internet',
  peripheral: 'Keyboard / Mouse / Monitor',
  power: 'Power / PSU',
  other: 'Other',
}

export const COMPUTER_STATUS_LABEL: Record<ComputerStatus, string> = {
  working: 'Working',
  faulty: 'Faulty',
  under_repair: 'Under Repair',
}

export const COMPUTER_STATUS_STYLE: Record<ComputerStatus, string> = {
  working: 'bg-emerald-50/80 text-emerald-700 ring-emerald-200',
  faulty: 'bg-rose-50 text-rose-700 ring-rose-200',
  under_repair: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export const CHANNEL_LABEL: Record<CallChannel, string> = {
  phone: 'Phone call',
  whatsapp: 'WhatsApp',
  email: 'Email',
}

/** Statuses an admin can move a ticket to from a given status. */
export const NEXT_STATUSES: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'resolved', 'closed'],
  assigned: ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: ['closed', 'open'],
  closed: ['open'],
}

export const ACTIVE_STATUSES: TicketStatus[] = ['open', 'assigned', 'in_progress']
