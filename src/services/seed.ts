import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
  type DocumentReference,
  type WriteBatch,
} from 'firebase/firestore'
import { STATUS_LABEL } from '../lib/constants.ts'
import { db } from '../lib/firebase.ts'
import { deleteInvite } from './invites.ts'
import type { Actor, CallChannel, ComputerStatus, IssueCategory, Priority, TicketStatus } from '../types.ts'

/**
 * Demo data for trying LabFix out. Every seeded document has `demo: true`
 * so it can be removed again without touching real data.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR

const LABS = [
  { name: 'Computer Lab 1', prefix: 'LAB1-PC', count: 20, specs: 'Core i5-12400, 16GB, Win 11' },
  { name: 'Computer Lab 2', prefix: 'LAB2-PC', count: 16, specs: 'Core i5-10400, 8GB, Win 11' },
  { name: 'Programming Lab', prefix: 'PRG-PC', count: 15, specs: 'Ryzen 5 5600G, 16GB, Win 11' },
  { name: 'Multimedia Lab', prefix: 'MM-PC', count: 12, specs: 'Core i7-12700, 32GB, RTX 3060' },
]

const VENDORS = [
  {
    name: 'TechCare Solutions (Demo)',
    contactPerson: 'Mr. Hafiz',
    phone: '+60 12-000 0001',
    whatsapp: '',
    email: 'service@techcare.example',
    notes: 'Main service contract. Mon–Sat, 8am–6pm.',
    isDefault: true,
  },
  {
    name: 'PCFix Pro Services (Demo)',
    contactPerson: 'Ms. Wong',
    phone: '+60 12-000 0002',
    whatsapp: '+60 12-000 0002',
    email: 'support@pcfixpro.example',
    notes: 'Hardware parts & replacements.',
    isDefault: false,
  },
  {
    name: 'NetLink IT Support (Demo)',
    contactPerson: 'Mr. Ravi',
    phone: '+60 12-000 0003',
    whatsapp: '',
    email: 'helpdesk@netlink.example',
    notes: 'Network and Wi-Fi issues.',
    isDefault: false,
  },
]

const PROBLEMS: Record<IssueCategory, { title: string; fix: string }[]> = {
  hardware: [
    { title: 'PC won’t power on', fix: 'Replaced faulty motherboard capacitor' },
    { title: 'Blue screen on boot', fix: 'Reseated RAM and ran memory test' },
    { title: 'Hard disk clicking noise', fix: 'Replaced HDD with SSD, restored image' },
    { title: 'Overheating and shutting down', fix: 'Cleaned dust, replaced thermal paste' },
  ],
  software: [
    { title: 'Windows update stuck at 30%', fix: 'Cleared update cache and reinstalled update' },
    { title: 'Microsoft Office not opening', fix: 'Repaired Office installation' },
    { title: 'Student login profile corrupted', fix: 'Rebuilt user profile' },
  ],
  network: [
    { title: 'No internet connection', fix: 'Replaced LAN cable' },
    { title: 'Cannot reach shared drive', fix: 'Reset network adapter & DNS' },
    { title: 'LAN port not detected', fix: 'Installed PCIe network card' },
  ],
  peripheral: [
    { title: 'Mouse not working', fix: 'Replaced mouse' },
    { title: 'Several keyboard keys stuck', fix: 'Replaced keyboard' },
    { title: 'Monitor flickering', fix: 'Replaced display cable' },
    { title: 'No display on monitor', fix: 'Replaced monitor power board' },
  ],
  power: [
    { title: 'Burning smell from PSU', fix: 'Replaced power supply unit' },
    { title: 'PC restarts randomly', fix: 'Replaced PSU and tested under load' },
  ],
  other: [
    { title: 'Webcam missing', fix: 'Installed new webcam' },
    { title: 'Headphone jack not working', fix: 'Enabled front audio panel' },
  ],
}

const CATEGORY_WEIGHTS: [IssueCategory, number][] = [
  ['hardware', 30],
  ['software', 22],
  ['peripheral', 20],
  ['network', 14],
  ['power', 8],
  ['other', 6],
]
const PRIORITY_WEIGHTS: [Priority, number][] = [
  ['low', 20],
  ['medium', 42],
  ['high', 28],
  ['critical', 10],
]
/** Typical fix time range in hours, by priority. */
const FIX_HOURS: Record<Priority, [number, number]> = {
  critical: [2, 20],
  high: [6, 48],
  medium: [12, 96],
  low: [24, 168],
}
/** Typical repair cost range (RM), by problem type. */
const COST: Record<IssueCategory, [number, number]> = {
  hardware: [80, 650],
  software: [0, 120],
  network: [15, 180],
  peripheral: [25, 320],
  power: [120, 380],
  other: [20, 150],
}
/** Star ratings each demo company tends to get (best first). */
const VENDOR_STARS: [number, number][][] = [
  [[5, 6], [4, 4], [3, 1]],
  [[5, 2], [4, 4], [3, 3], [2, 1]],
  [[4, 3], [3, 4], [2, 2], [1, 1]],
]
const RATING_COMMENTS = ['Fast and friendly, thanks!', 'Fixed properly this time.', 'Took a while but works now.', 'Had to call twice.', '']

