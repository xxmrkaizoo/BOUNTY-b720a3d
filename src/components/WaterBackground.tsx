/** Soft, slowly drifting blue "water" behind the frosted-glass UI. */
export default function WaterBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-[#eaf3ff] via-[#dcebfd] to-[#cfe6fb] dark:from-[#050d22] dark:via-[#071530] dark:to-[#0a1d3d]" />
      <div className="absolute -top-[20%] -left-[10%] size-[55vw] animate-drift rounded-full bg-brand-400/35 blur-[120px] dark:bg-brand-600/25" />
      <div className="absolute top-[30%] -right-[15%] size-[50vw] animate-drift rounded-full bg-accent-400/30 blur-[120px] dark:bg-accent-500/15 [animation-delay:-8s]" />
      <div className="absolute -bottom-[25%] left-[20%] size-[45vw] animate-drift rounded-full bg-brand-600/20 blur-[120px] [animation-delay:-15s]" />
      {/* gentle wave lines */}
      <svg className="absolute bottom-0 left-0 h-48 w-full text-white/40 dark:text-[rgb(255_255_255/0.03)]" viewBox="0 0 1440 200" preserveAspectRatio="none">
        <path fill="currentColor" d="M0 120c120-30 240-30 360 0s240 30 360 0 240-30 360 0 240 30 360 0v80H0z" />
        <path fill="currentColor" opacity=".6" d="M0 150c140-25 280-25 420 0s280 25 420 0 280-25 420 0 120 15 180 10v40H0z" />
      </svg>
    </div>
  )
}
