import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { auth, db } from '../lib/firebase.ts'
import { fromDoc } from '../lib/format.ts'
import type { Actor, UserProfile } from '../types.ts'

/** Invite being accepted: the new account becomes a technician of this company. */
export interface PendingInvite {
  code: string
  vendorId: string
  vendorName: string
}
const INVITE_KEY = 'labfix.pendingInvite'
function readStoredInvite(): PendingInvite | null {
  try {
    const raw = sessionStorage.getItem(INVITE_KEY)
    return raw ? (JSON.parse(raw) as PendingInvite) : null
  } catch {
    return null
  }
}
function storeInvite(invite: PendingInvite | null) {
  try {
    if (invite) sessionStorage.setItem(INVITE_KEY, JSON.stringify(invite))
    else sessionStorage.removeItem(INVITE_KEY)
  } catch {
    /* storage unavailable: popup flow still works via the ref */
  }
}

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isAdmin: boolean
  /** Lab staff or admin (not a maintenance technician). */
  isInternal: boolean
  isTechnician: boolean
  /** Set when the profile could not be created (e.g. an invalid invite link). */
  profileError: string | null
  /** The account was deleted by an admin. */
  removed: boolean
  actor: Actor | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string, invite?: PendingInvite) => Promise<void>
  signInWithGoogle: (invite?: PendingInvite) => Promise<void>
  /** Emails a password-reset link. `returnTo` is the page to come back to afterwards. */
  resetPassword: (email: string, returnTo?: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  // Name typed on the sign-up form, used when the profile doc is first created.
  const pendingName = useRef<string | null>(null)
  const pendingInvite = useRef<PendingInvite | null>(readStoredInvite())
  const [profileError, setProfileError] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  // Create the profile at most once per signed-in user (no retry loop if the rules reject it).
  const createdFor = useRef<string | null>(null)

  useEffect(() => {
    let unsubProfile: (() => void) | undefined
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      unsubProfile?.()
      setUser(u)
      if (!u) {
        setProfile(null)
        setLoading(false)
        return
      }
      setLoading(true)
      unsubProfile = onSnapshot(
        doc(db, 'users', u.uid),
        // Metadata changes let us see when a new profile is confirmed by the server.
        { includeMetadataChanges: true },
        async (snap) => {
          // A just-created profile is shown from the local cache before the server
          // has saved it. The security rules read the profile on the server, so wait
          // for the confirmed copy before any page starts querying data.
          if (snap.metadata.hasPendingWrites) return
          if (snap.exists()) {
            setProfile(fromDoc<UserProfile>(snap))
            setProfileError(null)
            setRemoved(false)
            setLoading(false)
          } else {
            setProfile(null)
            // No profile: either a brand-new account, or an admin deleted it.
            const tomb = await getDoc(doc(db, 'deletedUsers', u.uid)).catch(() => null)
            if (tomb?.exists()) {
              setRemoved(true)
              setProfileError('Your LabFix account was removed by a lab admin.')
              setLoading(false)
              return
            }
            if (createdFor.current === u.uid) {
              setLoading(false)
              return
            }
            createdFor.current = u.uid
            // First login: create the profile. This is the only place a profile is
            // created, so there is no write race. An invite makes it a technician.
            const invite = pendingInvite.current
            const base = {
              name: pendingName.current || u.displayName || u.email?.split('@')[0] || 'User',
              email: u.email ?? '',
              createdAt: serverTimestamp(),
            }
            const data = invite
              ? { ...base, role: 'technician', vendorId: invite.vendorId, vendorName: invite.vendorName, inviteCode: invite.code }
              : { ...base, role: 'staff' }
            await setDoc(doc(db, 'users', u.uid), data)
              .then(() => {
                pendingInvite.current = null
                storeInvite(null)
              })
              .catch(() => {
                setProfileError(invite ? 'This invite link is no longer valid. Ask the lab for a new one.' : 'Could not create your profile.')
                setLoading(false)
              })
          }
        },
        () => setLoading(false),
      )
    })
    return () => {
      unsubProfile?.()
      unsubAuth()
    }
  }, [])

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isInternal: profile?.role === 'admin' || profile?.role === 'staff',
    isTechnician: profile?.role === 'technician',
    profileError,
    removed,
    actor: user && profile ? { uid: user.uid, name: profile.name } : null,
    async signIn(email, password) {
      await signInWithEmailAndPassword(auth, email, password)
    },
    async signUp(name, email, password, invite) {
      pendingName.current = name.trim()
      pendingInvite.current = invite ?? null
      storeInvite(invite ?? null)
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName: name.trim() })
    },
    async signInWithGoogle(invite) {
      pendingInvite.current = invite ?? null
      storeInvite(invite ?? null)
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      try {
        await signInWithPopup(auth, provider)
      } catch (e) {
        // Some mobile browsers block popups. Fall back to a full-page redirect.
        if ((e as { code?: string }).code === 'auth/popup-blocked') {
          await signInWithRedirect(auth, provider)
          return
        }
        throw e
      }
    },
    async resetPassword(email, returnTo = '/login') {
      await sendPasswordResetEmail(auth, email.trim(), {
        url: new URL(returnTo, window.location.origin).toString(),
      })
    },
    async signOut() {
      createdFor.current = null
      setRemoved(false)
      pendingInvite.current = null
      storeInvite(null)
      setProfileError(null)
      await fbSignOut(auth)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
