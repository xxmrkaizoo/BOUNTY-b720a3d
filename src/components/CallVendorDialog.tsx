import { orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Building, Check, CircleCheck, Copy, Link2, Mail, MessageCircle, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.tsx'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { phoneDigits, ticketCode } from '../lib/format.ts'
import { vendorsCol } from '../services/admin.ts'
import { getOrCreateInvite, inviteUrl } from '../services/invites.ts'
import { buildVendorMessage, logVendorCall } from '../services/tickets.ts'
import type { CallChannel, Ticket, Vendor } from '../types.ts'
import Modal from './Modal.tsx'
import { useT } from '../lib/settings.tsx'

interface Props {
  ticket: Ticket
  open: boolean
  onClose: () => void
}

/**
 * "Call maintenance company": pick a vendor, then phone / WhatsApp / email
 * them with the ticket details pre-filled. Every contact is logged on the ticket.
 */
export default function CallVendorDialog({ ticket, open, onClose }: Props) {
  const t = useT()
  const { actor } = useAuth()
  const vendorsQ = useMemo(() => query(vendorsCol, orderBy('name')), [])
  const { data: vendors, loading } = useLiveQuery<Vendor>(vendorsQ)

  const [vendorId, setVendorId] = useState('')
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [portalUrl, setPortalUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const vendor = vendors.find((v) => v.id === vendorId) ?? null

  // Preselect: vendor already on the ticket → default vendor → first.
  useEffect(() => {
    if (!open || vendorId || vendors.length === 0) return
    const pick =
      vendors.find((v) => v.id === ticket.vendorId) ?? vendors.find((v) => v.isDefault) ?? vendors[0]
    setVendorId(pick.id)
  }, [open, vendors, vendorId, ticket.vendorId])

  // Rebuild the template only when the chosen company changes, so live
  // ticket updates don't wipe out edits the user made to the message.
  useEffect(() => {
    if (vendor) setMessage(buildVendorMessage(ticket, vendor, portalUrl ?? undefined))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor?.id, ticket.id, portalUrl])

  // The company's portal invite link (created the first time), pointing at this job.
  useEffect(() => {
    if (!open || !vendor) return
    let cancelled = false
    setPortalUrl(null)
    getOrCreateInvite(vendor.id, vendor.name)
      .then((code) => !cancelled && setPortalUrl(inviteUrl(code, ticket.id)))
      .catch(() => !cancelled && setPortalUrl(null))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vendor?.id, ticket.id])

  async function copyPortal() {
    if (!portalUrl) return
    try {
      await navigator.clipboard.writeText(portalUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked: the link is still visible to copy by hand */
    }
  }

  useEffect(() => {
    if (!open) {
      setDone(null)
      setError(null)
      setNote('')
    }
  }, [open])

  async function contact(channel: CallChannel) {
    if (!vendor || !actor) return
    setError(null)

    // Open the device action straight away (must happen in the click handler
    // or browsers may block the popup).
    if (channel === 'phone') {
      window.location.href = `tel:${vendor.phone.replace(/[^\d+]/g, '')}`
    } else if (channel === 'whatsapp') {
      const num = phoneDigits(vendor.whatsapp || vendor.phone)
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
    }

    setBusy(true)
    try {
      await logVendorCall(ticket, vendor, channel, actor, message, note)
      setDone(
        channel === 'email'
          ? t('Email queued to {email}. It is sent by the Firebase “Trigger Email” extension.', { email: vendor.email })
          : t('Logged: contacted {company} via {channel}.', { company: vendor.name, channel: channel === 'phone' ? t('phone') : 'WhatsApp' }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Failed to log the call'))
    } finally {
      setBusy(false)
    }
  }

  const mailto = vendor
    ? `mailto:${vendor.email}?subject=${encodeURIComponent(
        `[${ticketCode(ticket.id)}] Repair request: ${ticket.assetTag} – ${ticket.title}`,
      )}&body=${encodeURIComponent(message)}`
    : '#'

  return (
    <Modal open={open} onClose={onClose} title={t('Call maintenance company')} subtitle={`${ticketCode(ticket.id)} · ${ticket.assetTag}`} wide>
      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white/50" />
      ) : vendors.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-accent-400/20 text-accent-600"><Building className="size-6" /></div>
          <p className="text-sm text-slate-600">{t('No maintenance company saved yet.')}</p>
          <Link to="/vendors" className="btn-primary">{t('Add a company')}</Link>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="label" htmlFor="vendor">{t('Company')}</label>
            <select id="vendor" className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>

          {vendor && (
            <div className="keep-white flex items-center gap-4 rounded-2xl bg-linear-to-br from-ink-900 to-ink-800 p-4 text-on">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 text-lg font-bold text-brand-300">
                {vendor.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-semibold">{vendor.name}</div>
                <div className="truncate text-slate-400">
                  {[vendor.contactPerson, vendor.phone, vendor.email].filter(Boolean).join(' · ') || t('No contact details')}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-2xl border border-brand-200/70 bg-brand-50/70 p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-on"><Link2 className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-brand-900">{t('Maintenance portal link (added to the message)')}</div>
              <div className="truncate font-mono text-[11px] text-slate-500">{portalUrl ?? t('Creating link…')}</div>
            </div>
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={!portalUrl} onClick={copyPortal}>
              {copied ? <Check /> : <Copy />} {copied ? t('Copied') : t('Copy')}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <button className="btn-accent py-3" disabled={busy || !vendor?.phone} onClick={() => contact('phone')}>
              <Phone /> {t('Call')}
            </button>
            <button
              className="btn bg-[#25D366] py-3 text-on shadow-sm shadow-[#25D366]/30 hover:bg-[#1ebe5a]"
              disabled={busy || !(vendor?.whatsapp || vendor?.phone)}
              onClick={() => contact('whatsapp')}
            >
              <MessageCircle /> {t('WhatsApp')}
            </button>
            <button className="btn-secondary py-3" disabled={busy || !vendor?.email} onClick={() => contact('email')}>
              <Mail /> {t('Email')}
            </button>
          </div>

          {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}
          {done && (
            <p className="flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-800 ring-1 ring-brand-200">
              <CircleCheck className="mt-0.5 size-4 shrink-0" /> {done}
            </p>
          )}

          <div>
            <label className="label" htmlFor="msg">{t('Message (sent on WhatsApp / email)')}</label>
            <textarea id="msg" className="input font-mono text-xs leading-relaxed" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          <div>
            <label className="label" htmlFor="note">{t('Call note (optional, saved on the ticket)')}</label>
            <input id="note" className="input" placeholder={t('e.g. Technician coming tomorrow 10am')} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {vendor?.email && (
            <p className="text-xs text-slate-500">
              {t('No email extension installed?')}{' '}
              <a href={mailto} className="font-semibold text-brand-600 hover:underline">{t('Open in your mail app instead')}</a>.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
