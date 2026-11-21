import { doc, orderBy, query } from 'firebase/firestore'
import {
  ArrowLeft,
  Building,
  CalendarClock,
  CircleCheck,
  Hammer,
  Layers,
  MapPin,
  Monitor,
  RotateCcw,
  PhoneCall,
  Tag,
  Timer,
  UserRound,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PriorityBadge, SlaBadge, StatusBadge } from '../components/Badge.tsx'
import CallVendorDialog from '../components/CallVendorDialog.tsx'
import { RatingCard } from '../components/Rating.tsx'
import { TicketChat, TicketHistory } from '../components/TicketChat.tsx'
import { PhotoGallery } from '../components/Photos.tsx'
import { useAuth } from '../hooks/useAuth.tsx'
import { useLiveDoc, useLiveQuery } from '../hooks/useLiveQuery.ts'
import { CATEGORY_LABEL, NEXT_STATUSES, STATUS_LABEL } from '../lib/constants.ts'
import { db } from '../lib/firebase.ts'
import { formatDateTime, ticketCode } from '../lib/format.ts'
import { slaDue, useNow } from '../lib/sla.ts'
import { addPhotos, deletePhoto, photosCol } from '../services/photos.ts'
import { CURRENCY, fmtMoney } from '../lib/stats.ts'
import { addComment, eventsCol, rateTicket, updateTicketStatus } from '../services/tickets.ts'
import type { Ticket, TicketEvent, TicketPhoto, TicketStatus } from '../types.ts'
import { useT } from '../lib/settings.tsx'

type Detail = [LucideIcon, string, ReactNode]

const STEPS: TicketStatus[] = ['open', 'assigned', 'in_progress', 'resolved']

