import { orderBy, query } from 'firebase/firestore'
import { ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, Printer, Wrench } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { CATEGORY_SHORT, PRIORITY_LABEL, STATUS_LABEL } from '../lib/constants.ts'
import { formatDateTime, ticketCode } from '../lib/format.ts'
import { getLocale, useT } from '../lib/settings.tsx'
import { slaOf } from '../lib/sla.ts'
import { avg, companyScores, costOf, CURRENCY, fixHours, fmtDuration, fmtMoney, isDone, onTime, pct, pcHealth, sum } from '../lib/stats.ts'
import { ticketsCol } from '../services/tickets.ts'
import type { Ticket } from '../types.ts'

/** "2026-11" ⇄ month start. */
function parseMonth(m: string | null): Date {
  const [y, mo] = (m ?? '').split('-').map(Number)
  const now = new Date()
  return y && mo ? new Date(y, mo - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1)
}
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/* Document colours are fixed (not themed) so the PDF always prints black on white. */
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#dbe4f0] bg-[#f6f9fd] p-3">
      <div className="text-[11px] font-semibold text-[#5b6b82] uppercase">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-[#0b1b33] tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-[#5b6b82]">{sub}</div>}
    </div>
  )
}

function Table({ head, rows, right = [] }: { head: string[]; rows: ReactNode[][]; right?: number[] }) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="bg-[#eef3fa] text-left text-[#33455f]">
          {head.map((h, i) => <th key={h} className={`border-b border-[#dbe4f0] px-2 py-1.5 font-semibold ${right.includes(i) ? 'text-right' : ''}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody className="text-[#0b1b33]">
        {rows.map((r, ri) => (
          <tr key={ri} className="break-inside-avoid">
            {r.map((c, ci) => <td key={ci} className={`border-b border-[#edf1f7] px-2 py-1.5 align-top ${right.includes(ci) ? 'text-right whitespace-nowrap tabular-nums' : ''}`}>{c}</td>)}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={head.length} className="px-2 py-3 text-center text-[#8796ab]">—</td></tr>
        )}
      </tbody>
    </table>
  )
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-7 mb-2 break-after-avoid text-[14px] font-bold text-[#0b1b33]">{children}</h2>
}

/** Monthly maintenance report: print it to PDF, or download it as Excel. */
export default function MonthlyReport() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const start = parseMonth(params.get('m'))
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
  const q = useMemo(() => query(ticketsCol, orderBy('createdAt', 'desc')), [])
  const { data: all, loading } = useLiveQuery<Ticket>(q)
  const [xlsxBusy, setXlsxBusy] = useState(false)

  const monthName = start.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })
  const go = (delta: number) => setParams({ m: monthKey(new Date(start.getFullYear(), start.getMonth() + delta, 1)) }, { replace: true })
  const isFuture = end > new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)

  const r = useMemo(() => {
    const inMonth = (d: Date | null) => !!d && d >= start && d < end
    const tickets = all.filter((tk) => inMonth(tk.createdAt)).sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
    const resolved = all.filter((tk) => isDone(tk) && inMonth(tk.resolvedAt))
    const count = (key: (tk: Ticket) => string) => {
      const m = new Map<string, Ticket[]>()
      tickets.forEach((tk) => m.set(key(tk), [...(m.get(key(tk)) ?? []), tk]))
      return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
    }
    const stars = resolved.map((tk) => tk.rating?.stars).filter((x): x is number => typeof x === 'number')
    const pcs = new Map<string, Ticket[]>()
    all.forEach((tk) => tk.computerId && pcs.set(tk.computerId, [...(pcs.get(tk.computerId) ?? []), tk]))
    const replace = [...pcs.values()]
      .map((list) => ({ tk: list[0], h: pcHealth(list) }))
      .filter((x) => x.h.replace && x.tk.lab)
      .sort((a, b) => b.h.faults6m - a.h.faults6m)
    return {
      tickets,
      resolved,
      stillOpen: tickets.filter((tk) => !isDone(tk)).length,
      avgFix: avg(resolved.map(fixHours).filter((h): h is number => h !== null)),
      onTimePct: pct(resolved.map(onTime)),
      cost: sum(resolved.map(costOf)),
      rating: avg(stars),
      ratings: stars.length,
      byType: count((tk) => tk.category),
      byLab: count((tk) => tk.lab),
      companies: companyScores([...new Map([...tickets, ...resolved].map((tk) => [tk.id, tk])).values()]),
      replace,
    }
    // start/end are derived from the month in the URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, start.getTime()])

  async function exportExcel() {
    setXlsxBusy(true)
    try {
      const { downloadXlsx } = await import('../lib/xlsx.ts')
      const yesNo = (b: boolean | null) => (b === null ? '' : t(b ? 'Yes' : 'No'))
      downloadXlsx(
        [
          {
            name: t('Summary'),
            rows: [
              [t('Monthly maintenance report'), monthName],
              [t('Tickets reported'), r.tickets.length],
              [t('Tickets fixed'), r.resolved.length],
              [t('Still open'), r.stillOpen],
              [t('Avg. time to fix (hours)'), r.avgFix === null ? '' : Number(r.avgFix.toFixed(1))],
              [t('Fixed on time'), r.onTimePct === null ? '' : `${r.onTimePct}%`],
              [`${t('Repair cost')} (${CURRENCY})`, r.cost],
              [t('Average rating'), r.rating === null ? '' : Number(r.rating.toFixed(2))],
              [t('Generated'), formatDateTime(new Date())],
            ],
          },
          {
            name: t('Tickets'),
            rows: [
              [t('Ticket'), t('Reported at'), t('Lab'), t('Computer'), t('Problem type'), t('Title'), t('Priority'), t('Status'), t('Maintenance company'), t('Fix time (hours)'), t('On time'), t('Parts replaced'), `${t('Repair cost')} (${CURRENCY})`, t('Rating')],
              ...r.tickets.map((tk) => [
                ticketCode(tk.id),
                formatDateTime(tk.createdAt),
                tk.lab,
                t(tk.assetTag),
                t(CATEGORY_SHORT[tk.category]),
                tk.title,
                t(PRIORITY_LABEL[tk.priority]),
                t(STATUS_LABEL[tk.status]),
                tk.vendorName ?? '',
                fixHours(tk) === null ? '' : Number(fixHours(tk)!.toFixed(1)),
                yesNo(onTime(tk)),
                tk.repair?.parts ?? '',
                costOf(tk) || '',
                tk.rating?.stars ?? '',
              ]),
            ],
          },
          {
            name: t('Companies'),
            rows: [
              [t('Company'), t('Jobs'), t('Resolved'), t('Avg. time to fix (hours)'), t('On time'), t('Rating'), t('Reopened'), `${t('Repair cost')} (${CURRENCY})`],
              ...r.companies.map((c) => [c.name, c.jobs, c.done, c.avgFix === null ? '' : Number(c.avgFix.toFixed(1)), c.onTimePct === null ? '' : `${c.onTimePct}%`, c.rating === null ? '' : Number(c.rating.toFixed(2)), c.reopened, c.cost]),
            ],
          },
          {
            name: t('By lab'),
            rows: [[t('Lab'), t('Tickets'), `${t('Repair cost')} (${CURRENCY})`], ...r.byLab.map(([lab, list]) => [lab, list.length, sum(list.map(costOf))])],
          },
          {
            name: t('By problem type'),
            rows: [[t('Problem type'), t('Tickets')], ...r.byType.map(([k, list]) => [t(CATEGORY_SHORT[k as keyof typeof CATEGORY_SHORT]), list.length])],
          },
        ],
        `labfix-monthly-${monthKey(start)}.xlsx`,
      )
    } finally {
      setXlsxBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4 print:hidden">
        <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
          <ArrowLeft className="size-4" /> {t('Reports')}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="glass inline-flex items-center gap-1 rounded-2xl p-1">
            <button className="rounded-xl p-2 text-slate-600 hover:bg-white/70" onClick={() => go(-1)} aria-label={t('Previous month')}><ChevronLeft className="size-5" /></button>
            <span className="min-w-40 text-center font-bold text-slate-900">{monthName}</span>
            <button className="rounded-xl p-2 text-slate-600 hover:bg-white/70 disabled:opacity-30" disabled={isFuture} onClick={() => go(1)} aria-label={t('Next month')}><ChevronRight className="size-5" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" disabled={loading || xlsxBusy} onClick={exportExcel}><FileSpreadsheet /> {xlsxBusy ? t('Preparing…') : t('Download Excel')}</button>
            <button className="btn-primary" disabled={loading} onClick={() => window.print()}><Printer /> {t('Print / Save as PDF')}</button>
          </div>
        </div>
        <p className="text-xs text-slate-500">{t('To get a PDF: click “Print / Save as PDF”, then choose “Save as PDF” as the printer.')}</p>
      </div>

      {/* The "paper" */}
      <article className="mx-auto max-w-[210mm] rounded-2xl bg-[#fff] p-6 text-[#0b1b33] shadow-lift ring-1 ring-[#dbe4f0] sm:p-10 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#1d5fed] pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-[#1d5fed] text-[#fff]"><Wrench className="size-5" /></span>
            <div>
              <div className="text-lg leading-none font-extrabold">Lab<span className="text-[#1d5fed]">Fix</span></div>
              <div className="text-[10px] font-semibold tracking-[0.2em] text-[#5b6b82] uppercase">{t('Maintenance')}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold tracking-wider text-[#5b6b82] uppercase">{t('Monthly maintenance report')}</div>
            <div className="text-xl font-extrabold">{monthName}</div>
            <div className="text-[11px] text-[#5b6b82]">{t('Generated')} {formatDateTime(new Date())}</div>
          </div>
        </header>

        {loading ? (
          <p className="py-10 text-center text-sm text-[#5b6b82]">{t('Loading…')}</p>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label={t('Tickets reported')} value={String(r.tickets.length)} sub={t('{n} still open', { n: r.stillOpen })} />
              <Kpi label={t('Tickets fixed')} value={String(r.resolved.length)} sub={t('Avg. {d}', { d: fmtDuration(r.avgFix) })} />
              <Kpi label={t('Fixed on time')} value={r.onTimePct === null ? '—' : `${r.onTimePct}%`} />
              <Kpi label={t('Repair cost')} value={fmtMoney(r.cost)} sub={r.rating === null ? undefined : t('Rating {r} / 5 ({n})', { r: r.rating.toFixed(1), n: r.ratings })} />
            </div>

            <div className="grid gap-x-6 sm:grid-cols-2">
              <div>
                <H2>{t('Problems by type')}</H2>
                <Table head={[t('Problem type'), t('Tickets')]} right={[1]} rows={r.byType.map(([k, list]) => [t(CATEGORY_SHORT[k as keyof typeof CATEGORY_SHORT]), list.length])} />
              </div>
              <div>
                <H2>{t('Tickets by lab')}</H2>
                <Table head={[t('Lab'), t('Tickets'), t('Repair cost')]} right={[1, 2]} rows={r.byLab.map(([lab, list]) => [lab, list.length, fmtMoney(sum(list.map(costOf)))])} />
              </div>
            </div>

            <H2>{t('Maintenance company performance')}</H2>
            <Table
              head={[t('Company'), t('Jobs'), t('Resolved'), t('Avg. time to fix'), t('On time'), t('Rating'), t('Reopened'), t('Repair cost')]}
              right={[1, 2, 3, 4, 5, 6, 7]}
              rows={r.companies.map((c) => [
                c.name,
                c.jobs,
                c.done,
                fmtDuration(c.avgFix),
                c.onTimePct === null ? '—' : `${c.onTimePct}%`,
                c.rating === null ? '—' : `${c.rating.toFixed(1)} ★`,
                c.reopened,
                fmtMoney(c.cost),
              ])}
            />

            {r.replace.length > 0 && (
              <>
                <H2>{t('PCs worth replacing')}</H2>
                <Table
                  head={[t('Computer'), t('Lab'), t('Faults (last 6 months)'), t('Total repair cost')]}
                  right={[2, 3]}
                  rows={r.replace.map(({ tk, h }) => [tk.assetTag, tk.lab, h.faults6m, fmtMoney(h.cost)])}
                />
              </>
            )}

            <H2>{t('All tickets this month')}</H2>
            <Table
              head={[t('Ticket'), t('Reported at'), t('Computer'), t('Title'), t('Priority'), t('Status'), t('Fix time'), t('Cost')]}
              right={[6, 7]}
              rows={r.tickets.map((tk) => {
                const s = slaOf(tk)
                return [
                  <span key="code" className="font-mono whitespace-nowrap">{ticketCode(tk.id)}</span>,
                  formatDateTime(tk.createdAt),
                  <div key="pc">{t(tk.assetTag)}<div className="text-[10px] text-[#5b6b82]">{tk.lab}</div></div>,
                  tk.title,
                  t(PRIORITY_LABEL[tk.priority]),
                  <div key="st">{t(STATUS_LABEL[tk.status])}{s?.state === 'missed' || s?.state === 'overdue' ? <div className="text-[10px] font-semibold text-[#c2410c]">{t('Late')}</div> : null}</div>,
                  fmtDuration(fixHours(tk)),
                  costOf(tk) ? fmtMoney(costOf(tk)) : '—',
                ]
              })}
            />
            <p className="mt-6 text-center text-[10px] text-[#8796ab]">LabFix · {t('Fix deadlines: critical 4 h, high 24 h, medium 3 days, low 7 days.')}</p>
          </>
        )}
      </article>
    </div>
  )
}
