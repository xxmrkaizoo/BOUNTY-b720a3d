import { History, Monitor, Siren } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { COMPUTER_STATUS_LABEL } from '../lib/constants.ts'
import { useT } from '../lib/settings.tsx'
import type { Computer, ComputerStatus, Ticket } from '../types.ts'
import { ComputerStatusBadge } from './Badge.tsx'
import Modal from './Modal.tsx'

/** First two numbers in the location, e.g. "Row 2, seat 5" → row 2, seat 5. */
export function parseSeat(location: string): { row: number; seat: number } | null {
  const n = location.match(/\d+/g)
  return n && n.length >= 2 ? { row: Number(n[0]), seat: Number(n[1]) } : null
}

const SEAT_TONE: Record<ComputerStatus, string> = {
  working: 'bg-emerald-500 text-[#fff] shadow-emerald-500/30 hover:bg-emerald-600',
  faulty: 'bg-rose-600 text-[#fff] shadow-rose-600/40 hover:bg-rose-700 ring-4 ring-rose-300/60',
  under_repair: 'bg-violet-600 text-[#fff] shadow-violet-600/30 hover:bg-violet-700',
}

/** Short seat label: the number at the end of the asset tag (LAB1-PC05 → 05). */
const shortTag = (tag: string) => tag.match(/(\d+)\D*$/)?.[1] ?? tag.slice(-3)

/**
 * Seating plan of one lab: each PC sits at its row / seat (taken from the
 * location, e.g. "Row 2, seat 5"), coloured by status. Click a seat for details.
 */
export default function LabMap({ lab, computers, openTicketOf }: { lab: string; computers: Computer[]; openTicketOf: (pcId: string) => Ticket | undefined }) {
  const t = useT()
  const [picked, setPicked] = useState<Computer | null>(null)
  const placed = computers.map((c) => ({ c, pos: parseSeat(c.location) })).filter((x): x is { c: Computer; pos: { row: number; seat: number } } => !!x.pos)
  const unplaced = computers.filter((c) => !parseSeat(c.location))
  const rows = placed.length ? Math.max(...placed.map((p) => p.pos.row)) : 0
  const cols = placed.length ? Math.max(...placed.map((p) => p.pos.seat)) : 0
  const at = new Map(placed.map((p) => [`${p.pos.row}:${p.pos.seat}`, p.c]))
  const openTicket = picked ? openTicketOf(picked.id) : undefined

  const Seat = ({ c }: { c: Computer }) => (
    <button
      onClick={() => setPicked(c)}
      title={`${c.assetTag} · ${t(COMPUTER_STATUS_LABEL[c.status])}`}
      aria-label={`${c.assetTag}, ${t(COMPUTER_STATUS_LABEL[c.status])}`}
      className={`flex aspect-[4/3] min-w-0 flex-col items-center justify-center rounded-xl text-[11px] font-bold shadow-md transition hover:scale-105 ${SEAT_TONE[c.status]}`}
    >
      <Monitor className="size-3.5 opacity-90 sm:size-4" />
      <span className="mt-0.5 leading-none">{shortTag(c.assetTag)}</span>
    </button>
  )

  return (
    <div className="card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">
        {(['working', 'faulty', 'under_repair'] as ComputerStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`size-3 rounded ${SEAT_TONE[s].split(' ')[0]}`} /> {t(COMPUTER_STATUS_LABEL[s])}
            <span className="text-slate-400">({computers.filter((c) => c.status === s).length})</span>
          </span>
        ))}
      </div>

      {placed.length > 0 && (
        <div className="overflow-x-auto pb-1">
          <div className="min-w-fit">
            <div className="mx-auto mb-4 w-full max-w-md rounded-lg bg-ink-900 py-1.5 text-center text-[11px] font-semibold tracking-widest text-on uppercase">
              {t('Front of the lab')}
            </div>
            <div className="grid justify-center gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `1.5rem repeat(${cols}, minmax(2.4rem, 5.5rem))` }}>
              {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="contents">
                  <span className="grid place-items-center text-[11px] font-semibold text-slate-400">{t('R{n}', { n: r + 1 })}</span>
                  {Array.from({ length: cols }, (_, s) => {
                    const c = at.get(`${r + 1}:${s + 1}`)
                    return c ? <Seat key={s} c={c} /> : <span key={s} className="aspect-[4/3] rounded-xl border border-dashed border-slate-200" />
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {unplaced.length > 0 && (
        <div className={placed.length ? 'mt-6 border-t border-brand-900/[0.06] pt-4' : ''}>
          <p className="mb-2 text-xs text-slate-500">
            {t('No seat set. Edit the PC and set its location like “Row 2, seat 5” to place it on the map.')}
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(2.4rem,5.5rem))] gap-1.5 sm:gap-2">
            {unplaced.map((c) => <Seat key={c.id} c={c} />)}
          </div>
        </div>
      )}

      <Modal open={!!picked} title={picked?.assetTag ?? ''} subtitle={`${lab}${picked?.location ? ` · ${picked.location}` : ''}`} onClose={() => setPicked(null)}>
        {picked && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <ComputerStatusBadge status={picked.status} />
              {picked.specs && <span>{picked.specs}</span>}
            </div>
            {openTicket && (
              <Link to={`/tickets/${openTicket.id}`} className="block rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
                <span className="font-semibold">{t('Open ticket')}:</span> {openTicket.title} →
              </Link>
            )}
            <div className="flex flex-wrap gap-2">
              <Link to={`/tickets/new?computer=${picked.id}`} className="btn-primary"><Siren /> {t('Report fault')}</Link>
              <Link to={`/computers/${picked.id}`} className="btn-secondary"><History /> {t('Repair history')}</Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
