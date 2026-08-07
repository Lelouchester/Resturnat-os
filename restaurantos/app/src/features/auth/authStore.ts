import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../shared/lib/supabase'
import type { StaffMember, StaffRole } from '../staff/types'
import { DEFAULT_PERMISSIONS, FEATURES } from '../staff/types'

export type AuthStatus = 'loading' | 'signed_out' | 'unauthorized' | 'signed_in'

// Persisted across the Google OAuth redirect (the page fully navigates away
// and back, so in-memory state doesn't survive) — this is how the app knows
// which cafe someone meant to sign into, entered right before they left for
// Google. Prefilled on return visits so people don't have to retype it every
// time, though they can always change it.
const CAFE_CODE_KEY = 'restaurantos_cafe_code'

export function getSavedCafeCode(): string {
  return localStorage.getItem(CAFE_CODE_KEY) ?? ''
}

function saveCafeCode(code: string) {
  localStorage.setItem(CAFE_CODE_KEY, code.trim().toLowerCase())
}

// Used by the login screen to confirm a typed code resolves to a real cafe
// *before* sending someone off to Google — this query works even fully
// signed out, since branches has a deliberately public policy for exactly
// this lookup (see schema.sql).
export async function lookupCafeByCode(code: string): Promise<{ id: string; name: string } | null> {
  const trimmed = code.trim().toLowerCase()
  if (!trimmed) return null
  const { data, error } = await supabase.from('branches').select('id, name').ilike('code', trimmed).maybeSingle()
  if (error) {
    console.error('[authStore] lookupCafeByCode failed', error)
    return null
  }
  return data
}

interface AuthState {
  status: AuthStatus
  session: Session | null
  staff: StaffMember | null
  init: () => void
  signInWithGoogle: (cafeCode: string) => Promise<void>
  signOut: () => Promise<void>
}

async function resolveStaffForSession(session: Session): Promise<StaffMember | null> {
  const code = getSavedCafeCode()
  const cafe = code ? await lookupCafeByCode(code) : null

  // Idempotent — claims this person's staff row (matched by their verified
  // Google email, scoped to the cafe code they entered) the first time they
  // ever sign in. A no-op on every sign-in after that since auth_user_id is
  // already set. The code is what makes it safe for the same email to exist
  // as staff in more than one cafe — without it, which row gets claimed
  // would be ambiguous.
  const { error: linkErr } = await supabase.rpc('link_staff_account', { p_code: code || null })
  if (linkErr) console.error('[authStore] link_staff_account failed', linkErr)

  let query = supabase
    .from('staff')
    .select('*, permissions ( feature_key, allowed )')
    .eq('auth_user_id', session.user.id)
    .eq('is_active', true)
  if (cafe) query = query.eq('branch_id', cafe.id)

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error('[authStore] staff lookup failed', error)
    return null
  }
  if (!data) return null

  const role = data.role as StaffRole
  const permissions = { ...DEFAULT_PERMISSIONS[role] }
  for (const p of data.permissions ?? []) {
    if (p.feature_key in permissions) permissions[p.feature_key as keyof typeof permissions] = p.allowed
  }

  return {
    id: data.id,
    branchId: data.branch_id,
    name: data.name,
    role,
    pin: '', // never sent to the client — real PINs, if used at all, stay server-side
    isActive: data.is_active,
    hasSignedIn: true, // resolving this staff member at all means auth_user_id already matched
    salesGenerated: Number(data.sales_generated) || 0,
    shiftsWorked: data.shifts_worked ?? 0,
    avgPrepMinutes: data.avg_prep_minutes ? Number(data.avg_prep_minutes) : undefined,
    permissions,
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  session: null,
  staff: null,

  init: () => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        set({ status: 'signed_out', session: null, staff: null })
        return
      }
      const staff = await resolveStaffForSession(session)
      set({ session, staff, status: staff ? 'signed_in' : 'unauthorized' })
    })

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        set({ status: 'signed_out', session: null, staff: null })
        return
      }
      const staff = await resolveStaffForSession(session)
      set({ session, staff, status: staff ? 'signed_in' : 'unauthorized' })
    })
  },

  signInWithGoogle: async (cafeCode: string) => {
    saveCafeCode(cafeCode)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) console.error('[authStore] Google sign-in failed', error)
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ status: 'signed_out', session: null, staff: null })
  },
}))

// Re-exported so FEATURES stays a single source of truth between staff/types
// and anything checking permissions.
export { FEATURES }

/**
 * Which cafe the signed-in person belongs to — reads fresh every call, never
 * cache this in a module-level constant, since it needs to reflect whoever's
 * actually signed in right now. Every store's init()/query only runs after
 * auth has settled, so this should never actually be called before a staff
 * member is resolved — if it is, that's a real bug worth seeing loudly
 * (wrong-cafe data leaking silently would be far worse than a thrown error).
 */
export function currentBranchId(): string {
  const branchId = useAuthStore.getState().staff?.branchId
  if (!branchId) {
    throw new Error('currentBranchId() called before a staff member was resolved — check this runs after sign-in.')
  }
  return branchId
}
