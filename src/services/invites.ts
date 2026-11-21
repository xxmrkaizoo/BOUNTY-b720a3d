import { deleteDoc, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase.ts'
import type { Invite } from '../types.ts'

/**
 * Each maintenance company has ONE active invite link:
 *   invites/{code}         -> { vendorId, vendorName, active }   (readable by anyone holding the code)
 *   vendorSecrets/{vendor} -> { code }                           (admins only, so staff never see codes)
 */

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function inviteUrl(code: string, ticketId?: string): string {
  const url = new URL(`/join/${code}`, window.location.origin)
  if (ticketId) url.searchParams.set('ticket', ticketId)
  return url.toString()
}

/** Returns the company's invite code, creating one the first time. Admin only. */
export async function getOrCreateInvite(vendorId: string, vendorName: string): Promise<string> {
  const secretRef = doc(db, 'vendorSecrets', vendorId)
  const secret = await getDoc(secretRef)
  const existing = secret.data()?.code as string | undefined
  if (existing) return existing
  return createInvite(vendorId, vendorName)
}

async function createInvite(vendorId: string, vendorName: string, oldCode?: string): Promise<string> {
  const code = newCode()
  const batch = writeBatch(db)
  batch.set(doc(db, 'invites', code), { vendorId, vendorName, active: true, createdAt: serverTimestamp() })
  batch.set(doc(db, 'vendorSecrets', vendorId), { code })
  if (oldCode) batch.delete(doc(db, 'invites', oldCode))
  await batch.commit()
  return code
}

/** Makes a new link; the old link stops working for new sign-ups. */
export async function regenerateInvite(vendorId: string, vendorName: string): Promise<string> {
  const secret = await getDoc(doc(db, 'vendorSecrets', vendorId))
  return createInvite(vendorId, vendorName, secret.data()?.code as string | undefined)
}

/** Removes a company's invite (used when the company is deleted). */
export async function deleteInvite(vendorId: string): Promise<void> {
  const secretRef = doc(db, 'vendorSecrets', vendorId)
  const secret = await getDoc(secretRef)
  const code = secret.data()?.code as string | undefined
  if (code) await deleteDoc(doc(db, 'invites', code))
  if (secret.exists()) await deleteDoc(secretRef)
}

/** Public lookup used by the join page. */
export async function getInvite(code: string): Promise<Invite | null> {
  const snap = await getDoc(doc(db, 'invites', code))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Invite) : null
}
