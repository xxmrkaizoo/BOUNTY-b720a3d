import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase.ts'
import { deleteInvite } from './invites.ts'
import type { Actor, Computer, Role, UserProfile, Vendor } from '../types.ts'

export const computersCol = collection(db, 'computers')
export const vendorsCol = collection(db, 'vendors')
export const usersCol = collection(db, 'users')

// ---------- Computers ----------
export type ComputerInput = Omit<Computer, 'id' | 'updatedAt'>

export async function saveComputer(input: ComputerInput, id?: string): Promise<void> {
  const data = { ...input, assetTag: input.assetTag.trim(), lab: input.lab.trim(), updatedAt: serverTimestamp() }
  if (id) await updateDoc(doc(db, 'computers', id), data)
  else await addDoc(computersCol, data)
}

export async function deleteComputer(id: string): Promise<void> {
  await deleteDoc(doc(db, 'computers', id))
}

// ---------- Maintenance companies ----------
export type VendorInput = Omit<Vendor, 'id'>

/** Saves a vendor. If it is the default, un-default every other vendor. */
export async function saveVendor(input: VendorInput, id?: string): Promise<void> {
  const batch = writeBatch(db)
  const ref = id ? doc(db, 'vendors', id) : doc(vendorsCol)
  batch.set(ref, input)
  if (input.isDefault) {
    const others = await getDocs(query(vendorsCol, where('isDefault', '==', true)))
    others.forEach((d) => {
      if (d.id !== ref.id) batch.update(d.ref, { isDefault: false })
    })
  }
  await batch.commit()
}

export async function deleteVendor(id: string): Promise<void> {
  await deleteInvite(id)
  await deleteDoc(doc(db, 'vendors', id))
}

// ---------- Users ----------
export const deletedUsersCol = collection(db, 'deletedUsers')

export async function setUserRole(uid: string, role: Role): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { role })
}

/**
 * Removes a user's access. The profile is deleted and a tombstone (with a copy
 * of the old profile) blocks that login from ever creating a new one.
 * Their past tickets and comments keep their name.
 */
export async function deleteUser(user: UserProfile, by: Actor): Promise<void> {
  const { id, ...profile } = user
  const batch = writeBatch(db)
  batch.set(doc(db, 'deletedUsers', id), {
    profile: { ...profile, createdAt: profile.createdAt ?? null },
    name: user.name,
    email: user.email,
    deletedAt: serverTimestamp(),
    deletedBy: by,
  })
  batch.delete(doc(db, 'users', id))
  await batch.commit()
}

/** Brings a removed user back with exactly their old role (and company). */
export async function restoreUser(uid: string, profile: Omit<UserProfile, 'id'>): Promise<void> {
  const batch = writeBatch(db)
  batch.set(doc(db, 'users', uid), profile)
  batch.delete(doc(db, 'deletedUsers', uid))
  await batch.commit()
}
