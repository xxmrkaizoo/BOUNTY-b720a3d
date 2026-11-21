import { orderBy, query } from 'firebase/firestore'
import { CalendarClock, CalendarPlus, Pause, Play, Plus, Repeat, Wrench, Zap } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PriorityBadge } from '../components/Badge.tsx'
import Modal from '../components/Modal.tsx'
import { useAuth } from '../hooks/useAuth.tsx'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { CATEGORY_LABEL, PRIORITY_LABEL } from '../lib/constants.ts'
import { formatDateTime } from '../lib/format.ts'
import { useT } from '../lib/settings.tsx'
import { shortSpan, useNow } from '../lib/sla.ts'
import { computersCol, vendorsCol } from '../services/admin.ts'
import { deleteSchedule, runSchedule, saveSchedule, schedulesCol, setScheduleActive, type ScheduleInput } from '../services/schedules.ts'
import type { Computer, IssueCategory, Priority, RepeatUnit, Schedule, Vendor } from '../types.ts'
import { Loader } from '../components/Loading.tsx'

/** yyyy-mm-dd for <input type="date">, in local time. */
function dateInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function tomorrow9am() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d
}

const TEMPLATES: { title: string; description: string; category: IssueCategory; every: number; unit: RepeatUnit }[] = [
  { title: 'Clean dust from PCs and keyboards', description: 'Blow out dust from PC cases, clean keyboards, mice and screens.', category: 'hardware', every: 3, unit: 'month' },
  { title: 'Install Windows updates', description: 'Install pending Windows and Office updates on every PC, then restart.', category: 'software', every: 1, unit: 'month' },
  { title: 'Antivirus scan and update', description: 'Update antivirus definitions and run a full scan on every PC.', category: 'software', every: 1, unit: 'week' },
  { title: 'Network and internet check', description: 'Test LAN ports, cables and internet speed on every PC.', category: 'network', every: 1, unit: 'month' },
]

const UNIT_LABEL: Record<RepeatUnit, string> = { day: 'day(s)', week: 'week(s)', month: 'month(s)' }

function emptyForm(lab = ''): ScheduleInput {
  return {
    title: '',
    description: '',
    lab,
    category: 'hardware',
    priority: 'low',
    every: 1,
    unit: 'month',
    vendorId: null,
    vendorName: null,
    nextDue: tomorrow9am(),
    active: true,
  }
}

