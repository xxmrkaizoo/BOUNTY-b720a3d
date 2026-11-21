import { orderBy, query } from 'firebase/firestore'
import { RotateCcw, Trash, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import Modal from '../components/Modal.tsx'
import { useAuth } from '../hooks/useAuth.tsx'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { formatDateTime } from '../lib/format.ts'
import { deleteUser, deletedUsersCol, restoreUser, setUserRole, usersCol } from '../services/admin.ts'
import type { Actor, Role, UserProfile } from '../types.ts'
import { useT } from '../lib/settings.tsx'
import { Loader } from '../components/Loading.tsx'

interface RemovedUser {
  id: string
  name: string
  email: string
  deletedAt: Date | null
  deletedBy?: Actor
  profile: Omit<UserProfile, 'id'>
}

const ROLE_LABEL: Record<Role, string> = { staff: 'Staff', admin: 'Admin', technician: 'Technician', disabled: 'No access' }

function Avatar({ name, muted }: { name?: string; muted?: boolean }) {
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold text-on ${
        muted ? 'bg-slate-400' : 'bg-linear-to-br from-brand-400 to-brand-700'
      }`}
    >
      {(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
    </span>
  )
}

export default function Users() {
  const t = useT()
  const { user, actor } = useAuth()
  const q = useMemo(() => query(usersCol, orderBy('name')), [])
  const { data: users, loading, error } = useLiveQuery<UserProfile>(q)
  const removedQ = useMemo(() => query(deletedUsersCol, orderBy('deletedAt', 'desc')), [])
  const { data: removed } = useLiveQuery<RemovedUser>(removedQ)

  const [confirming, setConfirming] = useState<UserProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function onDelete() {
    if (!confirming || !actor) return
    setBusy(true)
    try {
      await deleteUser(confirming, actor)
      setMsg(t('{name} was removed. They lost access immediately.', { name: confirming.name }))
      setConfirming(null)
    } catch (e) {
      setMsg(t('Could not remove user: {msg}', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusy(false)
    }
  }

  async function onRestore(r: RemovedUser) {
    if (!confirm(t('Restore {name} as {role}?', { name: r.name, role: t(ROLE_LABEL[r.profile.role]) + (r.profile.vendorName ? ` · ${r.profile.vendorName}` : '') }))) return
    try {
      await restoreUser(r.id, r.profile)
      setMsg(t('{name} was restored.', { name: r.name }))
    } catch (e) {
      setMsg(t('Could not restore user: {msg}', { msg: e instanceof Error ? e.message : String(e) }))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{t('Users')}</h1>
        <p className="text-sm text-slate-500">
          <b>{t('Staff')}</b> {t('report faults and comment.')} <b>{t('Admins')}</b> {t('call the maintenance company and manage everything.')}{' '}
          <b>{t('Technicians')}</b> {t('join through a company’s portal link and only see that company’s jobs.')} <b>{t('No access')}</b> {t('blocks an account;')}{' '}
          <b>{t('Delete')}</b> {t('removes it.')}
        </p>
      </div>
      {error && <p className="text-sm text-rose-600">Error: {error.message}</p>}
      {msg && <p className="glass rounded-2xl p-3 text-sm text-slate-700">{msg}</p>}

      <div className="card overflow-x-auto">
        <table className="block w-full text-sm sm:table sm:min-w-[620px]">
          <thead className="hidden bg-white/40 text-left sm:table-header-group text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t('Name')}</th>
              <th className="px-4 py-2.5 font-medium">{t('Email')}</th>
              <th className="px-4 py-2.5 font-medium">{t('Role')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="block divide-y divide-brand-900/[0.06] sm:table-row-group">
            {loading && (
              <tr className="block sm:table-row"><td colSpan={4} className="block sm:table-cell"><Loader /></td></tr>
            )}
            {users.map((u) => {
              const self = u.id === user?.uid
              return (
                <tr key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:table-row sm:p-0">
                  <td className="block w-full sm:table-cell sm:w-auto sm:px-4 sm:py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} />
                      <span>
                        <span className="block font-semibold text-slate-900">
                          {u.name} {self && <span className="text-xs font-normal text-slate-400">({t('you')})</span>}
                        </span>
                        {u.role === 'technician' && u.vendorName && <span className="text-xs text-brand-700">Technician · {u.vendorName}</span>}
                      </span>
                    </div>
                  </td>
                  <td className="block w-full pl-12 text-xs break-all text-slate-600 sm:table-cell sm:w-auto sm:px-4 sm:py-2.5 sm:text-sm">{u.email}</td>
                  <td className="block pl-12 sm:table-cell sm:px-4 sm:py-2.5">
                    <select
                      className="input w-auto py-1"
                      value={u.role}
                      disabled={self}
                      title={self ? t('You cannot change your own role') : undefined}
                      onChange={(e) => setUserRole(u.id, e.target.value as Role)}
                    >
                      {u.vendorId ? (
                        <option value="technician">{t('Technician')}</option>
                      ) : (
                        <>
                          <option value="staff">{t('Staff')}</option>
                          <option value="admin">{t('Admin')}</option>
                        </>
                      )}
                      <option value="disabled">{t('No access')}</option>
                    </select>
                  </td>
                  <td className="ml-auto block text-right sm:table-cell sm:px-4 sm:py-2.5">
                    {!self && (
                      <button
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        title={`Delete ${u.name}`}
                        aria-label={`Delete ${u.name}`}
                        onClick={() => setConfirming(u)}
                      >
                        <Trash className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {removed.length > 0 && (
        <section className="card p-5">
          <h2 className="font-bold text-ink-900">{t('Removed accounts')}</h2>
          <p className="mb-3 text-xs text-slate-500">{t('These logins are blocked. Restore brings them back with their old role.')}</p>
          <ul className="divide-y divide-brand-900/[0.06]">
            {removed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar name={r.name} muted />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-700">{r.name}</div>
                  <div className="text-xs text-slate-500">
                    {t(ROLE_LABEL[r.profile.role])}
                    {r.profile.vendorName && ` · ${r.profile.vendorName}`} ·{' '}
                    {r.deletedBy
                      ? t('removed {date} by {name}', { date: formatDateTime(r.deletedAt), name: r.deletedBy.name })
                      : t('removed {date}', { date: formatDateTime(r.deletedAt) })}
                  </div>
                </div>
                <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => onRestore(r)}>
                  <RotateCcw /> {t('Restore')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={!!confirming} title={t('Delete user?')} onClose={() => setConfirming(null)}>
        {confirming && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-rose-50/80 p-4 ring-1 ring-rose-200">
              <span className="grid size-10 place-items-center rounded-xl bg-rose-600 text-on"><UserX className="size-5" /></span>
              <div>
                <div className="font-semibold text-slate-900">{confirming.name}</div>
                <div className="text-xs text-slate-600">
                  {confirming.email} · {t(ROLE_LABEL[confirming.role])}
                  {confirming.vendorName && ` · ${confirming.vendorName}`}
                </div>
              </div>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>{t('They lose access immediately, even if they are signed in now.')}</li>
              <li>{t('They can’t sign up again with the same login.')}</li>
              <li>{t('Their past tickets and comments are kept.')}</li>
              <li>{t('You can restore them later from “Removed accounts”.')}</li>
            </ul>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirming(null)}>{t('Cancel')}</button>
              <button className="btn-danger" disabled={busy} onClick={onDelete}>
                <Trash /> {busy ? t('Deleting…') : t('Delete user')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
