import { doc, query, where } from 'firebase/firestore'
import { ArrowLeft, Clock, History, MapPin, Monitor, Recycle, Siren, Wallet, Wrench, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ComputerStatusBadge, PriorityBadge, StatusBadge } from '../components/Badge.tsx'
import { Stars } from '../components/Rating.tsx'
import { useLiveDoc, useLiveQuery } from '../hooks/useLiveQuery.ts'
import { CATEGORY_SHORT } from '../lib/constants.ts'
import { db } from '../lib/firebase.ts'
import { formatDateTime, ticketCode } from '../lib/format.ts'
import { useT } from '../lib/settings.tsx'
import { costOf, fixHours, fmtDuration, fmtMoney, pcHealth, REPLACE_COST, REPLACE_FAULTS_6M } from '../lib/stats.ts'
import { ticketsCol } from '../services/tickets.ts'
import type { Computer, Ticket } from '../types.ts'

function Tile({ icon: Icon, label, value, tone = 'bg-brand-100/80 text-brand-600' }: { icon: LucideIcon; label: string; value: string; tone?: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span>
      <div className="min-w-0">
        <div className="text-xl font-extrabold tracking-tight text-ink-900 tabular-nums">{value}</div>
        <div className="truncate text-xs text-slate-500">{label}</div>
      </div>
    </div>
  )
}

/** One PC: every fault it ever had, what was replaced, what it cost. */
export default function ComputerHistory() {
  const t = useT()
  const { id = '' } = useParams()
  const pcRef = useMemo(() => doc(db, 'computers', id), [id])
  const { data: pc, loading } = useLiveDoc<Computer>(pcRef)
  const q = useMemo(() => query(ticketsCol, where('computerId', '==', id)), [id])
  const { data: raw } = useLiveQuery<Ticket>(q)
  const tickets = useMemo(() => [...raw].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)), [raw])
  const health = useMemo(() => pcHealth(tickets), [tickets])

  if (loading) return <div className="h-40 animate-pulse rounded-2xl bg-white/50" />
  if (!pc) {
    return (
      <div className="card p-8 text-center text-sm">
        {t('This computer no longer exists.')} <Link to="/computers" className="font-semibold text-brand-600 hover:underline">{t('Go back')}</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/computers" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
        <ArrowLeft className="size-4" /> {t('Lab Computers')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-100/80 text-brand-600"><Monitor className="size-7" /></span>
          <div>
            <h1 className="page-title">{pc.assetTag}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <ComputerStatusBadge status={pc.status} />
              <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {pc.lab}{pc.location ? ` · ${pc.location}` : ''}</span>
              {pc.specs && <span>· {pc.specs}</span>}
            </div>
          </div>
        </div>
        <Link to={`/tickets/new?computer=${pc.id}`} className="btn-primary"><Siren /> {t('Report fault')}</Link>
      </div>

      {health.replace && (
        <div className="flex items-start gap-3 rounded-2xl bg-orange-50 p-4 text-sm text-orange-700 ring-1 ring-orange-200">
          <Recycle className="mt-0.5 size-5 shrink-0" />
          <div>
            <div className="font-semibold">{t('Consider replacing this PC')}</div>
            <div className="text-xs">
              {health.reason === 'faults'
                ? t('{n} faults in the last 6 months (limit {max}). Repairing it again may cost more than a new one.', { n: health.faults6m, max: REPLACE_FAULTS_6M })
                : t('Repairs so far cost {cost} (limit {max}).', { cost: fmtMoney(health.cost), max: fmtMoney(REPLACE_COST) })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile icon={History} label={t('Faults (all time)')} value={String(health.faults)} />
        <Tile icon={Siren} label={t('Faults (last 6 months)')} value={String(health.faults6m)} tone={health.faults6m >= REPLACE_FAULTS_6M ? 'bg-rose-100/80 text-rose-600' : undefined} />
        <Tile icon={Wallet} label={t('Total repair cost')} value={fmtMoney(health.cost)} />
        <Tile icon={Clock} label={t('Total downtime')} value={fmtDuration(health.downtimeHours)} />
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-brand-900/[0.06] px-5 py-4 font-bold text-slate-900">{t('Repair history')}</h2>
        {tickets.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">{t('No faults reported for this PC. 🎉')}</p>
        ) : (
          <ol className="divide-y divide-brand-900/[0.06]">
            {tickets.map((tk) => (
              <li key={tk.id}>
                <Link to={`/tickets/${tk.id}`} className="flex flex-col gap-2 px-5 py-4 transition hover:bg-white/50 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{tk.title}</span>
                      <span className="font-mono text-[11px] text-slate-400">{ticketCode(tk.id)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{formatDateTime(tk.createdAt)}</span>
                      <span>{t(CATEGORY_SHORT[tk.category])}</span>
                      {tk.vendorName && <span className="inline-flex items-center gap-1"><Wrench className="size-3" /> {tk.vendorName}</span>}
                      {fixHours(tk) !== null && <span>{t('Fixed in {d}', { d: fmtDuration(fixHours(tk)) })}</span>}
                      {tk.repair?.parts && <span className="font-medium text-slate-700">{t('Parts: {parts}', { parts: tk.repair.parts })}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {costOf(tk) > 0 && <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-white">{fmtMoney(costOf(tk))}</span>}
                    {tk.rating && <Stars value={tk.rating.stars} size="size-3.5" />}
                    <PriorityBadge priority={tk.priority} />
                    <StatusBadge status={tk.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
