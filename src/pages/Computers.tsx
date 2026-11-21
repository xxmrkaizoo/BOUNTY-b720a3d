import { Copy, Download, LayoutGrid, ListPlus, Map as MapIcon, Monitor, Plus, Printer, QrCode as QrIcon, Recycle } from 'lucide-react'
import { orderBy, query } from 'firebase/firestore'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ComputerStatusBadge } from '../components/Badge.tsx'
import LabMap from '../components/LabMap.tsx'
import Modal from '../components/Modal.tsx'
import QrCode, { downloadQrPng } from '../components/QrCode.tsx'
import { reportUrl } from '../lib/qr.ts'
import { useAuth } from '../hooks/useAuth.tsx'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { ACTIVE_STATUSES, COMPUTER_STATUS_LABEL } from '../lib/constants.ts'
import { pcHealth, type PcHealth } from '../lib/stats.ts'
import { ticketsCol } from '../services/tickets.ts'
import { computersCol, deleteComputer, saveComputer, type ComputerInput } from '../services/admin.ts'
import type { Computer, ComputerStatus, Ticket } from '../types.ts'
import { useT } from '../lib/settings.tsx'
import { Loader } from '../components/Loading.tsx'

type View = 'grid' | 'map'
const VIEW_KEY = 'labfix.computersView'
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'grid'
  } catch {
    return 'grid'
  }
}

const EMPTY: ComputerInput = { assetTag: '', lab: '', location: '', specs: '', status: 'working' }

