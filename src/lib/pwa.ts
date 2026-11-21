import { useEffect, useState } from 'react'

/** Installable-app helpers: service worker, the "Install app" button, and pop-up alerts. */

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
declare global {
  interface Window {
    __labfixInstall?: InstallEvent | null
  }
}

/** Register the service worker (production builds only; in dev it would cache stale code). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* app still works without it, just not installable / offline */
    })
  })
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)

export type InstallState = 'installed' | 'available' | 'ios' | 'unavailable'

/** Whether LabFix can be installed here, and a function that shows the install prompt. */
export function useInstall(): { state: InstallState; install: () => Promise<void> } {
  const read = (): InstallState => (isStandalone() ? 'installed' : window.__labfixInstall ? 'available' : isIos() ? 'ios' : 'unavailable')
  const [state, setState] = useState<InstallState>(read)

  useEffect(() => {
    const update = () => setState(read())
    const installed = () => {
      window.__labfixInstall = null
      setState('installed')
    }
    window.addEventListener('labfix-installable', update)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('labfix-installable', update)
      window.removeEventListener('appinstalled', installed)
    }
    // read() only looks at browser globals
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function install() {
    const e = window.__labfixInstall
    if (!e) return
    await e.prompt()
    const { outcome } = await e.userChoice
    window.__labfixInstall = null
    setState(outcome === 'accepted' ? 'installed' : read())
  }
  return { state, install }
}

/**
 * Show a system pop-up. Uses the service worker when there is one (required on
 * Android, and clicking it opens the ticket even if LabFix was closed).
 */
export async function showPopup(title: string, body: string, url: string, tag: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const options: NotificationOptions = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url } }
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  if (reg) {
    await reg.showNotification(title, options)
    return
  }
  const n = new Notification(title, options)
  n.onclick = () => {
    window.focus()
    window.location.assign(url)
    n.close()
  }
}
