/** Short link printed in a PC's QR sticker. /r/:id opens the report form for that PC. */
export function reportUrl(computerId: string): string {
  return `${window.location.origin}/r/${computerId}`
}
