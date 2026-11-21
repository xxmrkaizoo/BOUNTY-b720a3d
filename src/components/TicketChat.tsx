import { FilePlus, MessageSquare, PhoneCall, RefreshCw, Send, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatDateTime, timeAgo } from '../lib/format.ts'
import { useT } from '../lib/settings.tsx'
import type { TicketEvent } from '../types.ts'

const QUICK_TECH = ['On my way.', 'I’ll come tomorrow morning.', 'Waiting for spare parts.', 'Fixed. Please check and confirm.']
const QUICK_LAB = ['Thank you!', 'When can you come?', 'It’s still not working.', 'The lab is free after 2pm.']

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
}

/**
 * Live chat between the lab and the maintenance company on one ticket.
 * Messages are the ticket's "comment" events, so they also raise alerts.
 */
export function TicketChat({
  events,
  meUid,
  technician,
  disabled,
  onSend,
}: {
  events: TicketEvent[]
  meUid: string
  technician: boolean
  disabled?: boolean
  onSend: (text: string) => Promise<void>
}) {
  const t = useT()
  const messages = events.filter((e) => e.type === 'comment')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  async function send(msg: string) {
    const m = msg.trim()
    if (!m || sending) return
    setSending(true)
    setError(null)
    try {
      await onSend(m)
      setText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not send'))
    } finally {
      setSending(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(text)
  }

  return (
    <section className="card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-brand-900/[0.06] px-6 py-4">
        <MessageSquare className="size-4 text-brand-600" />
        <h2 className="text-sm font-bold tracking-wide text-slate-400 uppercase">{t('Chat')}</h2>
        <span className="ml-auto text-xs text-slate-400">{t('Lab and maintenance company')}</span>
      </div>
      <div ref={listRef} className="max-h-[28rem] min-h-40 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">{t('No messages yet. Ask a question or give an update. Everyone on this ticket is alerted.')}</p>
        )}
        {messages.map((m, i) => {
          const mine = m.by?.uid === meUid
          const sameAsPrev = i > 0 && messages[i - 1].by?.uid === m.by?.uid
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {!mine && (
                <span className={`grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-accent-400 to-brand-600 text-[11px] font-bold text-on ${sameAsPrev ? 'invisible' : ''}`}>
                  {initials(m.by?.name)}
                </span>
              )}
              <div className={`max-w-[80%] ${mine ? 'items-end text-right' : ''} flex flex-col`}>
                {!mine && !sameAsPrev && <span className="mb-0.5 px-1 text-[11px] font-semibold text-slate-500">{m.by?.name}</span>}
                <div
                  className={`rounded-2xl px-3.5 py-2 text-left text-sm whitespace-pre-wrap shadow-sm ${
                    mine ? 'rounded-br-md bg-brand-600 text-on' : 'rounded-bl-md bg-white/80 text-slate-800 ring-1 ring-white'
                  }`}
                >
                  {m.message}
                </div>
                <span className="mt-0.5 px-1 text-[10px] text-slate-400" title={formatDateTime(m.at)}>{timeAgo(m.at)}</span>
              </div>
            </div>
          )
        })}
      </div>
      {!disabled && (
        <div className="border-t border-brand-900/[0.06] p-4">
          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {(technician ? QUICK_TECH : QUICK_LAB).map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => send(t(q))}
                className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-medium whitespace-nowrap text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50"
              >
                {t(q)}
              </button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="flex gap-2">
            <input className="input" placeholder={t('Type a message…')} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
            <button className="btn-primary px-3.5" disabled={sending || !text.trim()} aria-label={t('Send message')}>
              <Send />
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
      )}
    </section>
  )
}

const EVENT_STYLE: Record<Exclude<TicketEvent['type'], 'comment'>, { icon: LucideIcon; tone: string }> = {
  created: { icon: FilePlus, tone: 'bg-slate-100 text-slate-600' },
  status: { icon: RefreshCw, tone: 'bg-violet-100 text-violet-600' },
  call: { icon: PhoneCall, tone: 'bg-accent-400/20 text-accent-600' },
}

/** Status changes, calls and the original report, oldest first. */
export function TicketHistory({ events }: { events: TicketEvent[] }) {
  const t = useT()
  const items = events.filter((e) => e.type !== 'comment')
  return (
    <section className="card p-6">
      <h2 className="mb-5 text-sm font-bold tracking-wide text-slate-400 uppercase">{t('History')}</h2>
      <ol className="space-y-5">
        {items.map((ev, i) => {
          const { icon: Icon, tone } = EVENT_STYLE[ev.type as keyof typeof EVENT_STYLE] ?? EVENT_STYLE.status
          return (
            <li key={ev.id} className="relative flex gap-4">
              {i < items.length - 1 && <span className="absolute top-10 bottom-[-20px] left-[17px] w-px bg-slate-200" />}
              <span className={`relative grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 pt-1.5">
                <p className="text-sm whitespace-pre-wrap text-slate-800">{ev.message}</p>
                <p className="mt-1 text-xs text-slate-400">
                  <span className="font-medium text-slate-500">{ev.by?.name}</span> · <span title={formatDateTime(ev.at)}>{timeAgo(ev.at)}</span>
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
