import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth.tsx'
import { runDueSchedules } from '../services/schedules.ts'

const EVERY = 10 * 60_000

/**
 * While an admin has LabFix open, create tickets for planned maintenance
 * that has come due (on open, then every 10 minutes). Renders nothing.
 */
export default function ScheduleRunner() {
  const { actor, isAdmin } = useAuth()
  const uid = actor?.uid
  const name = actor?.name
  useEffect(() => {
    if (!isAdmin || !uid || !name) return
    const run = () => runDueSchedules({ uid, name }).catch(() => {})
    const first = setTimeout(run, 3000) // let the page's own data load first
    const id = setInterval(run, EVERY)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [isAdmin, uid, name])
  return null
}
