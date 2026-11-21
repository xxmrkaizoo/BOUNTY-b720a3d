import {
  collection,
  doc,
  increment,
  serverTimestamp,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore'
import { STATUS_LABEL, CHANNEL_LABEL } from '../lib/constants.ts'
import { db } from '../lib/firebase.ts'
import { formatDateTime, ticketCode } from '../lib/format.ts'
import { audience, queueNotices } from './notify.ts'
import type {
  Actor,
  CallChannel,
  Computer,
  IssueCategory,
  Priority,
  RepairInfo,
  Role,
  Ticket,
  TicketStatus,
  Vendor,
} from '../types.ts'

export const ticketsCol = collection(db, 'tickets')
export const eventsCol = (ticketId: string) => collection(db, 'tickets', ticketId, 'events')

function newEventRef(ticketId: string): DocumentReference {
  return doc(eventsCol(ticketId))
}

export interface NewTicketInput {
  computer: Computer
  category: IssueCategory
  title: string
  description: string
  priority: Priority
}

/** Staff reports a broken computer. Also marks the PC as faulty. */
export async function createTicket(input: NewTicketInput, by: Actor): Promise<string> {
  const ref = doc(ticketsCol)
  const batch = writeBatch(db)
  batch.set(ref, {
    computerId: input.computer.id,
    assetTag: input.computer.assetTag,
    lab: input.computer.lab,
    category: input.category,
    title: input.title.trim(),
    description: input.description.trim(),
    priority: input.priority,
    status: 'open',
    reportedBy: by,
    vendorId: null,
    vendorName: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    resolvedAt: null,
  })
  batch.set(newEventRef(ref.id), {
    type: 'created',
    message: `Reported “${input.title.trim()}” on ${input.computer.assetTag}`,
    by,
    at: serverTimestamp(),
  })
  batch.update(doc(db, 'computers', input.computer.id), {
    status: 'faulty',
    updatedAt: serverTimestamp(),
  })
  queueNotices(batch, { id: ref.id, assetTag: input.computer.assetTag, title: input.title.trim() }, by, [
    { audience: audience.admins, kind: 'new' },
  ])
  await batch.commit()
  return ref.id
}

/** Admin moves the ticket through its lifecycle; keeps the PC status in sync. */
export async function updateTicketStatus(
  ticket: Ticket,
  status: TicketStatus,
  by: Actor,
  note?: string,
  byRole: Role = 'admin',
  repair?: RepairInfo | null,
): Promise<void> {
  const batch = writeBatch(db)
  const reopening = status === 'open' && (ticket.status === 'resolved' || ticket.status === 'closed')
  batch.update(doc(db, 'tickets', ticket.id), {
    status,
    updatedAt: serverTimestamp(),
    ...(repair && status === 'resolved' ? { repair } : {}),
    ...(reopening ? { reopenCount: increment(1), rating: null } : {}),
    // Closing keeps the original "resolved at" time so fix-time reports stay accurate.
    resolvedAt:
      status === 'resolved'
        ? serverTimestamp()
        : status === 'closed'
          ? (ticket.resolvedAt ?? serverTimestamp())
          : null,
  })
  const base = `Status changed: ${STATUS_LABEL[ticket.status]} → ${STATUS_LABEL[status]}`
  batch.set(newEventRef(ticket.id), {
    type: 'status',
    message: note?.trim() ? `${base}. Note: ${note.trim()}` : base,
    by,
    at: serverTimestamp(),
  })

  const pcStatus =
    status === 'resolved' || status === 'closed'
      ? 'working'
      : status === 'in_progress'
        ? 'under_repair'
        : 'faulty'
  // Planned lab-wide maintenance has no single PC.
  if (ticket.computerId) {
    batch.update(doc(db, 'computers', ticket.computerId), {
      status: pcStatus,
      updatedAt: serverTimestamp(),
    })
  }
  const fixed = status === 'resolved'
  queueNotices(batch, ticket, by, [
    { audience: ticket.reportedBy?.uid ? audience.user(ticket.reportedBy.uid) : '', kind: fixed ? 'fixed' : 'status', status, text: note?.trim() || undefined },
    // The lab hears about technician updates; the company hears about lab decisions.
    byRole === 'technician'
      ? { audience: audience.admins, kind: 'status', status, text: note?.trim() || undefined }
      : { audience: ticket.vendorId ? audience.vendor(ticket.vendorId) : '', kind: 'status', status, text: note?.trim() || undefined },
  ])
  await batch.commit()
}

/** Comment on a ticket; alerts the reporter, the lab admins and the assigned company. */
export async function addComment(ticket: Ticket, message: string, by: Actor, byRole: Role): Promise<void> {
  const batch = writeBatch(db)
  batch.set(newEventRef(ticket.id), { type: 'comment', message: message.trim(), by, at: serverTimestamp() })
  const text = message.trim()
  queueNotices(batch, ticket, by, [
    { audience: ticket.reportedBy?.uid ? audience.user(ticket.reportedBy.uid) : '', kind: 'comment', text },
    { audience: byRole === 'admin' ? '' : audience.admins, kind: 'comment', text },
    { audience: byRole !== 'technician' && ticket.vendorId ? audience.vendor(ticket.vendorId) : '', kind: 'comment', text },
  ])
  await batch.commit()
}

/** The message sent to the maintenance company (WhatsApp / email body). */
export function buildVendorMessage(ticket: Ticket, vendor: Vendor, portalUrl?: string, labName = 'Computer Lab'): string {
  return [
    `Hello ${vendor.contactPerson || vendor.name},`,
    '',
    `We need a technician for a broken computer at our ${labName}.`,
    '',
    `Ticket: ${ticketCode(ticket.id)}`,
    `Computer: ${ticket.assetTag}`,
    `Lab / Location: ${ticket.lab}`,
    `Problem: ${ticket.title}`,
    `Priority: ${ticket.priority.toUpperCase()}`,
    `Reported: ${formatDateTime(ticket.createdAt)}`,
    '',
    `Details: ${ticket.description || '-'}`,
    '',
    ...(portalUrl
      ? [
          'Open this job in the LabFix maintenance portal (first time: sign up with this link, it registers you under your company):',
          portalUrl,
          '',
        ]
      : []),
    'Please confirm when a technician can come. Thank you.',
  ].join('\n')
}

/**
 * Record that the maintenance company was contacted. Assigns the vendor
 * to the ticket, moves it to "assigned" if it was still open and, for
 * email, queues a message for the Firebase "Trigger Email" extension.
 */
export async function logVendorCall(
  ticket: Ticket,
  vendor: Vendor,
  channel: CallChannel,
  by: Actor,
  message: string,
  note?: string,
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'tickets', ticket.id), {
    vendorId: vendor.id,
    vendorName: vendor.name,
    status: ticket.status === 'open' ? 'assigned' : ticket.status,
    updatedAt: serverTimestamp(),
  })
  batch.set(newEventRef(ticket.id), {
    type: 'call',
    channel,
    vendorName: vendor.name,
    message: `Contacted ${vendor.name} via ${CHANNEL_LABEL[channel]}${note?.trim() ? ` — ${note.trim()}` : ''}`,
    by,
    at: serverTimestamp(),
  })
  if (channel === 'email' && vendor.email) {
    batch.set(doc(collection(db, 'mail')), {
      to: vendor.email,
      message: {
        subject: `[${ticketCode(ticket.id)}] Repair request: ${ticket.assetTag} – ${ticket.title}`,
        text: message,
      },
      ticketId: ticket.id,
      createdAt: serverTimestamp(),
    })
  }
  queueNotices(batch, ticket, by, [
    { audience: audience.vendor(vendor.id), kind: 'assigned', vendorName: vendor.name },
    { audience: ticket.reportedBy?.uid ? audience.user(ticket.reportedBy.uid) : '', kind: 'called', vendorName: vendor.name },
  ])
  await batch.commit()
}

/** The reporter (or an admin) rates a finished repair. The company is told. */
export async function rateTicket(ticket: Ticket, stars: number, comment: string, by: Actor): Promise<void> {
  const batch = writeBatch(db)
  const rating = { stars: Math.min(5, Math.max(1, Math.round(stars))), comment: comment.trim().slice(0, 500), by, at: serverTimestamp() }
  batch.update(doc(db, 'tickets', ticket.id), { rating })
  batch.set(newEventRef(ticket.id), {
    type: 'comment',
    message: `Rated the repair ${'★'.repeat(rating.stars)}${'☆'.repeat(5 - rating.stars)}${rating.comment ? ` – ${rating.comment}` : ''}`,
    by,
    at: serverTimestamp(),
  })
  queueNotices(batch, ticket, by, [
    { audience: ticket.vendorId ? audience.vendor(ticket.vendorId) : '', kind: 'rated', text: String(rating.stars) },
    { audience: audience.admins, kind: 'rated', text: String(rating.stars) },
  ])
  await batch.commit()
}
