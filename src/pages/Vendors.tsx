import { Building, Check, Copy, HardHat, Link2, Mail, MessageCircle, Phone, Plus, RotateCcw, Star } from 'lucide-react'
import { orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import Modal from '../components/Modal.tsx'
import { Stars } from '../components/Rating.tsx'
import { companyScores, fmtDuration, fmtMoney, type CompanyScore } from '../lib/stats.ts'
import { ticketsCol } from '../services/tickets.ts'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { phoneDigits } from '../lib/format.ts'
import { deleteVendor, saveVendor, usersCol, vendorsCol, type VendorInput } from '../services/admin.ts'
import { getOrCreateInvite, inviteUrl, regenerateInvite } from '../services/invites.ts'
import type { Ticket, UserProfile, Vendor } from '../types.ts'
import { useT } from '../lib/settings.tsx'
import { Loader } from '../components/Loading.tsx'

/** The company's maintenance-portal invite link: get, copy, or replace. */
function PortalLink({ vendor, technicians }: { vendor: Vendor; technicians: number }) {
  const tr = useT()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function load(fn: typeof getOrCreateInvite) {
    setBusy(true)
    try {
      setUrl(inviteUrl(await fn(vendor.id, vendor.name)))
    } finally {
      setBusy(false)
    }
  }
  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked: link is visible to copy by hand */
    }
  }

  return (
    <div className="rounded-2xl border border-brand-200/60 bg-brand-50/60 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-brand-900">
        <HardHat className="size-3.5" /> {tr('Maintenance portal')}
        <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-slate-600">
          {tr('{n} technician(s) joined', { n: technicians })}
        </span>
      </div>
      {url ? (
        <>
          <div className="mt-2 truncate rounded-lg bg-white/80 px-2.5 py-1.5 font-mono text-[11px] text-slate-600">{url}</div>
          <div className="mt-2 flex gap-2">
            <button className="btn-secondary flex-1 px-2 py-1.5 text-xs" onClick={copy}>{copied ? <Check /> : <Copy />} {copied ? tr('Copied') : tr('Copy link')}</button>
            <button
              className="btn-ghost px-2 py-1.5 text-xs"
              disabled={busy}
              title={tr('Make a new link. The old link stops working for new sign-ups.')}
              onClick={() => confirm(tr('Create a new link? The old link will stop working for new sign-ups. Technicians who already joined keep access.')) && load(regenerateInvite)}
            >
              <RotateCcw /> {tr('New link')}
            </button>
          </div>
        </>
      ) : (
        <button className="btn-secondary mt-2 w-full px-2 py-1.5 text-xs" disabled={busy} onClick={() => load(getOrCreateInvite)}>
          <Link2 /> {busy ? tr('Loading…') : tr('Show invite link')}
        </button>
      )}
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        {tr('This link is added automatically when you contact the company from a ticket. Technicians who sign up with it see only jobs sent to {company}.', { company: vendor.name })}
      </p>
    </div>
  )
}

