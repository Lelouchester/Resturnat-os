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
  name: string
  role: StaffRole
  pin: string // 4-digit — demo only; real PINs are hashed server-side, never shown after creation
  isActive: boolean
  salesGenerated: number
  shiftsWorked: number
  avgPrepMinutes?: number // only meaningful for kitchen role
  permissions: Permissions
}
