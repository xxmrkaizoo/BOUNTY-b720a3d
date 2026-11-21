/**
 * staff      – lab staff: report & comment
 * admin      – lab in-charge: everything
 * technician – maintenance company staff (joined via invite link): only their company's jobs
 * disabled   – access removed by an admin
 */
export type Role = 'staff' | 'admin' | 'technician' | 'disabled'

export type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed'
export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type IssueCategory = 'hardware' | 'software' | 'network' | 'peripheral' | 'power' | 'other'
export type ComputerStatus = 'working' | 'faulty' | 'under_repair'
export type CallChannel = 'phone' | 'whatsapp' | 'email'

export interface Actor {
  uid: string
  name: string
}

export interface UserProfile {
  id: string
  name: string
  email: string
  role: Role
  createdAt: Date | null
  /** Technicians only: the maintenance company they belong to. */
  vendorId?: string
  vendorName?: string
  /** Alerts newer than this are shown as unread. */
  notifSeenAt?: Date | null
}

export interface Invite {
  id: string // the secret code
  vendorId: string
  vendorName: string
  active: boolean
}

export interface Computer {
  id: string
  assetTag: string
  lab: string
  location: string
  specs: string
  status: ComputerStatus
  updatedAt: Date | null
}

export interface Vendor {
  id: string
  name: string
  contactPerson: string
  phone: string
  whatsapp: string
  email: string
  notes: string
  isDefault: boolean
}

/** Staff feedback on a finished repair (1–5 stars). */
export interface TicketRating {
  stars: number
  comment: string
  by: Actor
  at: Date | null
}

/** What the repair took: parts used and what it cost. */
export interface RepairInfo {
  parts: string
  cost: number
}

export interface Ticket {
  id: string
  /** null for planned maintenance that covers a whole lab. */
  computerId: string | null
  assetTag: string
  lab: string
  category: IssueCategory
  title: string
  description: string
  priority: Priority
  status: TicketStatus
  reportedBy: Actor
  vendorId: string | null
  vendorName: string | null
  createdAt: Date | null
  updatedAt: Date | null
  resolvedAt: Date | null
  rating?: TicketRating | null
  repair?: RepairInfo | null
  /** How many times the ticket was reopened after being fixed. */
  reopenCount?: number
  /** Created by a planned-maintenance schedule. */
  scheduleId?: string | null
}

export type RepeatUnit = 'day' | 'week' | 'month'

/** Planned (recurring) maintenance that creates a ticket every time it's due. */
export interface Schedule {
  id: string
  title: string
  description: string
  lab: string
  category: IssueCategory
  priority: Priority
  every: number
  unit: RepeatUnit
  vendorId: string | null
  vendorName: string | null
  nextDue: Date | null
  lastRun: Date | null
  lastTicketId: string | null
  active: boolean
}

export type TicketEventType = 'created' | 'status' | 'call' | 'comment'

export interface TicketEvent {
  id: string
  type: TicketEventType
  message: string
  by: Actor
  at: Date | null
  channel?: CallChannel
  vendorName?: string
}

export interface TicketPhoto {
  id: string
  /** Compressed JPEG as a data: URL (kept in Firestore, so no paid Storage bucket is needed). */
  dataUrl: string
  width: number
  height: number
  by: Actor
  at: Date | null
}

export type NoticeKind = 'new' | 'assigned' | 'called' | 'status' | 'fixed' | 'comment' | 'photo' | 'rated' | 'planned'

/**
 * In-app alert. `audience` is who sees it: "admins", "user:<uid>" or
 * "vendor:<vendorId>". The text is built when shown, in the reader's language.
 */
export interface Notice {
  id: string
  audience: string
  kind: NoticeKind
  ticketId: string
  assetTag: string
  ticketTitle: string
  status?: TicketStatus
  vendorName?: string
  text?: string
  by: Actor
  at: Date | null
}
