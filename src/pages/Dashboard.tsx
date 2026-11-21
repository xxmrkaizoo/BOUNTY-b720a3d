import { orderBy, query } from 'firebase/firestore'
import { AlarmClock, ChevronRight, CircleCheck, Clock, Inbox, Monitor, Plus, Search, Wrench, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PriorityBadge, SlaBadge, StatusBadge } from '../components/Badge.tsx'
import { useAuth } from '../hooks/useAuth.tsx'
import { translate, useT } from '../lib/settings.tsx'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { ACTIVE_STATUSES, PRIORITY_LABEL as PRIORITY_LABEL_EN, STATUS_LABEL } from '../lib/constants.ts'
import { ticketCode, timeAgo } from '../lib/format.ts'
import { isOverdue, useNow } from '../lib/sla.ts'
import { computersCol } from '../services/admin.ts'
import { ticketsCol } from '../services/tickets.ts'
import type { Computer, Priority, Ticket, TicketStatus } from '../types.ts'

type Filter = 'active' | 'all' | 'overdue' | TicketStatus

const PRIORITY_BAR: Record<Priority, string> = {
  low: 'bg-slate-300',
  medium: 'bg-yellow-400',
  high: 'bg-orange-500',
  critical: 'bg-rose-600',
}

function Stat({ label, value, icon: Icon, tone, hint }: { label: string; value: number; icon: LucideIcon; tone: string; hint: string }) {
  return (
    <div className="card group relative overflow-hidden p-4 transition hover:shadow-lift sm:p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-extrabold sm:mt-2 sm:text-3xl tracking-tight text-slate-900">{value}</div>
        </div>
        <div className={`grid size-9 shrink-0 place-items-center rounded-xl sm:size-11 ${tone}`}>
          <Icon className="size-5" />
        </div>
      </div>
      <div className="mt-3 hidden text-xs text-slate-400 sm:block">{hint}</div>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  return translate(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening')
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const tr = useT()
  const ticketsQ = useMemo(() => query(ticketsCol, orderBy('createdAt', 'desc')), [])
  const computersQ = useMemo(() => query(computersCol), [])
  const { data: tickets, loading, error } = useLiveQuery<Ticket>(ticketsQ)
  const { data: computers } = useLiveQuery<Computer>(computersQ)

  const now = useNow()
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')

  const stats = useMemo(
    () => ({
      open: tickets.filter((t) => t.status === 'open').length,
      called: tickets.filter((t) => t.status === 'assigned' || t.status === 'in_progress').length,
      resolved: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
      down: computers.filter((c) => c.status !== 'working').length,
      overdue: tickets.filter((t) => isOverdue(t, now)).length,
    }),
    [tickets, computers, now],
  )

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase()
    return tickets.filter((t) => {
      if (filter === 'active' && !ACTIVE_STATUSES.includes(t.status)) return false
      if (filter === 'overdue' && !isOverdue(t, now)) return false
      if (filter !== 'active' && filter !== 'all' && filter !== 'overdue' && t.status !== filter) return false
      if (!s) return true
      return [t.title, t.assetTag, t.lab, ticketCode(t.id), t.reportedBy?.name, t.vendorName ?? '']
        .join(' ')
        .toLowerCase()
        .includes(s)
    })
  }, [tickets, filter, search, now])

  const healthy = computers.length ? Math.round(((computers.length - stats.down) / computers.length) * 100) : 100

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-600">{greeting()}, {profile?.name?.split(' ')[0]} 👋</p>
          <h1 className="page-title mt-1">{tr('Repair tickets')}</h1>
        </div>
        <Link to="/tickets/new" className="btn-primary">
          <Plus /> {tr('Report a broken PC')}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label={tr('Waiting')} value={stats.open} icon={Clock} tone="bg-amber-100/80 text-amber-600" hint={tr('Not yet sent to maintenance')} />
        <Stat label={tr('With maintenance')} value={stats.called} icon={Wrench} tone="bg-brand-100/80 text-brand-600" hint={tr('Vendor called or repairing')} />
        <Stat label={tr('Resolved')} value={stats.resolved} icon={CircleCheck} tone="bg-emerald-100/80 text-emerald-600" hint={tr('Fixed and closed tickets')} />
        <Stat label={tr('PCs out of service')} value={stats.down} icon={Monitor} tone="bg-rose-100/80 text-rose-600" hint={tr('{p}% of {n} PCs working', { p: healthy, n: computers.length })} />
      </div>

      {stats.overdue > 0 && filter !== 'overdue' && (
        <button
          onClick={() => setFilter('overdue')}
          className="flex w-full items-center gap-3 rounded-2xl bg-rose-50 p-4 text-left text-sm text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600"><AlarmClock className="size-5" /></span>
          <span className="flex-1">
            <span className="block font-semibold">{tr('{n} tickets are past their fix deadline', { n: stats.overdue })}</span>
            <span className="text-xs">{tr('Chase the maintenance company or update the status.')}</span>
          </span>
          <span className="text-xs font-semibold whitespace-nowrap">{tr('Show them')} →</span>
        </button>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-brand-900/[0.06] p-4 md:flex-row md:items-center">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:pb-0">
            {(['active', 'overdue', 'all', 'open', 'assigned', 'in_progress', 'resolved', 'closed'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  filter === f ? 'bg-ink-900 text-on shadow-sm' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
                }`}
              >
                {f === 'active' ? tr('Active') : f === 'all' ? tr('All') : f === 'overdue' ? `${tr('Overdue')}${stats.overdue ? ` (${stats.overdue})` : ''}` : tr(STATUS_LABEL[f])}
              </button>
            ))}
          </div>
          <div className="relative md:ml-auto md:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input py-2 pl-10" placeholder={tr('Search PC, lab, ticket…')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {error && <p className="p-4 text-sm text-rose-600">{tr('Error: {msg}', { msg: error.message })}</p>}
        {loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/50" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-14 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <Inbox className="size-6" />
            </div>
            <div className="font-semibold text-slate-800">{tr('All clear here')}</div>
            <p className="max-w-xs text-sm text-slate-500">{tr('No tickets match this view. When a PC breaks down, report it and it will show up here live.')}</p>
            {isAdmin && tickets.length === 0 && (
              <Link to="/reports" className="btn-secondary mt-1">{tr('Try it with demo data')}</Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-brand-900/[0.06]">
            {visible.map((t) => (
              <li key={t.id}>
                <Link to={`/tickets/${t.id}`} className="group flex items-center gap-4 px-4 py-4 transition hover:bg-white/50 sm:px-5">
                  <span className={`h-10 w-1 shrink-0 rounded-full ${PRIORITY_BAR[t.priority]}`} title={tr(PRIORITY_LABEL_EN[t.priority])} />
                  <div className="hidden size-10 shrink-0 place-items-center rounded-xl bg-white/70 text-brand-600 sm:grid">
                    <Monitor className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-slate-900">{t.title}</span>
                      <span className="hidden font-mono text-[11px] text-slate-400 sm:inline">{ticketCode(t.id)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      <span className="font-medium text-slate-600">{tr(t.assetTag)}</span> · {t.lab} · {t.reportedBy?.name} · {timeAgo(t.createdAt)}
                      {t.vendorName && <> · <Wrench className="inline size-3" /> {t.vendorName}</>}
                    </div>
                  </div>
                  <div className="hidden lg:block"><SlaBadge ticket={t} now={now} hideOk /></div>
                  <div className="hidden md:block"><PriorityBadge priority={t.priority} /></div>
                  <StatusBadge status={t.status} />
                  <ChevronRight className="hidden size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
