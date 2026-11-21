import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../lib/settings.tsx'
import { useSeries, type LineSeries } from './charts.tsx'

/**
 * 3D bar view of a time series (one row of bars per series), drawn in SVG
 * with a small hand-rolled projection: bars grow in, the camera sways
 * gently, drag to rotate, hover a bar for its numbers.
 * Respects "reduce motion" (no growth, no sway).
 */

const DEG = Math.PI / 180
const easeOut = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3

function niceMax(v: number) {
  if (v <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow
  return 10 * pow
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

type P3 = [number, number, number]

export function Chart3D({ labels, tooltipLabels, series, height = 320, unit = '' }: { labels: string[]; tooltipLabels?: string[]; series: LineSeries[]; height?: number; unit?: string }) {
  const t = useT()
  const COLORS = useSeries()
  const reduced = useReducedMotion()
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [yawBase, setYawBase] = useState(-20)
  const [pitch, setPitch] = useState(24)
  const [auto, setAuto] = useState(true)
  const [clock, setClock] = useState(0) // seconds since mount, drives sway
  const [grow, setGrow] = useState(reduced ? 1 : 0)
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Replay the growth animation whenever the data changes.
  const dataKey = series.map((s) => s.values.join(',')).join('|')
  const [shownKey, setShownKey] = useState(dataKey)
  if (dataKey !== shownKey) {
    setShownKey(dataKey)
    setGrow(reduced ? 1 : 0)
  }

  // One animation loop for growth + sway; stops when there is nothing to animate.
  const swaying = auto && !reduced && !hover
  const growing = grow < 1
  useEffect(() => {
    if (!swaying && !growing) return
    let raf = 0
    let last: number | null = null
    const tick = (now: number) => {
      // first frame only sets the clock; cap steps so a background tab doesn't jump
      const dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000)
      last = now
      setGrow((g) => (g >= 1 ? 1 : Math.min(1, g + dt / 1.1)))
      if (swaying) setClock((c) => c + dt)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [swaying, growing])

  const yaw = yawBase + (auto && !reduced ? 12 * Math.sin(clock * 0.5) : 0)
  const n = labels.length
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)))
  const rows = series.length

  // ---- world layout: x = time, z = series row (0 = front), y = value
  const GAP = 1
  const BW = 0.62 // bar width along time
  const BD = 0.62 // bar depth
  const ROW = 1.15
  const WORLD_H = Math.max(3.5, Math.min(12, n * 0.5))
  const x0 = -((n - 1) * GAP) / 2
  const z0 = -((rows - 1) * ROW) / 2
  const sy = (v: number) => (v / max) * WORLD_H

  const geo = useMemo(() => {
    const cy = Math.cos(yaw * DEG)
    const sny = Math.sin(yaw * DEG)
    const cp = Math.cos(pitch * DEG)
    const sp = Math.sin(pitch * DEG)
    // Rotate around the vertical axis (yaw), then tilt the camera down (pitch).
    // Screen y grows downward; farther points (larger z) sit higher. d = depth for painting.
    const proj = ([x, y, z]: P3) => {
      const xr = x * cy - z * sny
      const zr = x * sny + z * cy
      return { x: xr, y: -(y * cp) - zr * sp, d: zr }
    }

    // fit everything (incl. full-height bars) into the viewport
    const xMin = x0 - 0.8
    const xMax = x0 + (n - 1) * GAP + 0.8
    const zMin = z0 - 0.7
    const zMax = z0 + (rows - 1) * ROW + 0.7
    const corners: P3[] = []
    for (const x of [xMin, xMax]) for (const z of [zMin, zMax]) for (const y of [0, WORLD_H]) corners.push([x, y, z])
    const pts = corners.map(proj)
    const bx0 = Math.min(...pts.map((p) => p.x))
    const bx1 = Math.max(...pts.map((p) => p.x))
    const by0 = Math.min(...pts.map((p) => p.y))
    const by1 = Math.max(...pts.map((p) => p.y))
    const PAD = { l: 34, r: 14, t: 14, b: 30 }
    const scale = Math.min((width - PAD.l - PAD.r) / (bx1 - bx0), (height - PAD.t - PAD.b) / (by1 - by0))
    const ox = PAD.l + ((width - PAD.l - PAD.r) - (bx1 - bx0) * scale) / 2 - bx0 * scale
    const oy = PAD.t + ((height - PAD.t - PAD.b) - (by1 - by0) * scale) / 2 - by0 * scale
    const S = (p: P3) => {
      const q = proj(p)
      return { x: ox + q.x * scale, y: oy + q.y * scale, d: q.d }
    }
    return { S, xMin, xMax, zMin, zMax, sny, cy }
  }, [yaw, pitch, width, height, n, rows, x0, z0, WORLD_H])

  const { S, xMin, xMax, zMin, zMax, sny, cy } = geo
  const poly = (ps: P3[]) => ps.map((p) => { const s = S(p); return `${s.x.toFixed(1)},${s.y.toFixed(1)}` }).join(' ')

  // ---- bars, painted back to front
  type Bar = { i: number; si: number; h: number; d: number; cx: number; cz: number }
  const bars: Bar[] = []
  series.forEach((s, si) =>
    s.values.forEach((v, i) => {
      const stagger = easeOut(grow * 1.6 - (i / Math.max(1, n)) * 0.6)
      const cx = x0 + i * GAP
      const cz = z0 + si * ROW
      bars.push({ i, si, h: sy(v) * stagger, d: S([cx, 0, cz]).d, cx, cz })
    }),
  )
  bars.sort((a, b) => b.d - a.d)

  // Which side faces point at the viewer for this yaw (normal's rotated z < 0).
  const faceVisible = (nx: number, nz: number) => nx * sny + nz * cy < 0
  const showFront = faceVisible(0, -1)
  const showLeft = faceVisible(-1, 0)
  const showRight = faceVisible(1, 0)

  const shade = (c: string, k: number) => (k >= 0 ? `color-mix(in srgb, ${c} ${100 - k}%, white)` : `color-mix(in srgb, ${c} ${100 + k}%, black)`)

  // ---- axes: value grid on the back wall, time labels along the front edge
  const ticks = [0, max / 2, max]
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(width / 80))))
  const xl: number[] = []
  for (let i = 0; i < n; i += every) xl.push(i)
  if (n > 1 && xl[xl.length - 1] !== n - 1) {
    if (n - 1 - xl[xl.length - 1] < every / 2) xl.pop()
    xl.push(n - 1)
  }

  function onDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, yaw, pitch }
    setAuto(false)
    setYawBase(yaw)
    setHover(null)
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    setYawBase(Math.max(-70, Math.min(70, d.yaw + (e.clientX - d.x) * 0.45)))
    setPitch(Math.max(8, Math.min(65, d.pitch + (e.clientY - d.y) * 0.3)))
  }
  const onUp = () => (drag.current = null)

  return (
    <div ref={wrap} className="relative select-none">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${series.map((s) => s.name).join(' / ')} – 3D`}
        className="cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* floor */}
        <polygon points={poly([[xMin, 0, zMin], [xMax, 0, zMin], [xMax, 0, zMax], [xMin, 0, zMax]])} className="fill-slate-900/[0.035] stroke-slate-900/10" />
        {/* back wall grid + value labels */}
        {ticks.map((v) => {
          const a = S([xMin, sy(v), zMax])
          const b = S([xMax, sy(v), zMax])
          return (
            <g key={v}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-slate-900/10" strokeDasharray={v === 0 ? undefined : '3 4'} />
              <text x={a.x - 6} y={a.y} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[11px]">
                {Number.isInteger(v) ? v : v.toFixed(1)}
              </text>
            </g>
          )
        })}

        {bars.map((b) => {
          const c = COLORS[b.si]
          const xa = b.cx - BW / 2
          const xb = b.cx + BW / 2
          const za = b.cz - BD / 2
          const zb = b.cz + BD / 2
          const h = Math.max(0.0001, b.h)
          const dim = hover && hover.i !== b.i ? 0.35 : 1
          return (
            <g
              key={`${b.si}-${b.i}`}
              opacity={dim}
              className="transition-opacity duration-150"
              onPointerEnter={() => {
                if (drag.current) return
                const top = S([b.cx, b.h, b.cz])
                setHover({ i: b.i, x: top.x, y: top.y })
              }}
              onPointerLeave={() => setHover(null)}
            >
              {showLeft && <polygon points={poly([[xa, 0, za], [xa, 0, zb], [xa, h, zb], [xa, h, za]])} fill={shade(c, -28)} />}
              {showRight && <polygon points={poly([[xb, 0, za], [xb, 0, zb], [xb, h, zb], [xb, h, za]])} fill={shade(c, -28)} />}
              {showFront && <polygon points={poly([[xa, 0, za], [xb, 0, za], [xb, h, za], [xa, h, za]])} fill={c} />}
              <polygon points={poly([[xa, h, za], [xb, h, za], [xb, h, zb], [xa, h, zb]])} fill={shade(c, 35)} />
            </g>
          )
        })}

        {/* time labels along the front edge */}
        {(() => {
          // drop labels that would collide on screen (the last one always wins)
          const pts = xl.map((i) => ({ i, p: S([x0 + i * GAP, 0, zMin - 0.15]) }))
          const keep: typeof pts = []
          for (let k = pts.length - 1; k >= 0; k--) {
            const last = keep[keep.length - 1]
            if (!last || Math.hypot(last.p.x - pts[k].p.x, last.p.y - pts[k].p.y) > 58) keep.push(pts[k])
          }
          return keep.map(({ i, p }) => (
            <text key={i} x={p.x} y={p.y + 14} textAnchor="middle" className="fill-slate-400 text-[11px]">
              {labels[i]}
            </text>
          ))
        })()}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-xs shadow-lift backdrop-blur"
          style={{ left: Math.min(Math.max(hover.x, 80), width - 80), top: Math.max(56, hover.y - 8) }}
        >
          <div className="mb-1 font-semibold text-slate-900">{tooltipLabels?.[hover.i] ?? labels[hover.i]}</div>
          {series.map((s, si) => (
            <div key={s.name} className="flex items-center gap-2 text-slate-600">
              <span className="size-2.5 rounded-sm" style={{ background: COLORS[si] }} />
              {s.name}
              <span className="ml-auto pl-3 font-semibold text-slate-900 tabular-nums">
                {s.values[hover.i]}
                {unit}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">{t('Drag to rotate')}</span>
        {!reduced && (
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setYawBase(yaw); setClock(0); setAuto((a) => !a) }}>
            {auto ? <Pause /> : <Play />} {auto ? t('Pause motion') : t('Play motion')}
          </button>
        )}
        <button
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => {
            setYawBase(-20)
            setPitch(24)
            setClock(0)
            setGrow(reduced ? 1 : 0)
          }}
        >
          <RotateCcw /> {t('Reset view')}
        </button>
      </div>
    </div>
  )
}
