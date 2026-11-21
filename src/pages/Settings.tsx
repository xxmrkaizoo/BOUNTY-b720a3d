import { BellRing, Download, Share, Smartphone, Timer } from 'lucide-react'
import { PriorityBadge } from '../components/Badge.tsx'
import { useNotices } from '../components/Notifications.tsx'
import SettingsPanel from '../components/SettingsPanel.tsx'
import { useInstall } from '../lib/pwa.ts'
import { useT } from '../lib/settings.tsx'
import { slaTarget } from '../lib/sla.ts'
import type { Priority } from '../types.ts'

export default function Settings() {
  const t = useT()
  const { desktop, enableDesktop } = useNotices()
  const install = useInstall()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-medium text-brand-600">{t('Preferences')}</p>
        <h1 className="page-title mt-1">{t('Settings')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('Saved on this device and applied to all pages.')}</p>
      </div>
      <div className="card p-6 sm:p-8">
        <SettingsPanel />
      </div>

      <section className="card p-6 sm:p-8">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><BellRing className="size-5 text-brand-600" /> {t('Alerts')}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t('The bell shows new reports, repair updates and comments on your tickets as they happen.')}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/60 p-4 ring-1 ring-white">
          <div>
            <div className="text-sm font-semibold text-slate-800">{t('Desktop pop-ups')}</div>
            <div className="text-xs text-slate-500">
              {desktop === 'granted'
                ? t('On. You get a pop-up when LabFix is open in a background tab.')
                : desktop === 'denied'
                  ? t('Blocked by your browser. Allow notifications for this site in the browser settings.')
                  : desktop === 'unsupported'
                    ? t('This browser doesn’t support pop-up alerts. The bell still works.')
                    : t('Get a pop-up on this computer even when LabFix is in another tab.')}
            </div>
          </div>
          {desktop === 'default' && <button className="btn-primary" onClick={enableDesktop}>{t('Turn on')}</button>}
          {desktop === 'granted' && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">{t('On')}</span>}
        </div>
      </section>

      <section className="card p-6 sm:p-8">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><Smartphone className="size-5 text-brand-600" /> {t('Install as an app')}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t('Put LabFix on your phone’s home screen or your computer’s taskbar. It opens in its own window, starts faster and can show alert pop-ups.')}
        </p>
        <div className="mt-4 rounded-2xl bg-white/60 p-4 text-sm ring-1 ring-white">
          {install.state === 'installed' ? (
            <span className="font-semibold text-emerald-700">{t('LabFix is installed on this device. ✓')}</span>
          ) : install.state === 'available' ? (
            <button className="btn-primary" onClick={install.install}><Download /> {t('Install app')}</button>
          ) : install.state === 'ios' ? (
            <span className="flex items-center gap-2 text-slate-700">
              <Share className="size-4 shrink-0" /> {t('On iPhone / iPad: tap the Share button in Safari, then “Add to Home Screen”.')}
            </span>
          ) : (
            <span className="text-slate-600">{t('Open LabFix in Chrome or Edge and use “Install app” in the browser menu (⋮). On iPhone use Safari → Share → “Add to Home Screen”.')}</span>
          )}
        </div>
      </section>

      <section className="card p-6 sm:p-8">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><Timer className="size-5 text-brand-600" /> {t('Fix deadlines')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('Every ticket must be fixed within this time from when it was reported. Late tickets are flagged in red.')}</p>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(['critical', 'high', 'medium', 'low'] as Priority[]).map((p) => (
            <li key={p} className="flex items-center justify-between rounded-2xl bg-white/60 px-4 py-3 ring-1 ring-white">
              <PriorityBadge priority={p} />
              <span className="text-sm font-semibold text-slate-800">{slaTarget(p)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
