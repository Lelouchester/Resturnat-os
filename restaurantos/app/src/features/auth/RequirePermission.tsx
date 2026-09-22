import { Navigate } from 'react-router-dom'
import { useAuthStore } from './authStore'
import { FEATURES, type FeatureKey, type StaffMember } from '../staff/types'

// Only page-level features have a route. 'cancel_orders' and
// 'adjust_balances' are ACTIONS inside pages (checked where the button is),
// so they deliberately have none.
const FEATURE_TO_ROUTE: Partial<Record<FeatureKey, string>> = {
  tables: '/tables',
  orders: '/orders',
  kitchen: '/kitchen',
  billing: '/billing',
  shifts: '/accounts',
  menu: '/menu',
  inventory: '/inventory',
  purchasing: '/purchasing',
  customers: '/customers',
  staff: '/staff',
  reports: '/reports',
  settings: '/settings',
  financials: '/bank',
}

// Redirecting a denied route straight to '/tables' would loop forever for
// a kitchen- or store-role person, since neither has 'tables' permission
// by default either — they'd just get denied again immediately. This
// finds the first route the person actually has access to instead, so
// the fallback is never itself another dead end.
function firstAllowedRoute(staff: StaffMember | null): string | null {
  if (!staff) return null
  if (staff.role === 'admin') return '/tables'
  for (const f of FEATURES) {
    const route = FEATURE_TO_ROUTE[f.key]
    if (route && staff.permissions[f.key]) return route
  }
  return null
}

/**
 * Actually enforces the permission toggles set on the Staff page — before
 * this, those toggles were saved correctly but never checked anywhere
 * except a handful of "financials"-gated sections within a few pages.
 * Every route was otherwise wide open to any signed-in staff member
 * regardless of what was ticked for them, including Staff management
 * itself, which meant someone with minimal permissions could grant
 * themselves more.
 *
 * Admins always pass, regardless of their own permissions object — this
 * is a deliberate safety net, not an oversight: permissions are stored
 * per-person and fully editable even for an admin account, so without
 * this, an admin editing their own access (or someone else's, if that
 * person could reach Staff management) could accidentally lock every
 * admin out of Staff management with no way back in through the app.
 */
export function RequirePermission({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
  const staff = useAuthStore((s) => s.staff)
  const allowed = staff?.role === 'admin' || (staff?.permissions[feature] ?? false)
  if (allowed) return <>{children}</>

  const fallback = firstAllowedRoute(staff)
  // A staff member with literally zero feature permissions ticked is an
  // edge case that shouldn't exist in practice (every DEFAULT_PERMISSIONS
  // preset grants at least one), but redirecting to a route they also
  // can't access would loop — so this is the one safe dead end instead.
  if (!fallback) return <NoAccessScreen />
  return <Navigate to={fallback} replace />
}

function NoAccessScreen() {
  return (
    <div className="p-6 text-center pt-24">
      <p className="text-sm text-ink/50">Your account doesn't have access to any part of this app yet.</p>
      <p className="text-sm text-ink/50 mt-1">Ask an admin to grant you at least one permission on the Staff page.</p>
    </div>
  )
}
