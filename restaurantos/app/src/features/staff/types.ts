export type StaffRole = 'admin' | 'shareholder' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'store'

// The ladder. Nobody can create, edit, promote, deactivate or delete someone
// at or above their own level (an administrator can manage everyone), and
// nobody can change their own role. The database enforces this too — this is
// just so the screens don't offer things that would be refused.
// MUST mirror staff_role_rank() in supabase/migrations/020.
export const ROLE_RANK: Record<StaffRole, number> = {
  admin: 100,
  shareholder: 80,
  manager: 60,
  cashier: 40,
  waiter: 20,
  kitchen: 20,
  store: 20,
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: 'Administrator',
  shareholder: 'Shareholder',
  manager: 'Manager',
  cashier: 'Cashier',
  waiter: 'Waiter',
  kitchen: 'Kitchen',
  store: 'Store',
}

// Roles in the order they're offered in dropdowns, highest first.
export const ROLE_ORDER: StaffRole[] = ['admin', 'shareholder', 'manager', 'cashier', 'waiter', 'kitchen', 'store']

// May `actor` create / edit / deactivate / delete a person whose role is `target`?
export function canManageRole(actor: StaffRole, target: StaffRole): boolean {
  return actor === 'admin' || ROLE_RANK[target] < ROLE_RANK[actor]
}

// Which roles may `actor` hand out? Same rule: strictly below their own
// (an administrator can hand out any role, including administrator).
export function assignableRoles(actor: StaffRole): StaffRole[] {
  return ROLE_ORDER.filter((r) => canManageRole(actor, r))
}

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
  { key: 'cancel_orders', label: 'Cancel paid orders' },
  { key: 'adjust_balances', label: 'Correct account balances' },
] as const

export type FeatureKey = (typeof FEATURES)[number]['key']

export type Permissions = Record<FeatureKey, boolean>

// Sensible starting point per role — every one of these is still editable
// per person afterward, this is just what a new hire starts with.
// MUST mirror role_default_permission() in supabase/migrations/020.
export const DEFAULT_PERMISSIONS: Record<StaffRole, Permissions> = {
  admin: allTrue(),
  // Nearly everything — but not who's on the team, the cafe's settings, or
  // correcting account balances. They CAN cancel already-billed orders.
  shareholder: allExcept(['staff', 'settings', 'adjust_balances']),
  // Runs the floor and does the billing, so everything EXCEPT cancelling an
  // already-billed order — that undoes money already taken, so it's for
  // shareholders and administrators only (an administrator can still grant
  // it to a specific manager from Permissions). Orders that haven't been
  // billed yet can still be cancelled from the Orders screen by anyone who
  // takes orders — that's a different, much lower-risk action.
  manager: allExcept(['cancel_orders']),
  cashier: only(['tables', 'orders', 'billing', 'shifts', 'customers']),
  waiter: only(['tables', 'orders', 'kitchen']),
  kitchen: only(['kitchen']),
  store: only(['inventory', 'purchasing']),
}

function allTrue(): Permissions {
  return Object.fromEntries(FEATURES.map((f) => [f.key, true])) as Permissions
}
function allExcept(keys: FeatureKey[]): Permissions {
  return Object.fromEntries(FEATURES.map((f) => [f.key, !keys.includes(f.key)])) as Permissions
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
