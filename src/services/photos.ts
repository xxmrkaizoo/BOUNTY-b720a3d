import { collection, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase.ts'
import type { Actor, Role, Ticket } from '../types.ts'
import { audience, queueNotices } from './notify.ts'

/**
 * Ticket photos are shrunk in the browser and saved as small JPEGs inside
 * Firestore (tickets/{id}/photos). That keeps LabFix on the free Spark plan:
 * Firebase Storage needs the paid Blaze plan for new projects.
 */
export const photosCol = (ticketId: string) => collection(db, 'tickets', ticketId, 'photos')

export const MAX_PHOTOS = 4
/** Firestore documents are limited to 1 MiB; stay well under it. */
const MAX_DATA_URL = 700_000

export interface PreparedPhoto {
  dataUrl: string
  width: number
  height: number
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('not-an-image'))
    }
    img.src = url
  })
}

/** Resize (longest side ≤ 1280px) and re-encode as JPEG until it fits. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('not-an-image')
  const img = await loadImage(file)
  for (const [maxSide, quality] of [[1280, 0.75], [1024, 0.65], [800, 0.55], [640, 0.5]] as const) {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas-unavailable')
    ctx.fillStyle = '#fff' // transparent PNGs get a white background
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length <= MAX_DATA_URL) return { dataUrl, width, height }
  }
  throw new Error('too-large')
}

/**
 * Save photos on a ticket. When added after the report (e.g. a technician's
 * "after repair" photo) the other side gets an alert.
 */
export async function addPhotos(
  ticket: Pick<Ticket, 'id' | 'assetTag' | 'title'> & Partial<Pick<Ticket, 'reportedBy' | 'vendorId'>>,
  photos: PreparedPhoto[],
  by: Actor,
  byRole?: Role,
): Promise<void> {
  if (photos.length === 0) return
  const batch = writeBatch(db)
  for (const p of photos) {
    batch.set(doc(photosCol(ticket.id)), { ...p, by, at: serverTimestamp() })
  }
  if (byRole) {
    const text = String(photos.length)
    queueNotices(batch, ticket, by, [
      { audience: ticket.reportedBy?.uid ? audience.user(ticket.reportedBy.uid) : '', kind: 'photo', text },
      { audience: byRole === 'admin' ? '' : audience.admins, kind: 'photo', text },
      { audience: byRole !== 'technician' && ticket.vendorId ? audience.vendor(ticket.vendorId) : '', kind: 'photo', text },
    ])
  }
  await batch.commit()
}

export function deletePhoto(ticketId: string, photoId: string): Promise<void> {
  return deleteDoc(doc(photosCol(ticketId), photoId))
}
