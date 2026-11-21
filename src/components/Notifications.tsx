import { doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { Bell, BellRing, CalendarClock, Camera, CheckCheck, CircleCheck, FilePlus, MessageSquare, PhoneCall, RefreshCw, Star, Wrench, X, type LucideIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.tsx'
import { listenWithRetry } from '../hooks/useLiveQuery.ts'
import { STATUS_LABEL } from '../lib/constants.ts'
import { db } from '../lib/firebase.ts'
import { fromDoc, timeAgo } from '../lib/format.ts'
import { translate, useT } from '../lib/settings.tsx'
import { showPopup } from '../lib/pwa.ts'
import { audience, noticesCol } from '../services/notify.ts'
import type { Notice, NoticeKind } from '../types.ts'

type DesktopState = 'unsupported' | 'default' | 'granted' | 'denied'

interface NoticesValue {
  notices: Notice[]
  unread: number
  isUnread: (n: Notice) => boolean
  markAllRead: () => void
  desktop: DesktopState
  enableDesktop: () => Promise<void>
}

const NoticesContext = createContext<NoticesValue | null>(null)

export function useNotices(): NoticesValue {
  const v = useContext(NoticesContext)
  if (!v) throw new Error('useNotices must be used inside <NoticesProvider>')
  return v
}

const KIND_ICON: Record<NoticeKind, { icon: LucideIcon; tone: string }> = {
  new: { icon: FilePlus, tone: 'bg-amber-100 text-amber-700' },
  assigned: { icon: Wrench, tone: 'bg-brand-100 text-brand-700' },
  called: { icon: PhoneCall, tone: 'bg-sky-100 text-sky-700' },
  status: { icon: RefreshCw, tone: 'bg-violet-100 text-violet-700' },
  fixed: { icon: CircleCheck, tone: 'bg-emerald-100 text-emerald-700' },
  comment: { icon: MessageSquare, tone: 'bg-brand-100 text-brand-700' },
  photo: { icon: Camera, tone: 'bg-slate-100 text-slate-700' },
  rated: { icon: Star, tone: 'bg-amber-100 text-amber-700' },
  planned: { icon: CalendarClock, tone: 'bg-sky-100 text-sky-700' },
}

/** Alert text in the reader's language (built when shown, not when sent). */
export function noticeText(n: Notice): { title: string; body: string } {
  const t = translate
  const pc = t(n.assetTag)
  switch (n.kind) {
    case 'new':
      return { title: t('New fault reported: {pc}', { pc }), body: `${n.ticketTitle} · ${n.by?.name ?? ''}` }
    case 'assigned':
      return { title: t('New repair job for your company: {pc}', { pc }), body: n.ticketTitle }
    case 'called':
      return { title: t('Maintenance company contacted for {pc}', { pc }), body: t('{vendor} was called about “{title}”.', { vendor: n.vendorName ?? '', title: n.ticketTitle }) }
    case 'fixed':
      return { title: t('{pc} has been fixed', { pc }), body: n.text || n.ticketTitle }
    case 'status':
      return { title: t('{pc} is now “{status}”', { pc, status: t(STATUS_LABEL[n.status ?? 'open']) }), body: n.text ? `${n.by?.name}: ${n.text}` : n.ticketTitle }
    case 'comment':
      return { title: t('{name} commented on {pc}', { name: n.by?.name ?? '', pc }), body: n.text ?? '' }
    case 'photo':
      return { title: t('{name} added a photo to {pc}', { name: n.by?.name ?? '', pc }), body: n.ticketTitle }
    case 'rated':
      return { title: t('{name} rated the repair of {pc}', { name: n.by?.name ?? '', pc }), body: '★'.repeat(Number(n.text) || 0) + '☆'.repeat(5 - (Number(n.text) || 0)) + ` · ${n.ticketTitle}` }
    case 'planned':
      return { title: t('Planned maintenance due: {title}', { title: n.ticketTitle }), body: n.text ?? '' }
    default:
      return { title: n.ticketTitle, body: '' }
  }
}

function desktopState(): DesktopState {
  return typeof window !== 'undefined' && 'Notification' in window ? (Notification.permission as DesktopState) : 'unsupported'
}

/**
 * Live in-app alerts for the signed-in user: their own ("user:<uid>"),
 * plus "admins" for admins and "vendor:<id>" for technicians.
 * New alerts pop up as a toast, and as a desktop notification when the tab is in the background.
 */
export function NoticesProvider({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, isTechnician } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid ?? ''
  const vendorId = profile?.vendorId
  const audiences = useMemo(() => {
    if (!uid) return []
    const list = [audience.user(uid)]
    if (isAdmin) list.push(audience.admins)
    if (isTechnician && vendorId) list.push(audience.vendor(vendorId))
    return list
  }, [uid, isAdmin, isTechnician, vendorId])

  const [byAudience, setByAudience] = useState<Record<string, Notice[]>>({})
  const [toasts, setToasts] = useState<Notice[]>([])
  const [desktop, setDesktop] = useState<DesktopState>(desktopState)
  const announce = useRef<(n: Notice) => void>(() => {})

  useEffect(() => {
    announce.current = (n: Notice) => {
    setToasts((ts) => [n, ...ts.filter((x) => x.id !== n.id)].slice(0, 3))
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== n.id)), 7000)
    if (desktopState() === 'granted' && document.visibilityState === 'hidden') {
      const { title, body } = noticeText(n)
      showPopup(title, body, `/tickets/${n.ticketId}`, n.id).catch(() => {})
    }
    }
  }, [navigate])

  useEffect(() => {
    const stops = audiences.map((a) => {
      let first = true
      const q = query(noticesCol, where('audience', '==', a), orderBy('at', 'desc'), limit(25))
      return listenWithRetry(
        (onError) =>
          onSnapshot(
            q,
            (snap) => {
              setByAudience((m) => ({ ...m, [a]: snap.docs.map((d) => fromDoc<Notice>(d)) }))
              if (!first) {
                for (const ch of snap.docChanges()) {
                  if (ch.type !== 'added' || ch.doc.metadata.hasPendingWrites) continue
                  const n = fromDoc<Notice>(ch.doc)
                  if (n.by?.uid !== uid) announce.current(n)
                }
              }
              first = false
            },
            onError,
          ),
        () => setByAudience((m) => ({ ...m, [a]: [] })),
      )
    })
    return () => stops.forEach((s) => s())
  }, [audiences, uid])

  const notices = useMemo(() => {
    const seen = new Set<string>()
    // Only lists for the current audiences (a role change drops the old ones).
    return audiences
      .flatMap((a) => byAudience[a] ?? [])
      .filter((n) => n.by?.uid !== uid && !seen.has(n.id) && seen.add(n.id))
      .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
      .slice(0, 40)
  }, [byAudience, audiences, uid])

  const seenAt = profile?.notifSeenAt?.getTime() ?? 0
  const isUnread = useCallback((n: Notice) => (n.at?.getTime() ?? 0) > seenAt, [seenAt])
  const unread = notices.filter(isUnread).length

  const markAllRead = useCallback(() => {
    if (uid) updateDoc(doc(db, 'users', uid), { notifSeenAt: serverTimestamp() }).catch(() => {})
  }, [uid])

  const enableDesktop = useCallback(async () => {
    if (desktopState() === 'unsupported') return
    const res = await Notification.requestPermission()
    setDesktop(res as DesktopState)
  }, [])

  const value = { notices, unread, isUnread, markAllRead, desktop, enableDesktop }
  return (
    <NoticesContext.Provider value={value}>
      {children}
      <Toasts toasts={toasts} onClose={(id) => setToasts((ts) => ts.filter((x) => x.id !== id))} />
    </NoticesContext.Provider>
  )
}