const STAFF = ['Nurul Aina', 'Daniel Lee', 'Siti Hajar', 'Arjun Kumar', 'Farah Izzati', 'Marcus Tan']
const DETAILS = [
  'Students reported it during the morning class.',
  'Happened right after the PC was switched on.',
  'Tried restarting twice, problem still there.',
  'Noticed during the exam setup, please check urgently.',
  '',
]

/** Small deterministic PRNG so the demo looks the same every time. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Collects writes and commits them in chunks under Firestore's 500-op batch limit. */
class Batcher {
  private batch: WriteBatch = writeBatch(db)
  private ops = 0
  private pending: Promise<void>[] = []
  set(ref: DocumentReference, data: object) {
    this.batch.set(ref, data)
    this.bump()
  }
  delete(ref: DocumentReference) {
    this.batch.delete(ref)
    this.bump()
  }
  private bump() {
    if (++this.ops >= 450) this.flushNow()
  }
  private flushNow() {
    if (this.ops === 0) return
    this.pending.push(this.batch.commit())
    this.batch = writeBatch(db)
    this.ops = 0
  }
  async done() {
    this.flushNow()
    await Promise.all(this.pending)
  }
}

export async function hasDemoData(): Promise<boolean> {
  const snap = await getDocs(query(collection(db, 'computers'), where('demo', '==', true), limit(1)))
  return !snap.empty
}

export interface SeedResult {
  computers: number
  vendors: number
  tickets: number
}

