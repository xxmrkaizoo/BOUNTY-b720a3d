import { useT } from '../lib/settings.tsx'

export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return <img src="/favicon.svg" alt="" className={`${className} shrink-0 rounded-xl shadow-md shadow-brand-700/40`} />
}

export default function Logo({ dark = false }: { dark?: boolean }) {
  const t = useT()
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-none">
        <span className={`block text-lg font-extrabold tracking-tight ${dark ? 'text-on' : 'text-slate-900'}`}>
          Lab<span className="text-brand-400">Fix</span>
        </span>
        <span className={`block text-[10px] font-semibold tracking-[0.18em] uppercase ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
          {t('Maintenance')}
        </span>
      </span>
    </span>
  )
}
