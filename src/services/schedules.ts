import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  addDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase.ts'
import type { Actor, IssueCategory, Priority, RepeatUnit, Schedule } from '../types.ts'
import { audience, noticesCol } from './notify.ts'

/**
 * Planned maintenance. There is no server on the free plan, so due schedules
 * are run by the app itself whenever an admin has LabFix open. A transaction
 * makes sure two admins online at once never create the same ticket twice.
 */
export const schedulesCol = collection(db, 'schedules')

/** Placeholder PC name for lab-wide maintenance tickets (translated when shown). */
export const ALL_PCS = 'All PCs'

export interface ScheduleInput {
  title: string
  description: string
  lab: string
  category: IssueCategory
  priority: Priority
  every: number
  unit: RepeatUnit
  vendorId: string | null
  vendorName: string | null
  nextDue: Date
  active: boolean
}

export function addInterval(d: Date, every: number, unit: RepeatUnit): Date {
  const x = new Date(d)
  if (unit === 'day') x.setDate(x.getDate() + every)
  else if (unit === 'week') x.setDate(x.getDate() + every * 7)
  else {
    // Keep "the 31st" sensible in short months.
    const day = x.getDate()
    x.setDate(1)
    x.setMonth(x.getMonth() + every)
    x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()))
  }
  return x
}

export async function saveSchedule(input: ScheduleInput, id?: string): Promise<void> {
  const data = {
    ...input,
    title: input.title.trim(),
    description: input.description.trim(),
    every: Math.max(1, Math.round(input.every)),
    nextDue: Timestamp.fromDate(input.nextDue),
    updatedAt: serverTimestamp(),
  }
  if (id) await updateDoc(doc(schedulesCol, id), data)
  else await addDoc(schedulesCol, { ...data, lastRun: null, lastTicketId: null, createdAt: serverTimestamp() })
}

export const setScheduleActive = (id: string, active: boolean) => updateDoc(doc(schedulesCol, id), { active })
export const deleteSchedule = (id: string) => deleteDoc(doc(schedulesCol, id))

/**
 * Create the ticket for one schedule if it is due (or `force`), and move
 * `nextDue` forward past now. Returns the new ticket id, or null.
 */
export async function runSchedule(scheduleId: string, by: Actor, force = false): Promise<string | null> {
  return runTransaction(db, async (tx) => {
    const ref = doc(schedulesCol, scheduleId)
    const snap = await tx.get(ref)
    if (!snap.exists()) return null
    const s = snap.data() as Omit<Schedule, 'id' | 'nextDue'> & { nextDue: Timestamp | null }
    const now = new Date()
    const due = s.nextDue?.toDate() ?? now
    if (!force && (!s.active || due > now)) return null

    let next = force && due > now ? addInterval(due, s.every, s.unit) : due
    while (next <= now) next = addInterval(next, s.every, s.unit)

    const ticketRef = doc(collection(db, 'tickets'))
    const assigned = !!s.vendorId
    tx.set(ticketRef, {
      computerId: null,
      assetTag: ALL_PCS,
      lab: s.lab,
      category: s.category,
      title: s.title,
      description: s.description,
      priority: s.priority,
      status: assigned ? 'assigned' : 'open',
      reportedBy: by,
      vendorId: s.vendorId,
      vendorName: s.vendorName,
      scheduleId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      resolvedAt: null,
      ...((s as { demo?: boolean }).demo ? { demo: true } : {}),
    })
    tx.set(doc(collection(db, 'tickets', ticketRef.id, 'events')), {
      type: 'created',
      message: `Planned maintenance: “${s.title}” for ${s.lab}`,
      by,
      at: serverTimestamp(),
    })
    if (assigned) {
      tx.set(doc(noticesCol), {
        audience: audience.vendor(s.vendorId!),
        kind: 'planned',
        ticketId: ticketRef.id,
        assetTag: ALL_PCS,
        ticketTitle: s.title.slice(0, 200),
        text: s.lab,
        by,
        at: serverTimestamp(),
      })
    }
    tx.update(ref, { nextDue: Timestamp.fromDate(next), lastRun: serverTimestamp(), lastTicketId: ticketRef.id })
    return ticketRef.id
  })
}

/** Run every active schedule that is due. Called by the app for admins. */
export async function runDueSchedules(by: Actor): Promise<number> {
  const snap = await getDocs(query(schedulesCol, where('active', '==', true), where('nextDue', '<=', Timestamp.now())))
  let created = 0
  for (const d of snap.docs) {
    try {
      if (await runSchedule(d.id, by)) created++
    } catch {
      /* another admin got there first, or offline: try again next time */
    }
  }
  return created
}
