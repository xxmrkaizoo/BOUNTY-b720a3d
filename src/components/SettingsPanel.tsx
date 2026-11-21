import { Check, Languages, Moon, MonitorSmartphone, Palette, Sun, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { LANGUAGES, useSettings, type ThemeMode } from '../lib/settings.tsx'

const THEMES: { id: ThemeMode; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'light', label: 'Light', hint: 'Bright blue water glass', icon: Sun },
  { id: 'dark', label: 'Dark', hint: 'Deep-sea night glass', icon: Moon },
  { id: 'system', label: 'System', hint: 'Follow this device', icon: MonitorSmartphone },
]

/** Mini preview of each colour mode. */
function Preview({ dark }: { dark: boolean }) {
  return (
    <div className={`h-16 overflow-hidden rounded-xl ring-1 ${dark ? 'bg-[#071530] ring-[#22324f]' : 'bg-[#e6f0fd] ring-[#d5e4f7]'}`}>
      <div className="flex h-full">
        <div className="w-5 bg-linear-to-b from-[#173cab] to-[#0b1d45]" />
        <div className="flex-1 space-y-1.5 p-2">
          <div className={`h-2 w-2/3 rounded-full ${dark ? 'bg-[#e4e9f1]/70' : 'bg-[#0b1d45]/70'}`} />
          <div className={`h-6 rounded-md ${dark ? 'bg-[#13233f]' : 'bg-[#ffffff]/80'}`}>
            <div className="m-1.5 inline-block h-2 w-6 rounded-full bg-[#337ef8]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`relative rounded-2xl border p-3 text-left transition ${
        selected ? 'border-brand-500 bg-brand-50/70 ring-4 ring-brand-500/15' : 'border-white/70 bg-white/50 hover:bg-white/80'
      }`}
    >
      {selected && (
        <span className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-brand-600 text-on">
          <Check className="size-3" />
        </span>
      )}
      {children}
    </button>
  )
}

/** Colour mode + language. Used by the Settings page and the floating settings button. */
export default function SettingsPanel() {
  const { theme, setTheme, lang, setLang, t } = useSettings()
  return (
    <div className="space-y-8">
      <section>
        <h2 className="flex items-center gap-2 font-bold text-ink-900"><Palette className="size-4 text-brand-600" /> {t('Colour mode')}</h2>
        <p className="mb-4 text-sm text-slate-500">{t('Changes the look of every page on this device.')}</p>
        <div role="radiogroup" aria-label={t('Colour mode')} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEMES.map(({ id, label, hint, icon: Icon }) => (
            <Option key={id} selected={theme === id} onClick={() => setTheme(id)}>
              {id === 'system' ? (
                <div className="grid h-16 grid-cols-2 gap-1"><Preview dark={false} /><Preview dark /></div>
              ) : (
                <Preview dark={id === 'dark'} />
              )}
              <div className="mt-3 flex items-center gap-2 font-semibold text-slate-900"><Icon className="size-4 text-brand-600" /> {t(label)}</div>
              <div className="text-xs text-slate-500">{t(hint)}</div>
            </Option>
          ))}
        </div>
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-bold text-ink-900"><Languages className="size-4 text-brand-600" /> {t('Language')}</h2>
        <p className="mb-4 text-sm text-slate-500">{t('Menus, buttons and labels on every page.')}</p>
        <div role="radiogroup" aria-label={t('Language')} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {LANGUAGES.map((l) => (
            <Option key={l.id} selected={lang === l.id} onClick={() => setLang(l.id)}>
              <div className="text-2xl font-extrabold text-ink-900">{l.id === 'en' ? 'Aa' : l.id === 'ms' ? 'Ms' : '文'}</div>
              <div className="mt-2 font-semibold text-slate-900">{l.native}</div>
              <div className="text-xs text-slate-500">{l.english}</div>
            </Option>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {t('Ticket history and messages sent to maintenance companies stay in the language they were written in.')}
        </p>
      </section>
    </div>
  )
}
