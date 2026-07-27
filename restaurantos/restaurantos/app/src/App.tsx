import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy, useEffect } from 'react'
import { AppShell } from './shared/ui/AppShell'
import { useSettingsStore } from './features/settings/settingsStore'
import { useShiftStore } from './features/shifts/shiftStore'
import { useOrdersStore } from './features/orders/ordersStore'
import { useAccountsStore } from './features/accounts/accountsStore'
import { TablesPage } from './features/tables/TablesPage'
import { OrdersPage } from './features/orders/OrdersPage'
import { KitchenPage } from './features/kitchen/KitchenPage'
import { BillingPage } from './features/billing/BillingPage'
import { AccountsPage } from './features/shifts/AccountsPage'
import { MenuPage } from './features/menu/MenuPage'
import { InventoryPage } from './features/inventory/InventoryPage'
import { PurchasingPage } from './features/purchasing/PurchasingPage'
import { CustomersPage } from './features/customers/CustomersPage'
import { StaffPage } from './features/staff/StaffPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { LoginPage } from './features/auth/LoginPage'

// Reports pulls in recharts, which is heavy — lazy-load it so the chart
// library only downloads when someone actually opens Reports, instead of
// bloating the initial load every shift worker pays on every login.
const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))

const queryClient = new QueryClient()

// Darkens a hex color by a fraction (0-1) — used to derive the "-dim" shade
// of whatever accent color a cafe picks, without needing a second picker.
function darken(hex: string, amount: number): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) return hex
  const [r, g, b] = [match[1], match[2], match[3]].map((h) => Math.round(parseInt(h, 16) * (1 - amount)))
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

function App() {
  // Swap this for real auth state once Supabase auth / PIN verification is wired up.
  const isAuthenticated = true
  const theme = useSettingsStore((s) => s.theme)
  const brandColor = useSettingsStore((s) => s.brandColor)
  const initPaymentMethods = useSettingsStore((s) => s.initPaymentMethods)
  const initProfile = useSettingsStore((s) => s.initProfile)
  const initShift = useShiftStore((s) => s.init)
  const initOrders = useOrdersStore((s) => s.init)
  const initAccounts = useAccountsStore((s) => s.init)

  // The whole app reads color from CSS variables (--color-ink, --color-paper,
  // --color-surface), so flipping this one attribute is the entire dark mode
  // switch — no per-component dark: classes needed.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Same idea for the brand accent — every "ember" usage in the app reads
  // this one CSS variable, so overriding it here re-colors the whole app to
  // whatever a given cafe picks in Settings, no rebuild needed.
  useEffect(() => {
    document.documentElement.style.setProperty('--color-ember', brandColor)
    document.documentElement.style.setProperty('--color-ember-dim', darken(brandColor, 0.3))
  }, [brandColor])

  // Payment methods and shift status are shared across multiple screens —
  // loaded once here rather than separately on each one (Orders in
  // particular needs to know if a shift is open even if it's the very
  // first screen someone opens). Orders is loaded globally too since
  // Notifications (visible in the header everywhere) reads kitchen tickets
  // derived from it. Accounts is initialized after payment methods since it
  // resolves balances through them.
  useEffect(() => {
    initPaymentMethods()
    initProfile()
    initShift()
    initOrders()
    initAccounts()
  }, [initPaymentMethods, initProfile, initShift, initOrders, initAccounts])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {!isAuthenticated ? (
          <LoginPage />
        ) : (
          <AppShell>
            <Routes>
              <Route path="/" element={<Navigate to="/tables" replace />} />
              <Route path="/tables" element={<TablesPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/kitchen" element={<KitchenPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/menu" element={<MenuPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/purchasing" element={<PurchasingPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route
                path="/reports"
                element={
                  <Suspense fallback={<div className="p-6 text-sm text-ink/40">Loading reports…</div>}>
                    <ReportsPage />
                  </Suspense>
                }
              />
              <Route path="/staff" element={<StaffPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/login" element={<LoginPage />} />
            </Routes>
          </AppShell>
        )}
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
