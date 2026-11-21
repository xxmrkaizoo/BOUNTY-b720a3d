import { Camera, ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, Trash2, X } from 'lucide-react'
import { useEffect, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { formatDateTime } from '../lib/format.ts'
import { useT } from '../lib/settings.tsx'
import { MAX_PHOTOS, preparePhoto, type PreparedPhoto } from '../services/photos.ts'
import type { TicketPhoto } from '../types.ts'

/** Turns picked files into compressed photos; reports a translated error for any that fail. */
function usePhotoInput(room: number, onAdd: (p: PreparedPhoto[]) => void) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = '' // allow picking the same file again
    if (files.length === 0) return
    setError(null)
    setBusy(true)
    const ok: PreparedPhoto[] = []
    let failed = 0
    for (const f of files.slice(0, Math.max(0, room))) {
      try {
        ok.push(await preparePhoto(f))
      } catch {
        failed++
      }
    }
    setBusy(false)
    if (files.length > room) setError(t('You can add up to {n} photos.', { n: MAX_PHOTOS }))
    else if (failed) setError(t('{n} file(s) could not be used. Please pick a JPG or PNG photo.', { n: failed }))
    if (ok.length) onAdd(ok)
  }
  return { busy, error, onPick }
}

/** Photo picker for the report form: take or choose up to 4 photos. */
export function PhotoPicker({ photos, onChange }: { photos: PreparedPhoto[]; onChange: (p: PreparedPhoto[]) => void }) {
  const t = useT()
  const room = MAX_PHOTOS - photos.length
  const { busy, error, onPick } = usePhotoInput(room, (p) => onChange([...photos, ...p]))
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => (
          <div key={i} className="group relative aspect-square overflow-hidden rounded-xl bg-white/60 ring-1 ring-white">
            <img src={p.dataUrl} alt={t('Photo {n}', { n: i + 1 })} className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, j) => j !== i))}
              className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-ink-950/70 text-[#fff] backdrop-blur transition hover:bg-rose-600"
              aria-label={t('Remove photo')}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {room > 0 && (
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-brand-300/70 bg-white/40 p-2 text-center text-xs font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-white/70">
            {busy ? <LoaderCircle className="size-6 animate-spin" /> : <Camera className="size-6" />}
            {busy ? t('Preparing…') : t('Take / add photo')}
            <input type="file" accept="image/*" multiple className="sr-only" disabled={busy} onChange={onPick} />
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">{t('Optional. A photo of the error screen or damage helps the technician bring the right parts.')}</p>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  )
}

/** Full-screen photo viewer with previous / next. */
function Lightbox({ photos, index, onIndex, onClose }: { photos: TicketPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const t = useT()
  const p = photos[index]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length)
      if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onIndex, onClose])
  if (!p) return null
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#020817]/90 backdrop-blur-md" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('Photos')}>
      <div className="flex items-center justify-between p-4 text-sm text-[#cbd5e1]">
        <span>
          {index + 1} / {photos.length} · {p.by?.name} · {formatDateTime(p.at)}
        </span>
        <button className="rounded-lg p-2 text-[#fff] hover:bg-[#ffffff1a]" onClick={onClose} aria-label={t('Close')}><X className="size-6" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
        <img src={p.dataUrl} alt={t('Photo {n}', { n: index + 1 })} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        {photos.length > 1 && (
          <>
            <button
              className="absolute left-3 grid size-11 place-items-center rounded-full bg-[#ffffff26] text-[#fff] backdrop-blur hover:bg-[#ffffff40]"
              onClick={(e) => (e.stopPropagation(), onIndex((index - 1 + photos.length) % photos.length))}
              aria-label={t('Previous photo')}
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              className="absolute right-3 grid size-11 place-items-center rounded-full bg-[#ffffff26] text-[#fff] backdrop-blur hover:bg-[#ffffff40]"
              onClick={(e) => (e.stopPropagation(), onIndex((index + 1) % photos.length))}
              aria-label={t('Next photo')}
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Photo gallery on a ticket, with "add photo" for people allowed to. */
export function PhotoGallery({
  photos,
  canAdd,
  canDelete,
  onAdd,
  onDelete,
}: {
  photos: TicketPhoto[]
  canAdd: boolean
  canDelete: (p: TicketPhoto) => boolean
  onAdd: (p: PreparedPhoto[]) => Promise<void>
  onDelete: (p: TicketPhoto) => Promise<void>
}) {
  const t = useT()
  const [open, setOpen] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const room = 12 - photos.length
  const { busy, error, onPick } = usePhotoInput(Math.min(MAX_PHOTOS, room), async (p) => {
    setSaving(true)
    setSaveError(null)
    try {
      await onAdd(p)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t('Upload failed'))
    } finally {
      setSaving(false)
    }
  })

  if (photos.length === 0 && !canAdd) return null
  return (
    <section className="card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold tracking-wide text-slate-400 uppercase">{t('Photos')} {photos.length > 0 && `(${photos.length})`}</h2>
        {canAdd && room > 0 && (
          <label className={`btn-secondary cursor-pointer px-3 py-1.5 text-xs ${busy || saving ? 'pointer-events-none opacity-60' : ''}`}>
            {busy || saving ? <LoaderCircle className="animate-spin" /> : <ImagePlus />} {busy || saving ? t('Uploading…') : t('Add photo')}
            <input type="file" accept="image/*" multiple className="sr-only" disabled={busy || saving} onChange={onPick} />
          </label>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-slate-500">{t('No photos yet. Add one of the error screen, or of the repair when it’s done.')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-white/60 ring-1 ring-white">
              <button className="size-full" onClick={() => setOpen(i)} aria-label={t('Open photo {n}', { n: i + 1 })}>
                <img src={p.dataUrl} alt={t('Photo {n}', { n: i + 1 })} className="size-full object-cover transition group-hover:scale-105" loading="lazy" />
              </button>
              <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-[#020817cc] to-transparent px-2 pt-4 pb-1 text-[10px] font-medium text-[#fff]">
                {p.by?.name}
              </span>
              {canDelete(p) && (
                <button
                  onClick={() => confirm(t('Delete this photo?')) && onDelete(p)}
                  className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-ink-950/70 text-[#fff] opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-rose-600 focus:opacity-100"
                  aria-label={t('Delete photo')}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {(error || saveError) && <p className="mt-3 text-sm text-rose-600">{error || saveError}</p>}
      {open !== null && <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </section>
  )
}
