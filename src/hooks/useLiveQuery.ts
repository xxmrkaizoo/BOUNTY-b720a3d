import { onSnapshot, type DocumentReference, type FirestoreError, type Query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { fromDoc } from '../lib/format.ts'

/**
 * Firestore listeners stop for good after an error. Right after sign-up or a
 * role change, the security rules can briefly deny a query, so retry a few
 * times (0.8s, 1.6s, 3.2s) before showing the error.
 */
export function listenWithRetry(start: (onError: (e: FirestoreError) => void) => () => void, fail: (e: FirestoreError) => void) {
  let unsub = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let attempt = 0
  let stopped = false
  const run = () => {
    unsub = start((e) => {
      if (!stopped && e.code === 'permission-denied' && attempt < 3) {
        timer = setTimeout(run, 800 * 2 ** attempt++)
      } else fail(e)
    })
  }
  run()
  return () => {
    stopped = true
    clearTimeout(timer)
    unsub()
  }
}

interface LiveState<T> {
  data: T
  loading: boolean
  error: Error | null
}

/**
 * Real-time list from a Firestore query. Pass a memoized query (useMemo),
 * or null to skip.
 */
export function useLiveQuery<T>(q: Query | null): LiveState<T[]> {
  const [state, setState] = useState<LiveState<T[]>>({ data: [], loading: true, error: null })

  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true }))
    return listenWithRetry(
      (onError) =>
        onSnapshot(
          q,
          (snap) => setState({ data: snap.docs.map((d) => fromDoc<T>(d)), loading: false, error: null }),
          onError,
        ),
      (error) => setState({ data: [], loading: false, error }),
    )
  }, [q])

  return state
}

/** Real-time single document. Pass a memoized ref, or null to skip. */
export function useLiveDoc<T>(ref: DocumentReference | null): LiveState<T | null> {
  const [state, setState] = useState<LiveState<T | null>>({ data: null, loading: true, error: null })

  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true }))
    return listenWithRetry(
      (onError) =>
        onSnapshot(
          ref,
          (snap) => setState({ data: snap.exists() ? fromDoc<T>(snap) : null, loading: false, error: null }),
          onError,
        ),
      (error) => setState({ data: null, loading: false, error }),
    )
  }, [ref])

  return state
}
