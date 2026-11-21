import { Settings } from 'lucide-react'
import { useState } from 'react'
import { useT } from '../lib/settings.tsx'
import Modal from './Modal.tsx'
import SettingsPanel from './SettingsPanel.tsx'

/**
 * Round settings button fixed to the bottom-left corner. Opens the settings
 * in a pop-up, so it works on every page, signed in or not.
 */
export default function SettingsButton({ className = '' }: { className?: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('Settings')}
        title={t('Settings')}
        className={`glass fixed bottom-4 left-4 z-40 grid size-12 place-items-center rounded-2xl text-brand-700 shadow-lift transition hover:scale-105 hover:text-brand-600 active:scale-95 ${className}`}
      >
        <Settings className="size-5" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('Settings')} subtitle={t('Saved on this device and applied to all pages.')} wide>
        <SettingsPanel />
      </Modal>
    </>
  )
}
