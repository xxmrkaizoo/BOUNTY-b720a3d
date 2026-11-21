import { query, where } from 'firebase/firestore'
import { ChevronRight, CircleCheck, ClipboardList, Hammer, Inbox, MapPin, Monitor, Star, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PriorityBadge, SlaBadge, StatusBadge } from '../components/Badge.tsx'
import { useAuth } from '../hooks/useAuth.tsx'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { CATEGORY_SHORT } from '../lib/constants.ts'
import { ticketCode, timeAgo } from '../lib/format.ts'
import { isOverdue, useNow } from '../lib/sla.ts'
import { ticketsCol } from '../services/tickets.ts'
import type { Priority, Ticket } from '../types.ts'
import { useT } from '../lib/settings.tsx'

type Tab = 'todo' | 'done' | 'all'
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const PRIORITY_BAR: Record<Priority, string> = { low: 'bg-slate-300', medium: 'bg-yellow-400', high: 'bg-orange-500', critical: 'bg-rose-600' }
const isTodo = (t: Ticket) => t.status === 'assigned' || t.status === 'in_progress'

function Stat({ label, value, icon: Icon, tone }: { label: string; value: number | string; icon: LucideIcon; tone: string }) {
  return (
    <div className="card flex items-center gap-4 p-4 sm:p-5">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span>
      <div>
        <div className="text-2xl font-extrabold tracking-tight text-ink-900">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </div>
  )
}

/** Maintenance company view: only jobs assigned to the technician's company. */
export default function Portal() {
  const tr = useT()
  const { profile } = useAuth()
  const vendorId = profile?.vendorId ?? '__none__'
  // Rules only allow reading tickets of your own company, so the query must say so.
  const q = useMemo(() => query(ticketsCol, where('vendorId', '==', vendorId)), [vendorId])
  const { data: tickets, loading, error } = useLiveQuery<Ticket>(q)
  const [tab, setTab] = useState<Tab>('todo')
  const now = useNow()

  const sorted = useMemo(
    () =>
      [...tickets].sort(
        (a, b) =>
          Number(isTodo(b)) - Number(isTodo(a)) ||
          Number(isOverdue(b, now)) - Number(isOverdue(a, now)) ||
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
      ),
    [tickets, now],
  )
  const visible = sorted.filter((t) => (tab === 'todo' ? isTodo(t) : tab === 'done' ? !isTodo(t) : true))
  const counts = {
    waiting: tickets.filter((t) => t.status === 'assigned').length,
    repairing: tickets.filter((t) => t.status === 'in_progress').length,
    fixed: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
  }
  const stars = tickets.map((t) => t.rating?.stars).filter((x): x is number => typeof x === 'number')
  const rating = stars.length ? (stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(1) : '—'

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-brand-600">{profile?.vendorName} · {tr('Maintenance portal')}</p>
        <h1 className="page-title mt-1">{tr('Repair jobs')}</h1>
        <p className="mt-1 text-sm text-slate-500">{tr('Jobs the lab has sent to your company. Overdue, critical and high priority jobs are listed first.')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={tr('New, waiting for you')} value={counts.waiting} icon={ClipboardList} tone="bg-amber-100/80 text-amber-600" />
        <Stat label={tr('Repair in progress')} value={counts.repairing} icon={Hammer} tone="bg-violet-100/80 text-violet-600" />
        <Stat label={tr('Fixed')} value={counts.fixed} icon={CircleCheck} tone="bg-emerald-100/80 text-emerald-600" />
        <Stat label={tr('Lab rating ({n} reviews)', { n: stars.length })} value={rating} icon={Star} tone="bg-amber-100/80 text-amber-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex gap-1 border-b border-brand-900/[0.06] p-4">
          {([
            ['todo', tr('To do')],
            ['done', tr('Completed')],
            ['all', tr('All')],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === id ? 'bg-ink-900 text-on shadow-sm' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="p-4 text-sm text-rose-600">Error: {error.message}</p>}
        {loading ? (
          <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-white/50" />)}</div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-14 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-brand-100/80 text-brand-600"><Inbox className="size-6" /></div>
            <div className="font-semibold text-slate-800">{tab === 'todo' ? tr('No open jobs right now') : tr('Nothing here yet')}</div>
            <p className="max-w-xs text-sm text-slate-500">{tr('When the lab sends your company a repair request, it appears here instantly.')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-brand-900/[0.06]">
            {visible.map((t) => (
              <li key={t.id}>
                <Link to={`/tickets/${t.id}`} className="group flex items-center gap-4 px-4 py-4 transition hover:bg-white/50 sm:px-5">
                  <span className={`h-12 w-1 shrink-0 rounded-full ${PRIORITY_BAR[t.priority]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{t.title}</span>
                      <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-white">
                        {tr(CATEGORY_SHORT[t.category])}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 font-medium text-slate-700"><Monitor className="size-3.5" /> {tr(t.assetTag)}</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {t.lab}</span>
                      <span>{ticketCode(t.id)} · {timeAgo(t.createdAt)}</span>
                    </div>
                    {isTodo(t) && <div className="mt-1.5"><SlaBadge ticket={t} now={now} /></div>}
                  </div>
                  <div className="hidden sm:block"><PriorityBadge priority={t.priority} /></div>
                  <StatusBadge status={t.status} />
                  <ChevronRight className="hidden size-4 text-slate-300 group-hover:text-slate-500 sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
