import { collection, doc, serverTimestamp, type WriteBatch } from 'firebase/firestore'
import { db } from '../lib/firebase.ts'
import type { Actor, Notice, Ticket } from '../types.ts'

export const noticesCol = collection(db, 'notifications')

export const audience = {
  admins: 'admins',
  user: (uid: string) => `user:${uid}`,
  vendor: (vendorId: string) => `vendor:${vendorId}`,
}

type NoticeInput = Omit<Notice, 'id' | 'at' | 'by' | 'ticketId' | 'assetTag' | 'ticketTitle'>

/**
 * Adds alerts to a write batch, so they are saved together with the change
 * that caused them. Empty / duplicate audiences and alerts to yourself are skipped.
 */
export function queueNotices(
  batch: WriteBatch,
  ticket: Pick<Ticket, 'id' | 'assetTag' | 'title'>,
  by: Actor,
  notices: NoticeInput[],
): void {
  const seen = new Set<string>()
  for (const n of notices) {
    if (!n.audience || seen.has(n.audience) || n.audience === audience.user(by.uid)) continue
    seen.add(n.audience)
    const data: Record<string, unknown> = {
      ...n,
      ticketId: ticket.id,
      assetTag: ticket.assetTag,
      ticketTitle: ticket.title.slice(0, 200),
      by,
      at: serverTimestamp(),
    }
    if (typeof data.text === 'string') data.text = data.text.slice(0, 300)
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k]
    batch.set(doc(noticesCol), data)
  }
}