/** Performance summary from every ticket handed to the company. */
function Scorecard({ score }: { score: CompanyScore | undefined }) {
  const tr = useT()
  if (!score) return <p className="rounded-2xl bg-white/50 p-3 text-xs text-slate-500 ring-1 ring-white">{tr('No jobs sent to this company yet.')}</p>
  const cells: [string, ReactNode][] = [
    [tr('Jobs'), `${score.jobs}${score.open ? ` · ${tr('{n} open', { n: score.open })}` : ''}`],
    [tr('Avg. time to fix'), fmtDuration(score.avgFix)],
    [tr('On time'), score.onTimePct === null ? '—' : `${score.onTimePct}%`],
    [tr('Reopened'), String(score.reopened)],
    [tr('Repair cost'), fmtMoney(score.cost)],
  ]
  return (
    <div className="rounded-2xl bg-white/50 p-3 ring-1 ring-white">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500">{tr('Scorecard')}</span>
        {score.rating === null ? (
          <span className="text-xs text-slate-400">{tr('No ratings yet')}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Stars value={score.rating} size="size-4" /> {score.rating.toFixed(1)}
            <span className="text-xs font-normal text-slate-400">({score.ratings})</span>
          </span>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-5">
        {cells.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-[11px] text-slate-500">{k}</dt>
            <dd className="text-sm font-semibold text-slate-900 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const EMPTY: VendorInput = { name: '', contactPerson: '', phone: '', whatsapp: '', email: '', notes: '', isDefault: false }

export default function Vendors() {
  const tr = useT()
  const q = useMemo(() => query(vendorsCol, orderBy('name')), [])
  const { data: vendors, loading, error } = useLiveQuery<Vendor>(q)
  const techQ = useMemo(() => query(usersCol, where('role', '==', 'technician')), [])
  const { data: techs } = useLiveQuery<UserProfile>(techQ)
  const ticketsQ = useMemo(() => query(ticketsCol), [])
  const { data: tickets } = useLiveQuery<Ticket>(ticketsQ)
  const scores = useMemo(() => new Map(companyScores(tickets).map((s) => [s.vendorId, s])), [tickets])
  const [editing, setEditing] = useState<{ id?: string; form: VendorInput } | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const set = (patch: Partial<VendorInput>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e))

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    setFormError(null)
    try {
      await saveVendor(editing.form, editing.id)
      setEditing(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tr('Save failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{tr('Maintenance Companies')}</h1>
          <p className="text-sm text-slate-500">{tr('Who to call when a lab computer breaks down.')}</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ form: { ...EMPTY, isDefault: vendors.length === 0 } })}>
          <Plus /> {tr('Add company')}
        </button>
      </div>

      {error && <p className="text-sm text-rose-600">Error: {error.message}</p>}
      {loading && <Loader />}
      {!loading && vendors.length === 0 && (
        <div className="card flex flex-col items-center gap-3 p-14 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-accent-400/20 text-accent-600"><Building className="size-6" /></div>
          <div className="font-semibold text-slate-800">{tr('No maintenance company yet')}</div>
          <p className="text-sm text-slate-500">{tr('Add the company your lab has a service contract with.')}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {vendors.map((v) => (
          <div key={v.id} className="card flex flex-col gap-4 p-5 transition hover:shadow-lift">
            <div className="flex items-start justify-between gap-2">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-linear-to-br from-ink-800 to-ink-900 text-lg font-bold text-brand-300">
                {v.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="mr-auto min-w-0">
                <h2 className="font-semibold text-slate-900">{v.name}</h2>
                <p className="text-sm text-slate-500">{v.contactPerson || tr('No contact person')}</p>
              </div>
              {v.isDefault && <span className="inline-flex items-center gap-1 rounded-full bg-accent-400/20 px-2.5 py-1 text-xs font-bold text-accent-600"><Star className="size-3 fill-current" /> {tr('Default')}</span>}
            </div>
            <div className="space-y-2 text-sm [&_a]:flex [&_a]:items-center [&_a]:gap-2.5 [&_svg]:size-4 [&_svg]:text-slate-400">
              {v.phone && <a className="block text-slate-700 hover:text-brand-600" href={`tel:${v.phone.replace(/[^\d+]/g, '')}`}><Phone /> {v.phone}</a>}
              {(v.whatsapp || v.phone) && (
                <a className="block text-slate-700 hover:text-emerald-600" target="_blank" rel="noopener" href={`https://wa.me/${phoneDigits(v.whatsapp || v.phone)}`}>
                  <MessageCircle /> WhatsApp {v.whatsapp || v.phone}
                </a>
              )}
              {v.email && <a className="block text-slate-700 hover:text-brand-600" href={`mailto:${v.email}`}><Mail /> {v.email}</a>}
              {v.notes && <p className="pt-1 text-xs text-slate-500">{v.notes}</p>}
            </div>
            <Scorecard score={scores.get(v.id)} />
            <PortalLink vendor={v} technicians={techs.filter((t) => t.vendorId === v.id).length} />
            <div className="mt-auto flex gap-3 border-t border-brand-900/[0.06] pt-3 text-xs font-semibold">
              <button
                className="text-slate-600 hover:underline"
                onClick={() => {
                  const { id, ...form } = v
                  setEditing({ id, form })
                }}
              >
                {tr('Edit')}
              </button>
              <button
                className="text-slate-400 hover:text-rose-600 hover:underline"
                onClick={async () => confirm(`Delete ${v.name}?`) && (await deleteVendor(v.id))}
              >
                {tr('Delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!editing} title={editing?.id ? tr('Edit company') : tr('Add maintenance company')} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={onSave} className="space-y-4">
            <div>
              <label className="label" htmlFor="vname">{tr('Company name')}</label>
              <input id="vname" className="input" required value={editing.form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="vcp">{tr('Contact person')}</label>
              <input id="vcp" className="input" value={editing.form.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="vphone">{tr('Phone')}</label>
                <input id="vphone" className="input" type="tel" placeholder="+60 12-345 6789" value={editing.form.phone} onChange={(e) => set({ phone: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="vwa">{tr('WhatsApp (if different)')}</label>
                <input id="vwa" className="input" type="tel" placeholder={tr('With country code')} value={editing.form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} />
              </div>
            </div>
            <p className="-mt-2 text-xs text-slate-500">{tr('Use the international format with country code so WhatsApp links work.')}</p>
            <div>
              <label className="label" htmlFor="vemail">{tr('Email')}</label>
              <input id="vemail" className="input" type="email" value={editing.form.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="vnotes">{tr('Notes (contract no., hours…)')}</label>
              <textarea id="vnotes" className="input" rows={2} value={editing.form.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.form.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} />
              {tr('Default company (preselected when calling)')}
            </label>
            {formError && <p className="text-sm text-rose-600">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{tr('Cancel')}</button>
              <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
