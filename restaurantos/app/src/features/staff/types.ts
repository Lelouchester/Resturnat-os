export type StaffRole = 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'store'

export const FEATURES = [
  { key: 'tables', label: 'Floor / Tables' },
  { key: 'orders', label: 'Orders' },
  { key: 'kitchen', label: 'Kitchen display' },
  { key: 'billing', label: 'Billing' },
  { key: 'shifts', label: 'Shift open/close' },
  { key: 'menu', label: 'Menu editor' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'purchasing', label: 'Purchasing' },
  { key: 'customers', label: 'Customers' },
  { key: 'staff', label: 'Staff management' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
  { key: 'financials', label: 'Bank account, transfers & full sales history' },
] as const

export type FeatureKey = (typeof FEATURES)[number]['key']

export type Permissions = Record<FeatureKey, boolean>

// Sensible starting point per role — every one of these is still editable
// per person afterward, this is just what a new hire starts with.
export const DEFAULT_PERMISSIONS: Record<StaffRole, Permissions> = {
  admin: allTrue(),
  manager: allTrue(),
  cashier: only(['tables', 'orders', 'billing', 'shifts', 'customers']),
  waiter: only(['tables', 'orders', 'kitchen']),
  kitchen: only(['kitchen']),
  store: only(['inventory', 'purchasing']),
}

function allTrue(): Permissions {
  return Object.fromEntries(FEATURES.map((f) => [f.key, true])) as Permissions
}
function only(keys: FeatureKey[]): Permissions {
  return Object.fromEntries(FEATURES.map((f) => [f.key, keys.includes(f.key)])) as Permissions
}

export interface StaffMember {
  id: string
  branchId: string // which cafe this person belongs to — resolved per signed-in person, not hardcoded
  name: string
  email?: string // matched against their Google account on first sign-in
  role: StaffRole
  pin: string // legacy demo field, unused now — real access is via Google sign-in
  isActive: boolean
  hasSignedIn: boolean // false until they've completed their first Google sign-in
  salesGenerated: number
  shiftsWorked: number
  avgPrepMinutes?: number // only meaningful for kitchen role
  permissions: Permissions
}