function Progress({ status }: { status: TicketStatus }) {
  const t = useT()
  const current = status === 'closed' ? STEPS.length - 1 : STEPS.indexOf(status)
  return (
    <div className="card p-5">
      <ol className="flex items-center">
        {STEPS.map((s, i) => {
          const done = i <= current
          return (
            <li key={s} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={`grid size-8 place-items-center rounded-full text-xs font-bold transition ${
                    done ? 'bg-brand-600 text-on shadow-md shadow-brand-600/30' : 'bg-slate-100 text-slate-400'
                  } ${i === current ? 'ring-4 ring-brand-500/20' : ''}`}
                >
                  {i < current ? <CircleCheck className="size-4" /> : i + 1}
                </span>
                <span className={`text-[11px] font-semibold whitespace-nowrap ${done ? 'text-slate-800' : 'text-slate-400'}`}>
                  {t(STATUS_LABEL[s])}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-2 mb-5 h-0.5 flex-1 rounded-full ${i < current ? 'bg-brand-500' : 'bg-slate-200'}`} />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function TicketDetail() {
  const t = useT()
  const { id = '' } = useParams()
  const { actor, profile, isAdmin, isTechnician } = useAuth()
  const now = useNow()
  const home = isTechnician ? '/portal' : '/'
  const ticketRef = useMemo(() => doc(db, 'tickets', id), [id])
  const eventsQ = useMemo(() => query(eventsCol(id), orderBy('at', 'asc')), [id])
  const { data: ticket, loading } = useLiveDoc<Ticket>(ticketRef)
  const { data: events } = useLiveQuery<TicketEvent>(eventsQ)
  const photosQ = useMemo(() => query(photosCol(id), orderBy('at', 'asc')), [id])
  const { data: photos } = useLiveQuery<TicketPhoto>(photosQ)

  const [callOpen, setCallOpen] = useState(false)
  const [statusNote, setStatusNote] = useState('')
  const [parts, setParts] = useState('')
  const [cost, setCost] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Action failed'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-white/60" />
        <div className="h-40 animate-pulse rounded-2xl bg-white/50" />
      </div>
    )
  }
  if (!ticket) {
    return (
      <div className="card p-8 text-center text-sm">
        {t('Ticket not found, or it isn’t assigned to your company.')} <Link to={home} className="font-semibold text-brand-600 hover:underline">{t('Go back')}</Link>
      </div>
    )
  }

  const changeStatus = (s: TicketStatus) =>
    run(async () => {
      const c = Number(cost.replace(',', '.'))
      const repair = s === 'resolved' && (parts.trim() || cost.trim()) ? { parts: parts.trim(), cost: Number.isFinite(c) && c > 0 ? c : 0 } : null
      await updateTicketStatus(ticket, s, actor!, statusNote, profile!.role, repair)
      setStatusNote('')
      setParts('')
      setCost('')
    })

  const isDoneTicket = ticket.status === 'resolved' || ticket.status === 'closed'
  const canRate = !isTechnician && (isAdmin || ticket.reportedBy?.uid === actor?.uid)

  // Admins can move a ticket anywhere; technicians only start / finish the repair.
  const TECH_NEXT: Partial<Record<TicketStatus, TicketStatus[]>> = { assigned: ['in_progress', 'resolved'], in_progress: ['resolved'] }
  const nextOptions: TicketStatus[] = isAdmin ? NEXT_STATUSES[ticket.status] : isTechnician ? (TECH_NEXT[ticket.status] ?? []) : []

  const details: Detail[] = [
    [Monitor, t('Computer'), ticket.computerId ? <Link to={`/computers/${ticket.computerId}`} className="text-brand-700 hover:underline">{ticket.assetTag}</Link> : t(ticket.assetTag)],
    [MapPin, t('Lab'), ticket.lab],
    [Layers, t('Problem type'), t(CATEGORY_LABEL[ticket.category])],
    [UserRound, t('Reported by'), ticket.reportedBy?.name],
    [CalendarClock, t('Reported at'), formatDateTime(ticket.createdAt)],
    [Timer, t('Fix by'), formatDateTime(slaDue(ticket))],
    [Building, t('Maintenance'), ticket.vendorName ?? t('Not called yet')],
    [CircleCheck, t('Resolved at'), formatDateTime(ticket.resolvedAt)],
    ...(ticket.repair?.parts ? [[Wrench, t('Parts replaced'), ticket.repair.parts] as Detail] : []),
    ...(ticket.repair && ticket.repair.cost > 0 ? [[Wallet, t('Repair cost'), fmtMoney(ticket.repair.cost)] as Detail] : []),
    ...((ticket.reopenCount ?? 0) > 0 ? [[RotateCcw, t('Reopened'), t('{n} time(s)', { n: ticket.reopenCount ?? 0 })] as Detail] : []),
  ]

  return (
    <div className="space-y-6">
      <Link to={home} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
        <ArrowLeft className="size-4" /> {isTechnician ? t('All repair jobs') : t('All tickets')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-xs font-medium text-slate-400">
            <Tag className="size-3.5" /> {ticketCode(ticket.id)}
          </div>
          <h1 className="page-title mt-1">{ticket.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <SlaBadge ticket={ticket} now={now} />
            {ticket.scheduleId && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 ring-inset">
                <CalendarClock className="size-3.5" /> {t('Planned maintenance')}
              </span>
            )}
          </div>
        </div>
        {isAdmin && ticket.status !== 'closed' && (
          <button className="btn-accent px-5 py-3 text-base" onClick={() => setCallOpen(true)}>
            <PhoneCall className="size-5!" /> {t('Call maintenance company')}
          </button>
        )}
      </div>

      {ticket.status !== 'closed' && <Progress status={ticket.status} />}

      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-6">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-slate-400 uppercase">{t('Problem description')}</h2>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-700">{ticket.description || t('No extra details.')}</p>
          </section>

          <PhotoGallery
            photos={photos}
            canAdd={!!actor && ticket.status !== 'closed'}
            canDelete={(p) => isAdmin || p.by?.uid === actor?.uid}
            onAdd={(ps) => addPhotos(ticket, ps, actor!, profile!.role)}
            onDelete={(p) => deletePhoto(ticket.id, p.id)}
          />

          <TicketChat
            events={events}
            meUid={actor?.uid ?? ''}
            technician={isTechnician}
            onSend={(text) => addComment(ticket, text, actor!, profile!.role)}
          />

          <TicketHistory events={events} />
        </div>

        <aside className="space-y-6">
          <section className="card p-2">
            {details.map(([Icon, k, v]) => (
              <div key={k} className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm">
                <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <span className="text-slate-500">{k}</span>
                <span className="ml-auto text-right font-semibold text-slate-800">{v}</span>
              </div>
            ))}
          </section>

          {nextOptions.length > 0 && (
            <section className="card space-y-3 p-5">
              <h2 className="font-bold text-slate-900">{isTechnician ? t('Update this job') : t('Update status')}</h2>
              <input
                className="input"
                placeholder={isTechnician ? t('What did you do? e.g. replaced PSU') : t('Note (optional), e.g. replaced PSU')}
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
              />
              {nextOptions.includes('resolved') && (
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  <input className="input" maxLength={300} placeholder={t('Parts replaced (optional)')} value={parts} onChange={(e) => setParts(e.target.value)} />
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder={t('Cost ({cur})', { cur: CURRENCY })}
                    aria-label={t('Repair cost')}
                    value={cost}
                    onChange={(e) => setCost(e.target.value.replace(/[^\d.,]/g, ''))}
                  />
                </div>
              )}
              <div className="grid gap-2">
                {nextOptions.map((s) => (
                  <button key={s} disabled={busy} onClick={() => changeStatus(s)} className={s === 'resolved' || (s === 'in_progress' && isTechnician) ? 'btn-primary' : 'btn-secondary'}>
                    {s === 'resolved' && <CircleCheck />}
                    {s === 'in_progress' && isTechnician && <Hammer />}
                    {isTechnician
                      ? s === 'in_progress' ? t('Start repair') : t('Mark as fixed')
                      : s === 'open' ? t('Reopen ticket') : t('Mark as {status}', { status: t(STATUS_LABEL[s]) })}
                  </button>
                ))}
              </div>
              {isTechnician && <p className="text-xs text-slate-500">{t('The lab sees every update instantly.')}</p>}
            </section>
          )}

          {isDoneTicket && (
            <RatingCard rating={ticket.rating} canRate={canRate} onRate={(stars, c) => rateTicket(ticket, stars, c, actor!)} />
          )}
        </aside>
      </div>

      <CallVendorDialog ticket={ticket} open={callOpen} onClose={() => setCallOpen(false)} />
    </div>
  )
}
