import { orderBy, query } from 'firebase/firestore'
import { AlarmClockCheck, Database, FileDown, FileSpreadsheet, FileText, Hourglass, Monitor, PhoneCall, Sprout, Trash, TrendingUp, Trophy, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarList, Legend, LineChart, Panel, useSeries } from '../components/charts.tsx'
import { Stars } from '../components/Rating.tsx'
import { Chart3D } from '../components/Chart3D.tsx'
import { useAuth } from '../hooks/useAuth.tsx'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { CATEGORY_LABEL, CATEGORY_SHORT, PRIORITY_LABEL, STATUS_LABEL } from '../lib/constants.ts'
import { getLocale, translate } from '../lib/settings.tsx'
import { ticketCode } from '../lib/format.ts'
import { slaDue } from '../lib/sla.ts'
import { avg, companyScores, costOf, fixHours, fmtDuration, fmtMoney, isDone, onTime, pct, sum } from '../lib/stats.ts'
import { computersCol } from '../services/admin.ts'
import { clearDemoData, seedDemoData } from '../services/seed.ts'
import { ticketsCol } from '../services/tickets.ts'
import type { Computer, IssueCategory, Priority, Ticket } from '../types.ts'
import { useT } from '../lib/settings.tsx'

const DAY = 86_400_000
type Range = '30' | '90' | '365' | 'all'
const RANGE_SUB: Record<Range, string> = { '30': 'in the last 30 days', '90': 'in the last 90 days', '365': 'in the last 12 months', all: 'all time' }
const RANGES: { id: Range; label: string }[] = [
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: '365', label: '12 months' },
  { id: 'all', label: 'All time' },
]

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function startOfWeek(d: Date) {
  const x = startOfDay(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // Monday
  return x
}

function Tile({ icon: Icon, label, value, sub, className = '' }: { icon: LucideIcon; label: string; value: string; sub: string; className?: string }) {
  return (
    <div className={`card p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-100/80 text-brand-600"><Icon className="size-4" /></span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-extrabold tracking-tight text-ink-900 tabular-nums sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  )
}

function downloadCsv(rows: Ticket[]) {
  const head = ['Ticket', 'Created', 'Status', 'Priority', 'Category', 'Lab', 'Computer', 'Title', 'Reported by', 'Maintenance company', 'Resolved', 'Fix time (hours)', 'Fix by', 'On time', 'Parts replaced', 'Repair cost', 'Rating', 'Reopened'].map((h) => translate(h))
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((t) =>
    [
      ticketCode(t.id),
      t.createdAt?.toISOString() ?? '',
      translate(STATUS_LABEL[t.status]),
      translate(PRIORITY_LABEL[t.priority]),
      translate(CATEGORY_LABEL[t.category]),
      t.lab,
      translate(t.assetTag),
      t.title,
      t.reportedBy?.name,
      t.vendorName ?? '',
      t.resolvedAt?.toISOString() ?? '',
      fixHours(t)?.toFixed(1) ?? '',
      slaDue(t)?.toISOString() ?? '',
      onTime(t) === null ? '' : translate(onTime(t) ? 'Yes' : 'No'),
      t.repair?.parts ?? '',
      costOf(t) || '',
      t.rating?.stars ?? '',
      t.reopenCount ?? 0,
    ]
      .map(esc)
      .join(','),
  )
  const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `labfix-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function Reports() {
  const tr = useT()
  const { isAdmin, actor } = useAuth()
  const ticketsQ = useMemo(() => query(ticketsCol, orderBy('createdAt', 'desc')), [])
  const computersQ = useMemo(() => query(computersCol), [])
  const { data: allTickets, loading } = useLiveQuery<Ticket & { demo?: boolean }>(ticketsQ)
  const { data: computers } = useLiveQuery<Computer & { demo?: boolean }>(computersQ)

  const SERIES = useSeries()
  const [range, setRange] = useState<Range>('90')
  const [showTable, setShowTable] = useState(false)
  const [view3d, setView3dState] = useState(() => {
    try {
      return localStorage.getItem('labfix.trend3d') === '1'
    } catch {
      return false
    }
  })
  const setView3d = (v: boolean) => {
    setView3dState(v)
    try {
      localStorage.setItem('labfix.trend3d', v ? '1' : '0')
    } catch {
      /* remembered for this visit only */
    }
  }
  const [busy, setBusy] = useState<'seed' | 'clear' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const hasDemo = allTickets.some((t) => t.demo) || computers.some((c) => c.demo)

  const r = useMemo(() => {
    const now = new Date()
    const from = range === 'all' ? null : new Date(now.getTime() - Number(range) * DAY)
    const tickets = allTickets.filter((t) => t.createdAt && (!from || t.createdAt >= from))
    const done = tickets.filter(isDone)
    const fix = done.map(fixHours).filter((h): h is number => h !== null)

    // --- trend buckets: daily for 30 days, weekly otherwise
    const daily = range === '30'
    const first = from ?? (tickets.length ? new Date(Math.min(...tickets.map((t) => t.createdAt!.getTime()))) : now)
    const bucketStart = daily ? startOfDay : startOfWeek
    const step = daily ? DAY : 7 * DAY
    const buckets: Date[] = []
    for (let d = bucketStart(first); d <= now; d = new Date(d.getTime() + step)) buckets.push(d)
    if (buckets.length === 0) buckets.push(bucketStart(now))
    const idx = (d: Date) => Math.min(buckets.length - 1, Math.max(0, Math.floor((bucketStart(d).getTime() - buckets[0].getTime()) / step + 0.01)))
    const reported = buckets.map(() => 0)
    const resolved = buckets.map(() => 0)
    tickets.forEach((t) => reported[idx(t.createdAt!)]++)
    allTickets.forEach((t) => {
      if (isDone(t) && t.resolvedAt && (!from || t.resolvedAt >= from)) resolved[idx(t.resolvedAt)]++
    })
    const fmt = (d: Date) => d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' })
    const labels = buckets.map(fmt)
    const tooltipLabels = buckets.map((d) => (daily ? fmt(d) : translate('Week of {date}', { date: fmt(d) })))

    // --- breakdowns
    const count = <K extends string>(key: (t: Ticket) => K) => {
      const m = new Map<K, number>()
      tickets.forEach((t) => m.set(key(t), (m.get(key(t)) ?? 0) + 1))
      return [...m.entries()].sort((a, b) => b[1] - a[1])
    }
    const byCategory = count((t) => t.category).map(([k, v]) => ({ label: translate(CATEGORY_SHORT[k as IssueCategory]), value: v }))
    const byLab = count((t) => t.lab).map(([k, v]) => ({ label: k, value: v }))

    const priorities: Priority[] = ['critical', 'high', 'medium', 'low']
    const fixByPriority = priorities
      .map((p) => {
        const hs = done.filter((t) => t.priority === p).map(fixHours).filter((h): h is number => h !== null)
        return { label: translate(PRIORITY_LABEL[p]), value: avg(hs) ?? 0, sub: translate('{n} fixed', { n: hs.length }) }
      })
      .filter((x) => x.value > 0)

    // --- top problem PCs
    const pcMap = new Map<string, { assetTag: string; lab: string; count: number; last: Ticket }>()
    tickets.forEach((t) => {
      if (!t.computerId) return // lab-wide planned maintenance
      const e = pcMap.get(t.computerId)
      if (!e) pcMap.set(t.computerId, { assetTag: t.assetTag, lab: t.lab, count: 1, last: t })
      else {
        e.count++
        if ((t.createdAt?.getTime() ?? 0) > (e.last.createdAt?.getTime() ?? 0)) e.last = t
      }
    })
    const topPcs = [...pcMap.values()].filter((p) => p.count > 1).sort((a, b) => b.count - a.count).slice(0, 6)

    // --- maintenance company scorecards
    const vendors = companyScores(tickets)

    return {
      tickets,
      doneCount: done.length,
      cost: sum(tickets.map(costOf)),
      onTimePct: pct(done.map(onTime)),
      lateCount: done.filter((t) => onTime(t) === false).length,
      avgFix: avg(fix),
      calls: tickets.filter((t) => t.vendorId).length,
      labels,
      tooltipLabels,
      reported,
      resolved,
      byCategory,
      byLab,
      fixByPriority,
      topPcs,
      vendors,
    }
  }, [allTickets, range])

  const down = computers.filter((c) => c.status !== 'working').length

  async function onSeed() {
    if (!actor) return
    setBusy('seed')
    setMsg(null)
    try {
      const res = await seedDemoData(actor)
      setMsg(tr('Added {tickets} tickets, {computers} computers and {vendors} maintenance companies.', { tickets: res.tickets, computers: res.computers, vendors: res.vendors }))
    } catch (e) {
      setMsg(tr('Could not add demo data: {msg}', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(null)
    }
  }
  async function onClear() {
    if (!confirm(tr('Remove all demo data? Your real tickets, computers and companies are not touched.'))) return
    setBusy('clear')
    setMsg(null)
    try {
      const n = await clearDemoData()
      setMsg(tr('Removed {n} demo records.', { n }))
    } catch (e) {
      setMsg(tr('Could not remove demo data: {msg}', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(null)
    }
  }

  const resolutionRate = r.tickets.length ? Math.round((r.doneCount / r.tickets.length) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-600">{tr('Insights')}</p>
          <h1 className="page-title mt-1">{tr('Reports')}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && !hasDemo && (
            <button className="btn-secondary" disabled={busy !== null} onClick={onSeed}>
              <Sprout /> {busy === 'seed' ? tr('Adding demo data…') : tr('Load demo data')}
            </button>
          )}
          {isAdmin && hasDemo && (
            <button className="btn-secondary" disabled={busy !== null} onClick={onClear}>
              <Trash /> {busy === 'clear' ? tr('Removing…') : tr('Remove demo data')}
            </button>
          )}
          <Link to="/reports/monthly" className="btn-secondary">
            <FileText /> {tr('Monthly report (PDF / Excel)')}
          </Link>
          <button className="btn-primary" disabled={r.tickets.length === 0} onClick={() => downloadCsv(r.tickets)}>
            <FileDown /> {tr('Export CSV')}
          </button>
        </div>
      </div>

      {msg && <p className="glass rounded-2xl p-3 text-sm text-slate-700">{msg}</p>}

      {/* Filter row */}
      <div className="glass inline-flex rounded-2xl p-1">
        {RANGES.map((x) => (
          <button
            key={x.id}
            onClick={() => setRange(x.id)}
            className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold transition ${
              range === x.id ? 'bg-brand-600 text-on shadow-md shadow-brand-600/30' : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            {tr(x.label)}
          </button>
        ))}
      </div>

      {!loading && allTickets.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-14 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-brand-100/80 text-brand-600"><Database className="size-6" /></div>
          <div className="font-semibold text-slate-800">{tr('No tickets yet')}</div>
          <p className="max-w-sm text-sm text-slate-500">
            Reports fill in as faults are reported.{' '}
            {isAdmin ? tr('Click “Load demo data” to see how they look with sample data.') : tr('Ask an admin to load demo data to preview them.')}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Tile icon={TrendingUp} label={tr('Tickets reported')} value={String(r.tickets.length)} sub={tr(RANGE_SUB[range])} />
            <Tile icon={Trophy} label={tr('Resolution rate')} value={`${resolutionRate}%`} sub={tr('{n} resolved or closed', { n: r.doneCount })} />
            <Tile icon={Hourglass} label={tr('Avg. time to fix')} value={fmtDuration(r.avgFix)} sub={tr('from report to resolved')} />
            <Tile
              icon={AlarmClockCheck}
              label={tr('Fixed on time')}
              value={r.onTimePct === null ? '—' : `${r.onTimePct}%`}
              sub={tr('{n} fixed after the deadline', { n: r.lateCount })}
            />
            <Tile icon={PhoneCall} label={tr('Vendor call-outs')} value={String(r.calls)} sub={tr('{n} PCs out of service now', { n: down })} />
            <Tile icon={FileSpreadsheet} label={tr('Repair cost')} value={fmtMoney(r.cost)} sub={tr('parts & labour recorded')} />
          </div>

          <Panel
            title={tr('Reported vs resolved')}
            subtitle={range === '30' ? tr('Tickets per day') : tr('Tickets per week')}
            action={
              <div className="flex flex-wrap items-center gap-3">
                <Legend names={[tr('Reported'), tr('Resolved')]} square={view3d} />
                <div className="glass inline-flex rounded-xl p-0.5" role="group" aria-label={tr('Chart view')}>
                  {([false, true] as const).map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setView3d(v)}
                      aria-pressed={view3d === v}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${view3d === v ? 'bg-brand-600 text-on shadow-sm shadow-brand-600/30' : 'text-slate-600 hover:bg-white/70'}`}
                    >
                      {v ? '3D' : '2D'}
                    </button>
                  ))}
                </div>
              </div>
            }
          >
            {view3d ? (
              <Chart3D
                labels={r.labels}
                tooltipLabels={r.tooltipLabels}
                series={[
                  { name: tr('Reported'), values: r.reported },
                  { name: tr('Resolved'), values: r.resolved },
                ]}
              />
            ) : (
              <LineChart
                labels={r.labels}
                tooltipLabels={r.tooltipLabels}
                series={[
                  { name: tr('Reported'), values: r.reported },
                  { name: tr('Resolved'), values: r.resolved },
                ]}
              />
            )}
            <button className="mt-3 text-xs font-semibold text-brand-600 hover:underline" onClick={() => setShowTable((v) => !v)}>
              {showTable ? tr('Hide data table') : tr('View as table')}
            </button>
            {showTable && (
              <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-white/70">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white/90 text-left text-slate-500 backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{tr('Period')}</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        <span className="mr-1.5 inline-block h-0.5 w-3 align-middle" style={{ background: SERIES[0] }} />{tr('Reported')}
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">
                        <span className="mr-1.5 inline-block h-0.5 w-3 align-middle" style={{ background: SERIES[1] }} />{tr('Resolved')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-900/[0.06] text-slate-700 tabular-nums">
                    {r.labels.map((l, i) => (
                      <tr key={l + i}>
                        <td className="px-3 py-1.5">{l}</td>
                        <td className="px-3 py-1.5 text-right">{r.reported[i]}</td>
                        <td className="px-3 py-1.5 text-right">{r.resolved[i]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={tr('Problems by type')} subtitle={tr('Number of tickets')}>
              <BarList items={r.byCategory} />
            </Panel>
            <Panel title={tr('Tickets by lab')} subtitle={tr('Where faults happen most')}>
              <BarList items={r.byLab} />
            </Panel>
            <Panel title={tr('Average time to fix')} subtitle={tr('By priority, report → resolved')}>
              <BarList items={r.fixByPriority} format={(v) => fmtDuration(v)} empty={tr('No resolved tickets in this period.')} />
            </Panel>
            <Panel title={tr('Repeat-problem computers')} subtitle={tr('PCs with more than one ticket')}>
              {r.topPcs.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">{tr('No repeat problems in this period.')}</p>
              ) : (
                <ul className="divide-y divide-brand-900/[0.06]">
                  {r.topPcs.map((p) => (
                    <li key={p.assetTag} className="flex items-center gap-3 py-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-100/80 text-rose-600"><Monitor className="size-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900">{p.assetTag} <span className="font-normal text-slate-500">· {p.lab}</span></div>
                        <Link to={`/tickets/${p.last.id}`} className="block truncate text-xs text-slate-500 hover:text-brand-600">
                          Last: {p.last.title}
                        </Link>
                      </div>
                      <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-white">{tr('{n} tickets', { n: p.count })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title={tr('Maintenance company performance')} subtitle={tr('Tickets handed to each company in this period')}>
            {r.vendors.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">{tr('No vendor call-outs in this period.')}</p>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-2 py-2 font-semibold">{tr('Company')}</th>
                      <th className="px-2 py-2 text-right font-semibold">{tr('Tickets')}</th>
                      <th className="px-2 py-2 text-right font-semibold">{tr('Resolved')}</th>
                      <th className="px-2 py-2 text-right font-semibold">{tr('Avg. time to fix')}</th>
                      <th className="px-2 py-2 text-right font-semibold">{tr('On time')}</th>
                      <th className="px-2 py-2 text-right font-semibold">{tr('Rating')}</th>
                      <th className="px-2 py-2 text-right font-semibold">{tr('Reopened')}</th>
                      <th className="px-2 py-2 text-right font-semibold">{tr('Repair cost')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-900/[0.06] tabular-nums">
                    {r.vendors.map((v) => (
                      <tr key={v.vendorId}>
                        <td className="px-2 py-3 font-semibold text-slate-900">{v.name}</td>
                        <td className="px-2 py-3 text-right text-slate-700">{v.jobs}</td>
                        <td className="px-2 py-3 text-right text-slate-700">
                          {v.done} <span className="text-xs text-slate-400">({Math.round((v.done / v.jobs) * 100)}%)</span>
                        </td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-900">{fmtDuration(v.avgFix)}</td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-900">{v.onTimePct === null ? '—' : `${v.onTimePct}%`}</td>
                        <td className="px-2 py-3 text-right whitespace-nowrap text-slate-700">
                          {v.rating === null ? '—' : <><Stars value={v.rating} size="size-3.5" /> <span className="ml-1 font-semibold text-slate-900">{v.rating.toFixed(1)}</span></>}
                        </td>
                        <td className="px-2 py-3 text-right text-slate-700">{v.reopened}</td>
                        <td className="px-2 py-3 text-right text-slate-700">{fmtMoney(v.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}