export async function seedDemoData(admin: Actor): Promise<SeedResult> {
  const rand = rng(20261121)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  const weighted = <T,>(pairs: [T, number][]) => {
    const total = pairs.reduce((s, [, w]) => s + w, 0)
    let r = rand() * total
    for (const [v, w] of pairs) if ((r -= w) <= 0) return v
    return pairs[pairs.length - 1][0]
  }
  const between = (a: number, b: number) => a + rand() * (b - a)
  const ts = (ms: number) => Timestamp.fromMillis(Math.round(ms))

  const out = new Batcher()
  const now = Date.now()

  // ---- Maintenance companies
  const vendors = VENDORS.map((v) => ({ ref: doc(collection(db, 'vendors')), ...v }))
  for (const { ref, ...v } of vendors) out.set(ref, { ...v, demo: true })

  // ---- Computers
  const computers: { ref: DocumentReference; assetTag: string; lab: string; status: ComputerStatus; data: object }[] = []
  for (const lab of LABS) {
    for (let i = 1; i <= lab.count; i++) {
      const assetTag = `${lab.prefix}${String(i).padStart(2, '0')}`
      computers.push({
        ref: doc(collection(db, 'computers')),
        assetTag,
        lab: lab.name,
        status: 'working',
        data: { assetTag, lab: lab.name, location: `Row ${Math.ceil(i / 5)}, seat ${((i - 1) % 5) + 1}`, specs: lab.specs },
      })
    }
  }
  // A few "problem" PCs break more often, which makes the report interesting.
  const troublemakers = [computers[3], computers[22], computers[40], computers[55]]

  // ---- Tickets (spread over the last ~6 months, more in recent weeks)
  const TICKETS = 84
  const busy = new Set<DocumentReference>() // PCs that already have an active ticket
  let ticketCount = 0

  for (let n = 0; n < TICKETS; n++) {
    const daysAgo = Math.pow(rand(), 1.6) * 180
    const createdAt = now - daysAgo * DAY - between(0, 8) * HOUR
    const category = weighted(CATEGORY_WEIGHTS)
    const priority = weighted(PRIORITY_WEIGHTS)
    const problem = pick(PROBLEMS[category])
    const reporter = pick(STAFF)

    // Decide the lifecycle: old tickets are mostly finished, recent ones may be active.
    let status: TicketStatus
    if (daysAgo > 12) status = rand() < 0.75 ? 'closed' : 'resolved'
    else status = weighted<TicketStatus>([['open', 3], ['assigned', 3], ['in_progress', 3], ['resolved', 4]])

    const active = status === 'open' || status === 'assigned' || status === 'in_progress'
    let pc = rand() < 0.12 ? pick(troublemakers) : pick(computers)
    if (active) {
      let guard = 0
      while (busy.has(pc.ref) && guard++ < 50) pc = pick(computers)
      if (busy.has(pc.ref)) continue
      busy.add(pc.ref)
      pc.status = status === 'in_progress' ? 'under_repair' : 'faulty'
    }

    const vendor = status === 'open' ? null : rand() < 0.6 ? vendors[0] : pick(vendors)
    const [minH, maxH] = FIX_HOURS[priority]
    const callAt = createdAt + between(0.2, 3) * HOUR
    const startAt = callAt + between(1, Math.max(2, minH * 0.6)) * HOUR
    let resolvedAt: number | null = status === 'resolved' || status === 'closed' ? createdAt + between(minH, maxH) * HOUR : null
    if (resolvedAt !== null && resolvedAt > now - HOUR) {
      // Would be "in the future": keep it in progress instead.
      status = 'in_progress'
      resolvedAt = null
      if (!busy.has(pc.ref)) {
        busy.add(pc.ref)
        pc.status = 'under_repair'
      }
    }
    const closedAt = resolvedAt !== null ? Math.min(now - HOUR / 2, resolvedAt + between(4, 48) * HOUR) : null
    const lastAt = closedAt ?? resolvedAt ?? (status === 'in_progress' ? startAt : status === 'assigned' ? callAt : createdAt)

    const done = resolvedAt !== null
    const vIndex = vendor ? vendors.indexOf(vendor) : -1
    const [cMin, cMax] = COST[category]
    const cost = Math.round(between(cMin, cMax) / 5) * 5 * (troublemakers.includes(pc) ? 1.6 : 1)
    const stars = vIndex >= 0 && done && rand() < 0.7 ? weighted(VENDOR_STARS[vIndex].map(([v, w]) => [v, w] as [number, number])) : null
    const reopened = done && rand() < 0.07

    const ticketRef = doc(collection(db, 'tickets'))
    out.set(ticketRef, {
      computerId: pc.ref.id,
      assetTag: pc.assetTag,
      lab: pc.lab,
      category,
      title: problem.title,
      description: pick(DETAILS),
      priority,
      status,
      reportedBy: { uid: admin.uid, name: reporter },
      vendorId: vendor?.ref.id ?? null,
      vendorName: vendor?.name ?? null,
      createdAt: ts(createdAt),
      updatedAt: ts(Math.min(lastAt, now)),
      resolvedAt: resolvedAt !== null ? ts(resolvedAt) : null,
      repair: done && vendor ? { parts: problem.fix, cost: Math.round(cost) } : null,
      rating: stars
        ? { stars, comment: stars >= 4 ? pick(RATING_COMMENTS.slice(0, 3)) : pick(RATING_COMMENTS.slice(2)), by: { uid: admin.uid, name: reporter }, at: ts(Math.min(now, (closedAt ?? resolvedAt!) + HOUR)) }
        : null,
      reopenCount: reopened ? 1 : 0,
      demo: true,
    })
    ticketCount++

    // ---- Timeline events
    const ev = (at: number, data: object) => out.set(doc(collection(db, 'tickets', ticketRef.id, 'events')), { ...data, at: ts(at), demo: true })
    ev(createdAt, { type: 'created', message: `Reported “${problem.title}” on ${pc.assetTag}`, by: { uid: admin.uid, name: reporter } })
    if (vendor) {
      const channel: CallChannel = weighted([['phone', 5], ['whatsapp', 4], ['email', 1]])
      const label = channel === 'phone' ? 'Phone call' : channel === 'whatsapp' ? 'WhatsApp' : 'Email'
      ev(callAt, { type: 'call', channel, vendorName: vendor.name, message: `Contacted ${vendor.name} via ${label}`, by: admin })
    }
    const statusEv = (at: number, from: TicketStatus, to: TicketStatus, note?: string) =>
      ev(at, {
        type: 'status',
        message: `Status changed: ${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}${note ? `. Note: ${note}` : ''}`,
        by: admin,
      })
    if (status !== 'open' && status !== 'assigned') statusEv(startAt, 'assigned', 'in_progress', 'Technician on site')
    if (resolvedAt !== null) statusEv(resolvedAt, 'in_progress', 'resolved', problem.fix)
    if (status === 'closed' && closedAt !== null) statusEv(closedAt, 'resolved', 'closed')
  }

  for (const c of computers) {
    out.set(c.ref, { ...c.data, status: c.status, updatedAt: ts(now), demo: true })
  }

  // ---- Planned maintenance (one is already due, so the app creates its ticket right away)
  const schedule = (title: string, description: string, lab: string, category: IssueCategory, every: number, unit: string, dueInHours: number, vendor: (typeof vendors)[number] | null) =>
    out.set(doc(collection(db, 'schedules')), {
      title,
      description,
      lab,
      category,
      priority: 'low',
      every,
      unit,
      vendorId: vendor?.ref.id ?? null,
      vendorName: vendor?.name ?? null,
      nextDue: ts(now + dueInHours * HOUR),
      lastRun: null,
      lastTicketId: null,
      active: true,
      createdAt: ts(now),
      demo: true,
    })
  schedule('Clean dust from PCs and keyboards', 'Blow out dust from PC cases, clean keyboards, mice and screens.', LABS[0].name, 'hardware', 3, 'month', 12 * 24, vendors[0])
  schedule('Install Windows updates', 'Install pending Windows and Office updates on every PC, then restart.', LABS[2].name, 'software', 1, 'month', 2 * 24, null)
  schedule('Antivirus scan and update', 'Update antivirus definitions and run a full scan on every PC.', LABS[3].name, 'software', 1, 'week', -1, vendors[1])

  await out.done()
  return { computers: computers.length, vendors: vendors.length, tickets: ticketCount }
}

/** Deletes everything created by seedDemoData (and nothing else). */
export async function clearDemoData(): Promise<number> {
  const out = new Batcher()
  let removed = 0
  const demo = (name: string) => getDocs(query(collection(db, name), where('demo', '==', true)))

  const [tickets, computers, vendors, schedules] = await Promise.all([demo('tickets'), demo('computers'), demo('vendors'), demo('schedules')])
  const subs = await Promise.all(
    tickets.docs.flatMap((t) => [getDocs(collection(db, 'tickets', t.id, 'events')), getDocs(collection(db, 'tickets', t.id, 'photos'))]),
  )
  for (const snap of subs) snap.forEach((e) => (out.delete(e.ref), removed++))
  for (const snap of [tickets, computers, vendors, schedules]) snap.forEach((d) => (out.delete(d.ref), removed++))
  await out.done()
  await Promise.all(vendors.docs.map((v) => deleteInvite(v.id)))
  return removed
}
