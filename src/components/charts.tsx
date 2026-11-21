import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Small hand-rolled SVG/HTML charts.
 * Palette = validated reference categorical slots (blue, orange); bars use one hue.
 * Text always uses ink tokens; colour only marks identity.
 */
import { useSettings } from '../lib/settings.tsx'

const SERIES_LIGHT = ['#2a78d6', '#eb6834'] as const
const SERIES_DARK = ['#3987e5', '#d95926'] as const
/** Series colours for the current colour mode (reference palette, light & dark steps). */
export function useSeries() {
  return useSettings().isDark ? SERIES_DARK : SERIES_LIGHT
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

function niceMax(v: number) {
  if (v <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow
  return 10 * pow
}

// ---------------------------------------------------------------- Line chart
export interface LineSeries {
  name: string
  values: number[]
}

/** `labels` go on the x-axis; `tooltipLabels` (optional, longer) are shown on hover. */
export function LineChart({ labels, tooltipLabels, series, height = 240, unit = '' }: { labels: string[]; tooltipLabels?: string[]; series: LineSeries[]; height?: number; unit?: string }) {
  const SERIES = useSeries()
  const [wrapRef, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const M = { top: 12, right: 16, bottom: 26, left: 34 }
  const w = Math.max(200, width)
  const iw = w - M.left - M.right
  const ih = height - M.top - M.bottom
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)))
  const n = labels.length
  const x = (i: number) => M.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => M.top + ih - (v / max) * ih
  const ticks = [0, max / 2, max]
  // Pick x-axis labels that never collide; the last point is always labelled.
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))))
  const shown: number[] = []
  for (let i = 0; i < n; i += every) shown.push(i)
  if (n > 1 && shown[shown.length - 1] !== n - 1) {
    if (x(n - 1) - x(shown[shown.length - 1]) < 64) shown.pop()
    shown.push(n - 1)
  }

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left
    const i = n <= 1 ? 0 : Math.round((px / box.width) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }

  const tipLeft = hover !== null ? Math.min(Math.max(x(hover), 70), w - 70) : 0

  return (
    <div ref={wrapRef} className="relative">
      <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(' / ')}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={w - M.right} y1={y(t)} y2={y(t)} className="stroke-slate-900/10" strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[11px]">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {shown.map((i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-slate-400 text-[11px]">
            {labels[i]}
          </text>
        ))}
        {series.map((s, si) => (
          <path
            // new data = new key, so the line draws itself in again
            key={`${s.name}-${s.values.join(',')}`}
            d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={SERIES[si]}
            pathLength={1}
            strokeDasharray="1 0"
            className="motion-safe:animate-draw motion-safe:[stroke-dasharray:1]"
            style={{ animationDelay: `${si * 0.15}s` }}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} className="stroke-slate-900/30" />
            {series.map((s, si) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={SERIES[si]} className="stroke-white" strokeWidth={2} />
            ))}
          </g>
        )}
        <rect
          x={M.left}
          y={M.top}
          width={iw}
          height={ih}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-xs shadow-lift backdrop-blur"
          style={{ left: tipLeft }}
        >
          <div className="mb-1 font-semibold text-slate-900">{tooltipLabels?.[hover] ?? labels[hover]}</div>
          {series.map((s, si) => (
            <div key={s.name} className="flex items-center gap-2 text-slate-600">
              <span className="h-0.5 w-3 rounded-full" style={{ background: SERIES[si] }} />
              {s.name}
              <span className="ml-auto pl-3 font-semibold text-slate-900 tabular-nums">
                {s.values[hover]}
                {unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** `square` = swatches for bar/3D views; default = line swatches. */
export function Legend({ names, square }: { names: string[]; square?: boolean }) {
  const SERIES = useSeries()
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
      {names.map((n, i) => (
        <span key={n} className="inline-flex items-center gap-2">
          <span className={square ? 'size-2.5 rounded-sm' : 'h-0.5 w-4 rounded-full'} style={{ background: SERIES[i] }} />
          {n}
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Bar list
export interface BarItem {
  label: string
  value: number
  sub?: string
}

/** Horizontal bars, sorted by the caller. One hue; value at the bar end. */
export function BarList({ items, format = (v) => String(v), empty }: { items: BarItem[]; format?: (v: number) => string; empty?: string }) {
  const BAR = useSeries()[0]
  const t = useSettings().t
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...items.map((i) => i.value))
  const total = items.reduce((s, i) => s + i.value, 0)
  if (items.length === 0 || total === 0) return <p className="py-8 text-center text-sm text-slate-400">{empty ?? t('No data in this period.')}</p>
  return (
    <ul className="space-y-3.5">
      {items.map((it, i) => (
        <li
          key={it.label}
          className="relative"
          onPointerEnter={() => setHover(i)}
          onPointerLeave={() => setHover(null)}
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{it.label}</span>
            <span className="font-semibold text-slate-900 tabular-nums">{format(it.value)}</span>
          </div>
          <div className="h-2.5 rounded-r-[4px] bg-brand-900/[0.06]">
            <div
              className="h-full rounded-r-[4px] transition-[width,opacity] duration-500"
              style={{ width: `${(it.value / max) * 100}%`, background: BAR, opacity: hover === null || hover === i ? 1 : 0.45 }}
            />
          </div>
          {hover === i && (
            <div className="pointer-events-none absolute -top-9 right-0 z-10 rounded-lg border border-white/80 bg-white/90 px-2.5 py-1 text-xs whitespace-nowrap text-slate-700 shadow-lift backdrop-blur">
              <b className="text-slate-900">{format(it.value)}</b> · {t('{p}% of total', { p: Math.round((it.value / total) * 100) })}
              {it.sub && <> · {it.sub}</>}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- Panel
export function Panel({ title, subtitle, action, children, className = '' }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-ink-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