function Toasts({ toasts, onClose }: { toasts: Notice[]; onClose: (id: string) => void }) {
  const t = useT()
  const navigate = useNavigate()
  if (toasts.length === 0) return null
  return createPortal(
    <div className="pointer-events-none fixed right-3 bottom-20 z-[70] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2 lg:bottom-6" aria-live="polite">
      {toasts.map((n) => {
        const { icon: Icon, tone } = KIND_ICON[n.kind] ?? KIND_ICON.status
        const { title, body } = noticeText(n)
        return (
          <div key={n.id} className="glass pointer-events-auto flex animate-fade-up items-start gap-3 rounded-2xl p-3.5 shadow-lift">
            <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-4" /></span>
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                onClose(n.id)
                navigate(`/tickets/${n.ticketId}`)
              }}
            >
              <span className="block text-sm font-semibold text-slate-900">{title}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{body}</span>
            </button>
            <button className="rounded-lg p-1 text-slate-400 hover:bg-white/60 hover:text-slate-700" onClick={() => onClose(n.id)} aria-label={t('Dismiss')}>
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}

/** Bell with unread count; opens the alerts panel. `dark` = placed on the dark sidebar. */
export function NotificationBell({ dark }: { dark?: boolean }) {
  const t = useT()
  const navigate = useNavigate()
  const { notices, unread, isUnread, markAllRead, desktop, enableDesktop } = useNotices()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function close() {
    setOpen(false)
    if (unread) markAllRead()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={unread ? t('Alerts ({n} unread)', { n: unread }) : t('Alerts')}
        title={t('Alerts')}
        className={`relative grid size-10 place-items-center rounded-xl transition ${dark ? 'text-slate-300 hover:bg-white/10 hover:text-on' : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}`}
      >
        {unread ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-[#fff] ring-2 ring-[#0b1b33]/20">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[55]" onClick={close} />
            <div
              role="dialog"
              aria-label={t('Alerts')}
              className="fixed top-16 right-3 left-3 z-[56] flex max-h-[min(34rem,calc(100vh-6rem))] animate-fade-up flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-lift backdrop-blur-2xl sm:left-auto sm:w-[24rem] lg:top-5 lg:left-[16.75rem]"
            >
              <div className="flex items-center justify-between gap-2 border-b border-brand-900/[0.06] px-5 py-3.5">
                <h2 className="font-bold text-slate-900">{t('Alerts')}</h2>
                {unread > 0 && (
                  <button className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline" onClick={markAllRead}>
                    <CheckCheck className="size-4" /> {t('Mark all as read')}
                  </button>
                )}
              </div>
              {desktop === 'default' && (
                <div className="flex items-center gap-3 border-b border-brand-900/[0.06] bg-brand-50/70 px-5 py-3 text-xs text-brand-800">
                  <BellRing className="size-4 shrink-0" />
                  <span className="flex-1">{t('Get a pop-up on this computer even when LabFix is in another tab.')}</span>
                  <button className="btn-primary px-2.5 py-1 text-xs" onClick={enableDesktop}>{t('Turn on')}</button>
                </div>
              )}
              <ul className="min-h-0 flex-1 divide-y divide-brand-900/[0.06] overflow-y-auto">
                {notices.length === 0 && (
                  <li className="flex flex-col items-center gap-2 p-10 text-center text-sm text-slate-500">
                    <Bell className="size-6 text-slate-300" />
                    {t('No alerts yet. You’ll be told here when something happens on your tickets.')}
                  </li>
                )}
                {notices.map((n) => {
                  const { icon: Icon, tone } = KIND_ICON[n.kind] ?? KIND_ICON.status
                  const { title, body } = noticeText(n)
                  const fresh = isUnread(n)
                  return (
                    <li key={n.id}>
                      <button
                        className={`flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-white/70 ${fresh ? 'bg-brand-50/60' : ''}`}
                        onClick={() => {
                          close()
                          navigate(`/tickets/${n.ticketId}`)
                        }}
                      >
                        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${fresh ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{title}</span>
                          {body && <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{body}</span>}
                          <span className="mt-1 block text-[11px] text-slate-400">{timeAgo(n.at)}</span>
                        </span>
                        {fresh && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-label={t('Unread')} />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
