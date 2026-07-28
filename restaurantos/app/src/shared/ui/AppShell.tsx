import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutGrid, ClipboardList, ChefHat, Receipt, Clock, BookOpen, Boxes, Truck, Users, UserCog, BarChart3, Settings, MoreHorizontal, X, Keyboard, LogOut } from 'lucide-react'
import { NotificationBell } from './NotificationBell'
import { ShortcutsHelpModal } from './ShortcutsHelpModal'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useAuthStore } from '../../features/auth/authStore'

const NAV = [
  { to: '/tables', label: 'Floor', icon: LayoutGrid },
  { to: '/orders', label: 'Orders', icon: ClipboardList },
  { to: '/kitchen', label: 'Kitchen', icon: ChefHat },
  { to: '/billing', label: 'Billing', icon: Receipt },
  { to: '/accounts', label: 'Accounts', icon: Clock },
  { to: '/menu', label: 'Menu', icon: BookOpen },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/purchasing', label: 'Purchasing', icon: Truck },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/staff', label: 'Staff', icon: UserCog },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// A phone screen can comfortably hold ~4 bottom-nav items before it stops
// being fast to use — everything past that goes under "More" instead of
// making every icon smaller to force-fit.
const PRIMARY = NAV.slice(0, 4)
const OVERFLOW = NAV.slice(4)

export function AppShell({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const location = useLocation()
  const overflowActive = OVERFLOW.some((item) => item.to === location.pathname)
  useKeyboardShortcuts(() => setShortcutsOpen(true))

  return (
    <div className="min-h-screen bg-paper text-ink flex">
      {/* Desktop sidebar — shows everything, no overflow needed at this width */}
      <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r border-ink/5 bg-surface">
        <div className="px-5 py-5 flex items-center justify-between">
          <span className="font-ticket text-sm font-bold tracking-widest text-ember">RESTAURANTOS</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setShortcutsOpen(true)} className="rounded-full p-2 hover:bg-ink/5 text-ink" title="Keyboard shortcuts (?)">
              <Keyboard size={16} />
            </button>
            <NotificationBell />
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-ink text-paper' : 'text-ink/60 hover:bg-ink/5'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <AccountFooter />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar — desktop gets the bell in the sidebar instead */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-ink/5 sticky top-0 z-20">
          <span className="font-ticket text-xs font-bold tracking-widest text-ember">RESTAURANTOS</span>
          <NotificationBell />
        </div>

        <main className="flex-1 pb-20 md:pb-0">{children}</main>

        {/* Mobile bottom nav — 4 primary items + More */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-surface border-t border-ink/5 flex justify-around py-1.5 pb-[env(safe-area-inset-bottom)] z-30">
          {PRIMARY.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[11px] font-medium ${
                  isActive ? 'text-ember' : 'text-ink/40'
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[11px] font-medium ${
              overflowActive ? 'text-ember' : 'text-ink/40'
            }`}
          >
            <MoreHorizontal size={20} />
            More
          </button>
        </nav>

        {/* More sheet */}
        {moreOpen && (
          <div className="md:hidden fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute bottom-0 inset-x-0 bg-surface rounded-t-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">More</span>
                <button onClick={() => setMoreOpen(false)} className="text-ink/40">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {OVERFLOW.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex flex-col items-center gap-1.5 rounded-2xl py-4 text-xs font-medium ${
                        isActive ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/70'
                      }`
                    }
                  >
                    <Icon size={20} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {shortcutsOpen && <ShortcutsHelpModal onClose={() => setShortcutsOpen(false)} />}
    </div>
  )
}

function AccountFooter() {
  const staff = useAuthStore((s) => s.staff)
  const signOut = useAuthStore((s) => s.signOut)
  if (!staff) return null

  return (
    <div className="px-3 py-3 border-t border-ink/5 flex items-center justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{staff.name}</div>
        <div className="text-xs text-ink/40 capitalize">{staff.role}</div>
      </div>
      <button onClick={signOut} className="shrink-0 rounded-full p-2 text-ink/40 hover:bg-ink/5 hover:text-ink" title="Sign out">
        <LogOut size={16} />
      </button>
    </div>
  )
}
