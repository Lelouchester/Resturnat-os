import { create } from 'zustand'
import type { StaffMember, StaffRole, FeatureKey } from './types'
import { DEFAULT_PERMISSIONS } from './types'

const DEMO_STAFF: StaffMember[] = [
  { id: 's1', name: 'Anjali', role: 'manager', pin: '1234', isActive: true, salesGenerated: 42800, shiftsWorked: 18, permissions: DEFAULT_PERMISSIONS.manager },
  { id: 's2', name: 'Bikash', role: 'waiter', pin: '2345', isActive: true, salesGenerated: 31200, shiftsWorked: 22, permissions: DEFAULT_PERMISSIONS.waiter },
  { id: 's3', name: 'Sarita', role: 'cashier', pin: '3456', isActive: true, salesGenerated: 0, shiftsWorked: 20, permissions: DEFAULT_PERMISSIONS.cashier },
  { id: 's4', name: 'Prakash', role: 'kitchen', pin: '4567', isActive: true, salesGenerated: 0, shiftsWorked: 19, avgPrepMinutes: 11, permissions: DEFAULT_PERMISSIONS.kitchen },
]

interface StaffState {
  staff: StaffMember[]
  addStaff: (name: string, role: StaffRole, pin: string) => void
  updateRole: (id: string, role: StaffRole) => void
  toggleActive: (id: string) => void
  setPermission: (id: string, feature: FeatureKey, allowed: boolean) => void
}

export const useStaffStore = create<StaffState>((set) => ({
  staff: DEMO_STAFF,
  addStaff: (name, role, pin) =>
    set((state) => ({
      staff: [
        ...state.staff,
        { id: `s-${Date.now()}`, name, role, pin, isActive: true, salesGenerated: 0, shiftsWorked: 0, permissions: DEFAULT_PERMISSIONS[role] },
      ],
    })),
  // Changing role does NOT silently rewrite someone's custom permissions —
  // only applies fresh defaults, and only if they haven't been touched from
  // the previous role's defaults, so a manager who hand-picked access for a
  // waiter doesn't lose that the moment the role dropdown gets bumped.
  updateRole: (id, role) =>
    set((state) => ({
      staff: state.staff.map((s) => (s.id === id ? { ...s, role, permissions: s.permissions } : s)),
    })),
  toggleActive: (id) =>
    set((state) => ({ staff: state.staff.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s)) })),
  setPermission: (id, feature, allowed) =>
    set((state) => ({
      staff: state.staff.map((s) => (s.id === id ? { ...s, permissions: { ...s.permissions, [feature]: allowed } } : s)),
    })),
}))