export default function Computers() {
  const t = useT()
  const { isAdmin } = useAuth()
  const q = useMemo(() => query(computersCol, orderBy('lab'), orderBy('assetTag')), [])
  const { data: computers, loading, error } = useLiveQuery<Computer>(q)

  const [editing, setEditing] = useState<{ id?: string; form: ComputerInput } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [qrFor, setQrFor] = useState<Computer | null>(null)
  const [view, setViewState] = useState<View>(readView)
  const setView = (v: View) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* remembered for this visit only */
    }
  }
  const ticketsQ = useMemo(() => query(ticketsCol), [])
  const { data: tickets } = useLiveQuery<Ticket>(ticketsQ)
  const byPc = useMemo(() => {
    const m = new Map<string, Ticket[]>()
    for (const tk of tickets) if (tk.computerId) m.set(tk.computerId, [...(m.get(tk.computerId) ?? []), tk])
    return m
  }, [tickets])
  const health = useMemo(() => {
    const m = new Map<string, PcHealth>()
    for (const [id, list] of byPc) m.set(id, pcHealth(list))
    return m
  }, [byPc])
  const openTicketOf = (pcId: string) => byPc.get(pcId)?.find((tk) => ACTIVE_STATUSES.includes(tk.status))
  const toReplace = [...health.values()].filter((h) => h.replace).length
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const byLab = useMemo(() => {
    const map = new Map<string, Computer[]>()
    for (const c of computers) map.set(c.lab, [...(map.get(c.lab) ?? []), c])
    return [...map.entries()]
  }, [computers])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    setFormError(null)
    try {
      await saveComputer(editing.form, editing.id)
      setEditing(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('Save failed'))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(c: Computer) {
    if (!confirm(t('Delete {pc}? Existing tickets are kept.', { pc: c.assetTag }))) return
    await deleteComputer(c.id)
  }

  const set = (patch: Partial<ComputerInput>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{t('Lab Computers')}</h1>
          <p className="text-sm text-slate-500">
            {t('{n} PCs · {m} out of service', { n: computers.length, m: computers.filter((c) => c.status !== 'working').length })}
            {toReplace > 0 && <span className="font-semibold text-orange-600"> · {t('{n} worth replacing', { n: toReplace })}</span>}
          </p>
        </div>
        <div className="glass inline-flex rounded-xl p-1">
          {([['grid', LayoutGrid, t('Cards')], ['map', MapIcon, t('Lab map')]] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${view === v ? 'bg-brand-600 text-on shadow-md shadow-brand-600/30' : 'text-slate-600 hover:bg-white/70'}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link to="/computers/qr" className="btn-secondary"><QrIcon /> {t('QR stickers')}</Link>
            <button className="btn-secondary" onClick={() => setBulkOpen(true)}><ListPlus /> {t('Bulk add')}</button>
            <button className="btn-primary" onClick={() => setEditing({ form: { ...EMPTY } })}><Plus /> {t('Add computer')}</button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">Error: {error.message}</p>}
      {loading && <Loader />}
      {!loading && computers.length === 0 && (
        <div className="card flex flex-col items-center gap-3 p-14 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Monitor className="size-6" /></div>
          <div className="font-semibold text-slate-800">{t('No computers yet')}</div>
          <p className="text-sm text-slate-500">{isAdmin ? t('Use “Bulk add” to register a whole lab at once.') : t('Ask a lab admin to register the lab computers.')}</p>
        </div>
      )}

      {byLab.map(([lab, list]) => (
        <section key={lab} className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">{lab}</h2>
            <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{t('{n} PCs', { n: list.length })}</span>
            {list.some((c) => c.status !== 'working') && (
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600 ring-1 ring-rose-200">
                {t('{n} down', { n: list.filter((c) => c.status !== 'working').length })}
              </span>
            )}
            {isAdmin && (
              <Link to={`/computers/qr?lab=${encodeURIComponent(lab)}`} className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline">
                <Printer className="size-3.5" /> {t('Print QR stickers')}
              </Link>
            )}
          </div>
          {view === 'map' ? (
            <LabMap lab={lab} computers={list} openTicketOf={openTicketOf} />
          ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((c) => (
              <div key={c.id} className="card flex flex-col gap-2 p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-start gap-2.5">
                  <span className="flex min-w-0 flex-1 items-center gap-2.5 font-semibold text-slate-900">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${c.status === 'working' ? 'bg-brand-50 text-brand-600' : c.status === 'faulty' ? 'bg-rose-50 text-rose-600' : 'bg-violet-50 text-violet-600'}`}>
                      <Monitor className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{c.assetTag}</span>
                      <span className="mt-1 block"><ComputerStatusBadge status={c.status} /></span>
                    </span>
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {c.location || t('No location')}{c.specs && <> · {c.specs}</>}
                </div>
                {(health.get(c.id)?.faults ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-slate-600 ring-1 ring-white">{t('{n} faults', { n: health.get(c.id)!.faults })}</span>
                    {health.get(c.id)!.replace && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-orange-700 ring-1 ring-orange-200">
                        <Recycle className="size-3" /> {t('Consider replacing')}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 border-t border-brand-900/[0.06] pt-3 text-xs font-semibold">
                  <Link to={`/tickets/new?computer=${c.id}`} className="text-rose-600 hover:underline">{t('Report fault')}</Link>
                  <Link to={`/computers/${c.id}`} className="text-slate-600 hover:underline">{t('History')}</Link>
                  <button className="inline-flex items-center gap-1 text-brand-600 hover:underline" onClick={() => setQrFor(c)}>
                    <QrIcon className="size-3.5" /> {t('QR')}
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        className="text-slate-600 hover:underline"
                        onClick={() => {
                          const { id, updatedAt: _u, ...form } = c
                          setEditing({ id, form })
                        }}
                      >
                        {t('Edit')}
                      </button>
                      <button className="text-slate-400 hover:text-rose-600 hover:underline" onClick={() => onDelete(c)}>{t('Delete')}</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}
        </section>
      ))}

      <Modal open={!!editing} title={editing?.id ? t('Edit computer') : t('Add computer')} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={onSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="tag">{t('Asset tag / PC name')}</label>
                <input id="tag" className="input" required placeholder={t('LAB1-PC05')} value={editing.form.assetTag} onChange={(e) => set({ assetTag: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="labname">{t('Lab')}</label>
                <input id="labname" className="input" required list="labs" placeholder={t('Computer Lab 1')} value={editing.form.lab} onChange={(e) => set({ lab: e.target.value })} />
                <datalist id="labs">{byLab.map(([l]) => <option key={l} value={l} />)}</datalist>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="loc">{t('Location (seat / row)')}</label>
              <input id="loc" className="input" placeholder={t('Row 2, seat 5')} value={editing.form.location} onChange={(e) => set({ location: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="specs">{t('Specs / notes')}</label>
              <input id="specs" className="input" placeholder={t('i5, 8GB RAM, Win 11')} value={editing.form.specs} onChange={(e) => set({ specs: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="st">{t('Status')}</label>
              <select id="st" className="input" value={editing.form.status} onChange={(e) => set({ status: e.target.value as ComputerStatus })}>
                {Object.entries(COMPUTER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {formError && <p className="text-sm text-rose-600">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{t('Cancel')}</button>
              <button className="btn-primary" disabled={busy}>{busy ? t('Saving…') : t('Save')}</button>
            </div>
          </form>
        )}
      </Modal>

      <BulkAdd open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <QrDialog computer={qrFor} onClose={() => setQrFor(null)} />
    </div>
  )
}

/** One PC's QR code: show, copy the link, or download as PNG. */
function QrDialog({ computer, onClose }: { computer: Computer | null; onClose: () => void }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const url = computer ? reportUrl(computer.id) : ''
  return (
    <Modal open={!!computer} title={t('QR code for {pc}', { pc: computer?.assetTag ?? '' })} subtitle={t('Scan to report a problem with this PC')} onClose={onClose}>
      {computer && (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-[#fff] p-3 shadow-sm ring-1 ring-slate-200">
            <QrCode value={url} className="w-56" label={t('QR code for {pc}', { pc: computer.assetTag })} />
          </div>
          <code className="max-w-full truncate rounded-lg bg-white/70 px-3 py-1.5 text-xs text-slate-600 ring-1 ring-white">{url}</code>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              className="btn-secondary"
              onClick={async () => {
                await navigator.clipboard?.writeText(url).catch(() => {})
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              <Copy /> {copied ? t('Copied!') : t('Copy link')}
            </button>
            <button className="btn-primary" onClick={() => downloadQrPng(url, `labfix-qr-${computer.assetTag}.png`)}>
              <Download /> {t('Download PNG')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Quickly register a whole lab: "Lab 1", prefix "LAB1-PC", 1..30 */
function BulkAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const [lab, setLab] = useState('')
  const [prefix, setPrefix] = useState('PC-')
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(20)
  const [busy, setBusy] = useState(false)

  const count = Math.max(0, Math.min(200, to - from + 1))
  const pad = String(to).length < 2 ? 2 : String(to).length

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const jobs = Array.from({ length: count }, (_, i) =>
        saveComputer({ assetTag: `${prefix}${String(from + i).padStart(pad, '0')}`, lab, location: '', specs: '', status: 'working' }),
      )
      await Promise.all(jobs)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={t('Bulk add computers')} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="blab">{t('Lab name')}</label>
          <input id="blab" className="input" required placeholder={t('Computer Lab 1')} value={lab} onChange={(e) => setLab(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="bprefix">{t('Prefix')}</label>
            <input id="bprefix" className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="bfrom">{t('From')}</label>
            <input id="bfrom" type="number" min={1} className="input" value={from} onChange={(e) => setFrom(Number(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="bto">{t('To')}</label>
            <input id="bto" type="number" min={from} className="input" value={to} onChange={(e) => setTo(Number(e.target.value))} />
          </div>
        </div>
        <p className="text-sm text-slate-500">
          {t('Creates {n} PCs:', { n: count })} {prefix}{String(from).padStart(pad, '0')} … {prefix}{String(to).padStart(pad, '0')}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn-primary" disabled={busy || count === 0}>{busy ? t('Adding…') : t('Add {n} PCs', { n: count })}</button>
        </div>
      </form>
    </Modal>
  )
}
