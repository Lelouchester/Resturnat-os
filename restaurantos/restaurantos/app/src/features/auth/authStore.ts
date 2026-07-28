import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'
import type { StaffMember, StaffRole } from '../staff/types'
import { DEFAULT_PERMISSIONS, FEATURES } from '../staff/types'

export type AuthStatus = 'loading' | 'signed_out' | 'unauthorized' | 'signed_in'

interface AuthState {
  status: AuthStatus
  session: Session | null
  staff: StaffMember | null
  init: () => void
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

async function resolveStaffForSession(session: Session): Promise<StaffMember | null> {
  // Idempotent — claims this person's staff row (matched by their verified
  // Google email) the first time they ever sign in. A no-op on every sign-in
  // after that since auth_user_id is already set.
  const { error: linkErr } = await supabase.rpc('link_staff_account')
  if (linkErr) console.error('[authStore] link_staff_account failed', linkErr)

  const { data, error } = await supabase
    .from('staff')
    .select('*, permissions ( feature_key, allowed )')
    .eq('branch_id', CURRENT_BRANCH_ID)
    .eq('auth_user_id', session.user.id)
    .eq('is_active', true)
    .maybeSingle()

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

  signInWithGoogle: async () => {
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
