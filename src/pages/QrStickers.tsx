import { orderBy, query } from 'firebase/firestore'
import { ArrowLeft, Printer, QrCode as QrIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import QrCode from '../components/QrCode.tsx'
import { useLiveQuery } from '../hooks/useLiveQuery.ts'
import { reportUrl } from '../lib/qr.ts'
import { useT } from '../lib/settings.tsx'
import { computersCol } from '../services/admin.ts'
import type { Computer } from '../types.ts'
import { Loader } from '../components/Loading.tsx'

type Size = 'small' | 'large'

/**
 * Printable sheet of QR stickers, one per PC. Scanning a sticker opens the
 * "Report a broken computer" form with that PC already chosen.
 */
export default function QrStickers() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const q = useMemo(() => query(computersCol, orderBy('lab'), orderBy('assetTag')), [])
  const { data: computers, loading } = useLiveQuery<Computer>(q)
  const labs = useMemo(() => [...new Set(computers.map((c) => c.lab))], [computers])
  const lab = params.get('lab') ?? ''
  const [size, setSize] = useState<Size>('small')
  const list = lab ? computers.filter((c) => c.lab === lab) : computers

  return (
    <div className="space-y-6">
      <div className="space-y-4 print:hidden">
        <Link to="/computers" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
          <ArrowLeft className="size-4" /> {t('Lab Computers')}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="page-title">{t('QR stickers')}</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              {t('Print and stick one on each PC. Anyone can scan it with their phone camera to report a problem, with the PC already filled in.')}
            </p>
          </div>
          <button className="btn-primary" disabled={list.length === 0} onClick={() => window.print()}>
            <Printer /> {t('Print {n} stickers', { n: list.length })}
          </button>
        </div>
        <div className="card flex flex-wrap items-end gap-4 p-4">
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="qr-lab">{t('Lab')}</label>
            <select
              id="qr-lab"
              className="input"
              value={lab}
              onChange={(e) => setParams(e.target.value ? { lab: e.target.value } : {}, { replace: true })}
            >
              <option value="">{t('All labs')}</option>
              {labs.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <span className="label">{t('Sticker size')}</span>
            <div className="glass inline-flex rounded-xl p-1">
              {(['small', 'large'] as Size[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${size === s ? 'bg-brand-600 text-on shadow-md shadow-brand-600/30' : 'text-slate-600 hover:bg-white/70'}`}
                >
                  {s === 'small' ? t('Small (4 per row)') : t('Large (3 per row)')}
                </button>
              ))}
            </div>
          </div>
          <p className="basis-full text-xs text-slate-500">{t('Tip: in the print window, turn off “Headers and footers” for a clean sheet.')}</p>
        </div>
      </div>

      {loading ? (
        <Loader />
      ) : list.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-14 text-center print:hidden">
          <div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600"><QrIcon className="size-6" /></div>
          <div className="font-semibold text-slate-800">{t('No computers yet')}</div>
        </div>
      ) : (
        <div className={`grid gap-3 print:gap-[4mm] ${size === 'small' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3'}`}>
          {list.map((c) => (
            <div
              key={c.id}
              className="flex break-inside-avoid flex-col items-center rounded-2xl border-2 border-dashed border-[#9db3cf] bg-[#fff] p-3 text-center text-[#0b1b33] shadow-sm print:rounded-lg print:shadow-none"
            >
              <div className="flex w-full items-center justify-between text-[10px] font-bold tracking-wide text-[#1f5fbf] uppercase">
                <span>LabFix</span>
                <span className="truncate pl-2 font-semibold text-[#5b6b82] normal-case">{c.lab}</span>
              </div>
              <QrCode value={reportUrl(c.id)} label={t('QR code for {pc}', { pc: c.assetTag })} className={`mt-1.5 ${size === 'small' ? 'w-[78%]' : 'w-[70%]'}`} />
              <div className={`mt-1.5 font-mono font-extrabold tracking-tight ${size === 'small' ? 'text-base' : 'text-xl'}`}>{c.assetTag}</div>
              {c.location && <div className="text-[11px] text-[#5b6b82]">{c.location}</div>}
              <div className="mt-1.5 w-full rounded-md bg-[#0b1b33] px-2 py-1 text-[11px] leading-tight font-bold text-[#fff]">
                {t('PC not working? Scan to report')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
