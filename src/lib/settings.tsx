import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ms } from './i18n/ms.ts'
import { zh } from './i18n/zh.ts'

/**
 * Per-device display settings: colour mode and language.
 * Stored in localStorage (a viewer preference, not shared data).
 */
export type ThemeMode = 'light' | 'dark' | 'system'
export type Lang = 'en' | 'ms' | 'zh'

export const LANGUAGES: { id: Lang; native: string; english: string; locale: string; htmlLang: string }[] = [
  { id: 'en', native: 'English', english: 'English', locale: 'en-MY', htmlLang: 'en' },
  { id: 'ms', native: 'Bahasa Melayu', english: 'Malay', locale: 'ms-MY', htmlLang: 'ms' },
  { id: 'zh', native: '中文', english: 'Chinese', locale: 'zh-CN', htmlLang: 'zh-CN' },
]

const KEY = 'labfix.settings'
interface Stored {
  theme: ThemeMode
  lang: Lang
}

function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Stored>
    return {
      theme: raw.theme === 'dark' || raw.theme === 'system' ? raw.theme : 'light',
      lang: raw.lang === 'ms' || raw.lang === 'zh' ? raw.lang : 'en',
    }
  } catch {
    return { theme: 'light', lang: 'en' }
  }
}
function save(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode etc.: settings just won't persist */
  }
}

// ---------------------------------------------------------------- translation
const DICTS: Record<Lang, Record<string, string> | null> = { en: null, ms, zh }
let currentLang: Lang = load().lang

/** Current language, for plain (non-React) helpers such as date formatting. */
export function getLang(): Lang {
  return currentLang
}
export function getLocale(): string {
  return LANGUAGES.find((l) => l.id === currentLang)!.locale
}

export type Vars = Record<string, string | number | null | undefined>
/**
 * Translate an English UI string. The English text is the key, so anything
 * not yet translated simply shows in English. `{name}` placeholders are filled from `vars`.
 */
export function translate(text: string, vars?: Vars): string {
  const out = DICTS[currentLang]?.[text] ?? text
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] ?? m) + '') : out
}
export type T = typeof translate

// ---------------------------------------------------------------- theme
function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}
function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && systemDark())
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#06122e' : '#1d5fed')
  return dark
}

// ---------------------------------------------------------------- context
interface SettingsValue {
  theme: ThemeMode
  /** The colour mode actually showing (system resolved). */
  isDark: boolean
  lang: Lang
  setTheme: (t: ThemeMode) => void
  setLang: (l: Lang) => void
  t: T
}

const Ctx = createContext<SettingsValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(load)
  const [isDark, setIsDark] = useState(() => applyTheme(state.theme))

  useEffect(() => {
    save(state)
    setIsDark(applyTheme(state.theme))
    if (state.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setIsDark(applyTheme('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [state])

  useEffect(() => {
    currentLang = state.lang
    document.documentElement.lang = LANGUAGES.find((l) => l.id === state.lang)!.htmlLang
  }, [state.lang])

  const setTheme = useCallback((theme: ThemeMode) => setState((s) => ({ ...s, theme })), [])
  const setLang = useCallback((lang: Lang) => {
    currentLang = lang // so text rendered right away uses the new language
    setState((s) => ({ ...s, lang }))
  }, [])

  // A new `t` per language makes every component using it re-render.
  const t = useMemo<T>(() => (text, vars) => translate(text, vars), [state.lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(
    () => ({ theme: state.theme, isDark, lang: state.lang, setTheme, setLang, t }),
    [state.theme, isDark, state.lang, setTheme, setLang, t],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSettings must be used inside <SettingsProvider>')
  return v
}

/** Shorthand: `const t = useT()` then `t('Repair tickets')`. */
// eslint-disable-next-line react-refresh/only-export-components
export function useT(): T {
  return useSettings().t
}
