import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'
import type { StaffMember, StaffRole, FeatureKey } from './types'
import { DEFAULT_PERMISSIONS, FEATURES } from './types'

/**
 * Real data now. A staff member added here has no login yet — auth_user_id
 * stays null until the person actually signs in with the matching Google
 * account for the first time (see authStore.link_staff_account). Until
 * then they simply can't get past the login screen, which is the point:
 * management pre-approves who's allowed in by adding them here first.
 */
interface StaffState {
  staff: StaffMember[]
  loading: boolean
  initialized: boolean
  init: () => void
  addStaff: (name: string, email: string, role: StaffRole) => Promise<StaffResult>
  updateRole: (id: string, role: StaffRole) => Promise<StaffResult>
  updateName: (id: string, name: string) => Promise<StaffResult>
  toggleActive: (id: string) => Promise<StaffResult>
  removeStaff: (id: string) => Promise<StaffResult & { deactivatedInstead?: boolean }>
  setPermission: (id: string, feature: FeatureKey, allowed: boolean) => Promise<StaffResult>
}

export interface StaffResult {
  ok: boolean
  error?: string
}

// Turns a database refusal into something a person can act on. The
// messages the database raises itself (SQLSTATE P0001) are already written
// for people, so they're passed straight through.
function explain(error: { code?: string; message?: string }): string {
  if (error.code === 'P0001' && error.message) return error.message
  if (error.code === '23505') return 'Someone in this cafe already has that email.'
  if (error.code === '42501') return "You don't have permission to do that — only someone above a person's level can change them."
  return 'Something went wrong — please try again.'
}

// An UPDATE/DELETE the database refuses on row-level-security grounds
// doesn't error — it just matches zero rows. Treat "changed nothing" as a
// refusal so the person is told, instead of the switch silently snapping back.
const NOT_ALLOWED = "You don't have permission to change this person — only someone above their level (or an administrator) can."


function mapStaffRow(row: any): StaffMember {
  const role = row.role as StaffRole
  const permissions = { ...DEFAULT_PERMISSIONS[role] }
  // An administrator can never be switched off from anything (the database
  // ignores overrides for them too), so neither does the app.
  if (role !== 'admin') {
    for (const p of row.permissions ?? []) {
      if (p.feature_key in permissions) permissions[p.feature_key as FeatureKey] = p.allowed
    }
  }
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    email: row.email ?? undefined,
    role,
    pin: '',
    isActive: row.is_active,
    hasSignedIn: row.auth_user_id != null,
    salesGenerated: Number(row.sales_generated) || 0,
    shiftsWorked: row.shifts_worked ?? 0,
    avgPrepMinutes: row.avg_prep_minutes ? Number(row.avg_prep_minutes) : undefined,
    permissions,
  }
}

// null (not []) on failure, so a dropped connection never blanks the list.
async function loadStaff(): Promise<StaffMember[] | null> {
  const { data, error } = await supabase
    .from('staff')
    .select('*, permissions ( feature_key, allowed )')
    .eq('branch_id', currentBranchId())
    .order('created_at')
  if (error) {
    console.error('[staffStore] failed to load staff', error)
    return null
  }
  return (data ?? []).map(mapStaffRow)
}

export const useStaffStore = create<StaffState>((set, get) => ({
  staff: [],
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    const refresh = () =>
      loadStaff().then((staff) => {
        if (staff) set({ staff })
      })

    loadStaff().then((staff) => set({ staff: staff ?? get().staff, loading: false }))

    supabase
      .channel(`staff:${currentBranchId()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff', filter: `branch_id=eq.${currentBranchId()}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permissions' }, refresh)
      .subscribe()
  },

  addStaff: async (name, email, role) => {
    const { error } = await supabase
      .from('staff')
      .insert({ branch_id: currentBranchId(), name, email: email.trim().toLowerCase(), role, is_active: true })
    if (error) {
      console.error('[staffStore] addStaff failed', error)
      return { ok: false, error: explain(error) }
    }
    const staff = await loadStaff()
    if (staff) set({ staff })
    return { ok: true }
  },

  // Role changes don't touch permissions — someone's hand-picked access for
  // this person shouldn't reset just because their role label changed.
  updateRole: async (id, role) => updateRow(set, id, { role }),

  updateName: async (id, name) => updateRow(set, id, { name }),

  toggleActive: async (id) => {
    const current = get().staff.find((s) => s.id === id)
    if (!current) return { ok: false, error: 'That person is no longer in the list.' }
    return updateRow(set, id, { is_active: !current.isActive })
  },

  removeStaff: async (id) => {
    const { data, error } = await supabase.from('staff').delete().eq('id', id).select('id')
    if (error) {
      // Foreign-key violation — this person has real order/shift/purchase
      // history attached, which must stay intact. Deactivating keeps them
      // out of daily use without breaking anything they're linked to.
      if (error.code === '23503') {
        const result = await updateRow(set, id, { is_active: false })
        return result.ok ? { ok: true, deactivatedInstead: true } : result
      }
      console.error('[staffStore] removeStaff failed', error)
      return { ok: false, error: explain(error) }
    }
    if (!data || data.length === 0) return { ok: false, error: NOT_ALLOWED }
    const staff = await loadStaff()
    if (staff) set({ staff })
    return { ok: true }
  },

  setPermission: async (id, feature, allowed) => {
    const { error } = await supabase
      .from('permissions')
      .upsert({ staff_id: id, feature_key: feature, allowed }, { onConflict: 'staff_id,feature_key' })
    if (error) {
      console.error('[staffStore] setPermission failed', error)
      return { ok: false, error: explain(error) }
    }
    const staff = await loadStaff()
    if (staff) set({ staff })
    return { ok: true }
  },
}))

async function updateRow(
  set: (partial: Partial<StaffState>) => void,
  id: string,
  patch: Record<string, unknown>
): Promise<StaffResult> {
  const { data, error } = await supabase.from('staff').update(patch).eq('id', id).select('id')
  if (error) {
    console.error('[staffStore] update failed', error)
    return { ok: false, error: explain(error) }
  }
  if (!data || data.length === 0) return { ok: false, error: NOT_ALLOWED }
  const staff = await loadStaff()
  if (staff) set({ staff })
  return { ok: true }
}

export { FEATURES }
