import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'
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
  addStaff: (name: string, email: string, role: StaffRole) => Promise<void>
  updateRole: (id: string, role: StaffRole) => Promise<void>
  updateName: (id: string, name: string) => Promise<void>
  toggleActive: (id: string) => Promise<void>
  removeStaff: (id: string) => Promise<{ ok: boolean; deactivatedInstead?: boolean; error?: string }>
  setPermission: (id: string, feature: FeatureKey, allowed: boolean) => Promise<void>
}

function mapStaffRow(row: any): StaffMember {
  const role = row.role as StaffRole
  const permissions = { ...DEFAULT_PERMISSIONS[role] }
  for (const p of row.permissions ?? []) {
    if (p.feature_key in permissions) permissions[p.feature_key as FeatureKey] = p.allowed
  }
  return {
    id: row.id,
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

async function loadStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('*, permissions ( feature_key, allowed )')
    .eq('branch_id', CURRENT_BRANCH_ID)
    .order('created_at')
  if (error) {
    console.error('[staffStore] failed to load staff', error)
    return []
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

    loadStaff().then((staff) => set({ staff, loading: false }))

    supabase
      .channel(`staff:${CURRENT_BRANCH_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` }, () =>
        loadStaff().then((staff) => set({ staff }))
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'permissions' }, () => loadStaff().then((staff) => set({ staff })))
      .subscribe()
  },

  addStaff: async (name, email, role) => {
    const { error } = await supabase
      .from('staff')
      .insert({ branch_id: CURRENT_BRANCH_ID, name, email: email.trim().toLowerCase(), role, is_active: true })
    if (error) console.error('[staffStore] addStaff failed', error)
    set({ staff: await loadStaff() })
  },

  // Role changes don't touch permissions — someone's hand-picked access for
  // this person shouldn't reset just because their role label changed.
  updateRole: async (id, role) => {
    const { error } = await supabase.from('staff').update({ role }).eq('id', id)
    if (error) console.error('[staffStore] updateRole failed', error)
    set({ staff: await loadStaff() })
  },

  updateName: async (id, name) => {
    const { error } = await supabase.from('staff').update({ name }).eq('id', id)
    if (error) console.error('[staffStore] updateName failed', error)
    set({ staff: await loadStaff() })
  },

  toggleActive: async (id) => {
    const current = get().staff.find((s) => s.id === id)
    if (!current) return
    const { error } = await supabase.from('staff').update({ is_active: !current.isActive }).eq('id', id)
    if (error) console.error('[staffStore] toggleActive failed', error)
    set({ staff: await loadStaff() })
  },

  removeStaff: async (id) => {
    const { error } = await supabase.from('staff').delete().eq('id', id)
    if (error) {
      // Foreign-key violation — this person has real order/shift/purchase
      // history attached, which must stay intact. Deactivating keeps them
      // out of daily use without breaking anything they're linked to.
      if (error.code === '23503') {
        const { error: deactivateErr } = await supabase.from('staff').update({ is_active: false }).eq('id', id)
        if (deactivateErr) {
          console.error('[staffStore] fallback deactivate failed', deactivateErr)
          return { ok: false, error: 'Something went wrong removing this person.' }
        }
        set({ staff: await loadStaff() })
        return { ok: true, deactivatedInstead: true }
      }
      console.error('[staffStore] removeStaff failed', error)
      return { ok: false, error: 'Something went wrong removing this person.' }
    }
    set({ staff: await loadStaff() })
    return { ok: true }
  },

  setPermission: async (id, feature, allowed) => {
    const { error } = await supabase
      .from('permissions')
      .upsert({ staff_id: id, feature_key: feature, allowed }, { onConflict: 'staff_id,feature_key' })
    if (error) console.error('[staffStore] setPermission failed', error)
    set({ staff: await loadStaff() })
  },
}))

export { FEATURES }