/** Admins set up recurring maintenance; each time it's due, a ticket is created automatically. */
export default function Maintenance() {
  const t = useT()
  const navigate = useNavigate()
  const { actor } = useAuth()
  const now = useNow()
  const q = useMemo(() => query(schedulesCol, orderBy('nextDue')), [])
  const { data: schedules, loading, error } = useLiveQuery<Schedule>(q)
  const { data: computers } = useLiveQuery<Computer>(useMemo(() => query(computersCol), []))
  const { data: vendors } = useLiveQuery<Vendor>(useMemo(() => query(vendorsCol, orderBy('name')), []))
  const labs = useMemo(() => [...new Set(computers.map((c) => c.lab))].sort(), [computers])

  const [editing, setEditing] = useState<{ id?: string; form: ScheduleInput } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const set = (patch: Partial<ScheduleInput>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e))

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    setBusy('save')
    try {
      await saveSchedule(editing.form, editing.id)
      setEditing(null)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('Save failed'))
    } finally {
      setBusy(null)
    }
  }

  async function runNow(s: Schedule) {
    if (!actor) return
    setBusy(s.id)
    setMsg(null)
    try {
      const id = await runSchedule(s.id, actor, true)
      if (id) navigate(`/tickets/${id}`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t('Action failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-600">{t('Prevent faults before they happen')}</p>
          <h1 className="page-title mt-1">{t('Planned maintenance')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {t('Repeating jobs like dust cleaning or Windows updates. When one is due, a ticket is created automatically (and sent to the company, if you pick one).')}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ form: emptyForm(labs[0]) })}><Plus /> {t('New schedule')}</button>
      </div>

      {msg && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{msg}</p>}
      {error && <p className="text-sm text-rose-600">{error.message}</p>}
      {loading && <Loader />}

      {!loading && schedules.length === 0 && (
        <div className="card p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-brand-100/80 text-brand-600"><CalendarPlus className="size-6" /></div>
            <div className="font-semibold text-slate-800">{t('No planned maintenance yet')}</div>
            <p className="text-sm text-slate-500">{t('Start from a common one:')}</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {TEMPLATES.map((tp) => (
              <button
                key={tp.title}
                className="rounded-2xl bg-white/60 p-4 text-left ring-1 ring-white transition hover:bg-white/90 hover:shadow-lift"
                onClick={() => setEditing({ form: { ...emptyForm(labs[0]), ...tp, title: t(tp.title), description: t(tp.description) } })}
              >
                <div className="font-semibold text-slate-900">{t(tp.title)}</div>
                <div className="mt-1 text-xs text-slate-500">{t('Every {n} {unit}', { n: tp.every, unit: t(UNIT_LABEL[tp.unit]) })}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {schedules.map((s) => {
          const due = s.nextDue ? s.nextDue.getTime() - now : 0
          return (
            <div key={s.id} className={`card flex flex-col gap-3 p-5 ${s.active ? '' : 'opacity-70'}`}>
              <div className="flex items-start gap-3">
                <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${s.active ? 'bg-brand-100/80 text-brand-600' : 'bg-slate-100 text-slate-400'}`}><Repeat className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-slate-900">{s.title}</h2>
                  <p className="text-xs text-slate-500">
                    {s.lab} · {t('Every {n} {unit}', { n: s.every, unit: t(UNIT_LABEL[s.unit]) })}
                  </p>
                </div>
                <PriorityBadge priority={s.priority} />
              </div>
              {s.description && <p className="text-sm text-slate-600">{s.description}</p>}
              <div className="grid gap-2 rounded-2xl bg-white/50 p-3 text-xs ring-1 ring-white sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-slate-400" />
                  <span>
                    <span className="block text-slate-500">{t('Next')}</span>
                    <span className="font-semibold text-slate-800">
                      {s.active ? (due <= 0 ? t('Due now') : t('in {d}', { d: shortSpan(due) })) : t('Paused')}
                    </span>
                    <span className="block text-slate-400">{formatDateTime(s.nextDue)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Wrench className="size-4 text-slate-400" />
                  <span>
                    <span className="block text-slate-500">{t('Sent to')}</span>
                    <span className="font-semibold text-slate-800">{s.vendorName ?? t('Lab only (no company)')}</span>
                    {s.lastTicketId && (
                      <Link to={`/tickets/${s.lastTicketId}`} className="block text-brand-600 hover:underline">
                        {t('Last ticket')} · {formatDateTime(s.lastRun)}
                      </Link>
                    )}
                  </span>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-brand-900/[0.06] pt-3 text-xs font-semibold">
                <button className="inline-flex items-center gap-1 text-brand-600 hover:underline" disabled={busy === s.id} onClick={() => runNow(s)}>
                  <Zap className="size-3.5" /> {busy === s.id ? t('Creating…') : t('Create ticket now')}
                </button>
                <button className="inline-flex items-center gap-1 text-slate-600 hover:underline" onClick={() => setScheduleActive(s.id, !s.active)}>
                  {s.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {s.active ? t('Pause') : t('Resume')}
                </button>
                <button
                  className="text-slate-600 hover:underline"
                  onClick={() => {
                    const { id, nextDue, lastRun: _l, lastTicketId: _t, ...rest } = s
                    setEditing({ id, form: { ...rest, nextDue: nextDue ?? tomorrow9am() } })
                  }}
                >
                  {t('Edit')}
                </button>
                <button className="text-slate-400 hover:text-rose-600 hover:underline" onClick={() => confirm(t('Delete “{title}”? Tickets already created are kept.', { title: s.title })) && deleteSchedule(s.id)}>
                  {t('Delete')}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-slate-500">
        {t('Due jobs are checked whenever an admin has LabFix open (every 10 minutes). Nothing is created twice, even with several admins online.')}
      </p>

      <Modal open={!!editing} wide title={editing?.id ? t('Edit schedule') : t('New schedule')} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={onSave} className="space-y-4">
            <div>
              <label className="label" htmlFor="s-title">{t('Task')}</label>
              <input id="s-title" className="input" required maxLength={200} placeholder={t('e.g. Clean dust from PCs and keyboards')} value={editing.form.title} onChange={(e) => set({ title: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="s-desc">{t('Details')}</label>
              <textarea id="s-desc" className="input" rows={2} value={editing.form.description} onChange={(e) => set({ description: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="s-lab">{t('Lab')}</label>
                <input id="s-lab" className="input" required list="s-labs" value={editing.form.lab} onChange={(e) => set({ lab: e.target.value })} />
                <datalist id="s-labs">{labs.map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div>
                <label className="label" htmlFor="s-vendor">{t('Send to maintenance company')}</label>
                <select
                  id="s-vendor"
                  className="input"
                  value={editing.form.vendorId ?? ''}
                  onChange={(e) => {
                    const v = vendors.find((x) => x.id === e.target.value)
                    set({ vendorId: v?.id ?? null, vendorName: v?.name ?? null })
                  }}
                >
                  <option value="">{t('Lab only (no company)')}</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <span className="label">{t('Repeat every')}</span>
                <div className="flex gap-2">
                  <input type="number" min={1} max={365} className="input w-20" aria-label={t('Repeat every')} value={editing.form.every} onChange={(e) => set({ every: Number(e.target.value) || 1 })} />
                  <select className="input" aria-label={t('Unit')} value={editing.form.unit} onChange={(e) => set({ unit: e.target.value as RepeatUnit })}>
                    {(Object.keys(UNIT_LABEL) as RepeatUnit[]).map((u) => <option key={u} value={u}>{t(UNIT_LABEL[u])}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="s-next">{editing.id ? t('Next due') : t('First due')}</label>
                <input
                  id="s-next"
                  type="date"
                  required
                  className="input"
                  value={dateInput(editing.form.nextDue)}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split('-').map(Number)
                    if (y) set({ nextDue: new Date(y, m - 1, d, 9, 0, 0) })
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="s-pri">{t('Priority')}</label>
                <select id="s-pri" className="input" value={editing.form.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
                  {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{t(PRIORITY_LABEL[p])}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="s-cat">{t('Problem type')}</label>
              <select id="s-cat" className="input" value={editing.form.category} onChange={(e) => set({ category: e.target.value as IssueCategory })}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{t('Cancel')}</button>
              <button className="btn-primary" disabled={busy === 'save'}>{busy === 'save' ? t('Saving…') : t('Save')}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
