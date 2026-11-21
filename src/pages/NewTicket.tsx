import { CircleAlert, MapPin, Monitor, QrCode, Send, Timer } from 'lucide-react'
import { orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.tsx'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { PhotoPicker } from '../components/Photos.tsx'
import { ACTIVE_STATUSES, CATEGORY_LABEL, PRIORITY_LABEL } from '../lib/constants.ts'
import { ticketCode, timeAgo } from '../lib/format.ts'
import { useT } from '../lib/settings.tsx'
import { slaTarget } from '../lib/sla.ts'
import { computersCol } from '../services/admin.ts'
import { addPhotos, type PreparedPhoto } from '../services/photos.ts'
import { createTicket, ticketsCol } from '../services/tickets.ts'
import type { Computer, IssueCategory, Priority, Ticket } from '../types.ts'

export default function NewTicket() {
  const { actor, isAdmin } = useAuth()
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const computersQ = useMemo(() => query(computersCol, orderBy('lab'), orderBy('assetTag')), [])
  const { data: computers, loading } = useLiveQuery<Computer>(computersQ)

  const labs = useMemo(() => [...new Set(computers.map((c) => c.lab))], [computers])
  const preselected = computers.find((c) => c.id === params.get('computer'))

  const [lab, setLab] = useState('')
  const [computerId, setComputerId] = useState('')
  const [category, setCategory] = useState<IssueCategory>('hardware')
  const [priority, setPriority] = useState<Priority>('medium')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveLab = lab || preselected?.lab || ''
  const effectiveComputerId = computerId || preselected?.id || ''
  const labComputers = computers.filter((c) => c.lab === effectiveLab)
  const chosen = computers.find((c) => c.id === effectiveComputerId)
  const fromQr = !!preselected && !lab && !computerId

  // Already-open tickets for the chosen PC, so people don't report the same fault twice.
  const openQ = useMemo(() => (effectiveComputerId ? query(ticketsCol, where('computerId', '==', effectiveComputerId)) : null), [effectiveComputerId])
  const { data: pcTickets } = useLiveQuery<Ticket>(openQ)
  const openTickets = pcTickets.filter((tk) => ACTIVE_STATUSES.includes(tk.status))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const computer = computers.find((c) => c.id === effectiveComputerId)
    if (!computer || !actor) return
    setBusy(true)
    setError(null)
    try {
      const id = await createTicket({ computer, category, priority, title, description }, actor)
      // The report is saved even if a photo can't be; they can be added again on the ticket page.
      await addPhotos({ id, assetTag: computer.assetTag, title }, photos, actor).catch(() => {})
      navigate(`/tickets/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not submit the report'))
      setBusy(false)
    }
  }

  if (!loading && computers.length === 0) {
    return (
      <div className="card mx-auto flex max-w-xl flex-col items-center gap-3 p-12 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Monitor className="size-6" /></div>
        <div className="font-semibold text-slate-800">{t('No computers registered yet')}</div>
        {isAdmin ? (
          <Link to="/computers" className="btn-primary mt-2">{t('Add lab computers')}</Link>
        ) : (
          <p className="text-sm text-slate-500">{t('Ask a lab admin to add the lab computers first.')}</p>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="page-title">{t('Report a broken computer')}</h1>
      <p className="mt-1 mb-8 text-sm text-slate-500">{t('The lab admin sees it instantly and can call the maintenance company.')}</p>

      <form onSubmit={onSubmit} className="card space-y-6 p-6 sm:p-8">
        {fromQr && chosen && (
          <div className="flex items-center gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-on shadow-md shadow-brand-600/30"><QrCode className="size-5" /></span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-brand-700">{t('Scanned from QR sticker')}</div>
              <div className="truncate text-lg font-bold text-ink-900">{chosen.assetTag}</div>
              <div className="flex items-start gap-1 text-xs text-slate-500"><MapPin className="mt-px size-3.5 shrink-0" /> {chosen.lab}{chosen.location ? ` · ${chosen.location}` : ''}</div>
            </div>
            <button
              type="button"
              className="ml-auto shrink-0 text-xs font-semibold text-brand-700 hover:underline"
              onClick={() => {
                setLab(chosen.lab)
                setComputerId(chosen.id)
              }}
            >
              {t('Change')}
            </button>
          </div>
        )}
        <div className={`grid gap-4 sm:grid-cols-2 ${fromQr && chosen ? 'hidden' : ''}`}>
          <div>
            <label className="label" htmlFor="lab">{t('Lab')}</label>
            <select
              id="lab"
              className="input"
              required
              value={effectiveLab}
              onChange={(e) => {
                setLab(e.target.value)
                setComputerId('')
              }}
            >
              <option value="" disabled>{t('Select lab…')}</option>
              {labs.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pc">{t('Computer')}</label>
            <select
              id="pc"
              className="input"
              required
              disabled={!effectiveLab}
              value={effectiveComputerId}
              onChange={(e) => setComputerId(e.target.value)}
            >
              <option value="" disabled>{t('Select PC…')}</option>
              {labComputers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.assetTag}{c.location ? ` (${c.location})` : ''}{c.status !== 'working' ? ` (${t('already reported')})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {openTickets.length > 0 && (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-700 ring-1 ring-amber-200">
            <div className="flex items-center gap-2 font-semibold"><CircleAlert className="size-4" /> {t('This PC already has an open ticket')}</div>
            <ul className="mt-2 space-y-1">
              {openTickets.slice(0, 3).map((tk) => (
                <li key={tk.id}>
                  <Link to={`/tickets/${tk.id}`} className="underline-offset-2 hover:underline">
                    <span className="font-mono text-xs">{ticketCode(tk.id)}</span> · {tk.title} · {timeAgo(tk.createdAt)}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">{t('If it’s the same problem, open that ticket and add a comment instead. Otherwise, carry on below.')}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cat">{t('Problem type')}</label>
            <select id="cat" className="input" value={category} onChange={(e) => setCategory(e.target.value as IssueCategory)}>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
            </select>
          </div>
          <div>
            <span className="label">{t('Priority')}</span>
            <div className="grid grid-cols-4 gap-1">
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                    priority === p
                      ? p === 'critical'
                        ? 'border-rose-600 bg-rose-600 text-on shadow-sm shadow-rose-600/30'
                        : 'border-ink-900 bg-ink-900 text-on shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-white/60'
                  }`}
                >
                  {t(PRIORITY_LABEL[p])}
                </button>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Timer className="size-3.5" /> {t('Fix target: {target}', { target: slaTarget(priority) })}
            </p>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="title">{t('Short summary')}</label>
          <input id="title" className="input" required maxLength={120} placeholder={t('e.g. PC won’t turn on, blue screen on boot')} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="desc">{t('Details')}</label>
          <textarea
            id="desc"
            className="input"
            rows={5}
            placeholder={t('What happened? Any error message? What have you tried?')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <span className="label">{t('Photos')}</span>
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </div>

        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Link to="/" className="btn-secondary">{t('Cancel')}</Link>
          <button type="submit" className="btn-primary" disabled={busy || !effectiveComputerId}>
            <Send /> {busy ? t('Submitting…') : t('Submit report')}
          </button>
        </div>
      </form>
    </div>
  )
}
