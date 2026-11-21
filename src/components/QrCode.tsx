import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/**
 * Crisp SVG QR code. Always black on white (scanners and printers need the
 * contrast), whatever the colour mode.
 */
export default function QrCode({ value, className = '', label }: { value: string; className?: string; label?: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let live = true
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(''))
    return () => {
      live = false
    }
  }, [value])
  return (
    <div
      role="img"
      aria-label={label ?? value}
      className={`aspect-square bg-[#fff] [&>svg]:block [&>svg]:size-full ${className}`}
      // The SVG markup is generated locally by the qrcode library from our own URL.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/** PNG download of a QR code (for pasting into documents). */
export async function downloadQrPng(value: string, fileName: string): Promise<void> {
  const url = await QRCode.toDataURL(value, { width: 768, margin: 2, errorCorrectionLevel: 'M' })
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
}
