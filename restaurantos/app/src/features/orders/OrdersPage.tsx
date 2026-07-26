import { useEffect, useMemo, useState } from 'react'
import { Search, ShoppingBag, Star, Check } from 'lucide-react'
import { useMenuStore } from '../menu/menuStore'
import { effectivePrice } from '../menu/pricing'
import { useCart } from './useCart'
import { CartPanel } from './CartPanel'
import { useOrdersStore } from './ordersStore'
import { useTablesStore } from '../tables/tablesStore'
import { useShiftStore } from '../shifts/shiftStore'
import { useRepeatOrderStore } from './repeatOrderStore'
import { useNavigate, useSearchParams } from 'react-router-dom'

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeCategory, setActiveCategory] = useState<string>('favorites')
  const [search, setSearch] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const cart = useCart()
  const shift = useShiftStore((s) => s.shift)
  const shiftLoading = useShiftStore((s) => s.loading)
  const categories = useMenuStore((s) => s.categories)
  const menuItems = useMenuStore((s) => s.items)
  const menuLoading = useMenuStore((s) => s.loading)
  const initMenu = useMenuStore((s) => s.init)
  const pendingRepeat = useRepeatOrderStore((s) => s.pending)
  const clearPendingRepeat = useRepeatOrderStore((s) => s.clear)
  const navigate = useNavigate()

  const tables = useTablesStore((s) => s.tables)
  const tablesLoading = useTablesStore((s) => s.loading)
  const initTables = useTablesStore((s) => s.init)
  const updateGuestInfo = useTablesStore((s) => s.updateGuestInfo)
  const orders = useOrdersStore((s) => s.orders)
  const initOrders = useOrdersStore((s) => s.init)
  const sendItemsToKitchen = useOrdersStore((s) => s.sendItemsToKitchen)
  const [guestNameDraft, setGuestNameDraft] = useState('')
  const [editingGuestName, setEditingGuestName] = useState(false)

  useEffect(() => {
    initMenu()
    initTables()
    initOrders()
  }, [initMenu, initTables, initOrders])

  // Tabs across the top: any table already in use, plus whichever table was
  // just tapped from the Floor screen (even if it's still "available" — that's
  // how a brand new order gets started).
  const tableFromUrl = searchParams.get('table')
  const openTables = useMemo(
    () => tables.filter((t) => t.status === 'occupied' || t.status === 'billing' || t.id === tableFromUrl),
    [tables, tableFromUrl]
  )
  const activeTable = tableFromUrl ?? openTables[0]?.id

  function setActiveTable(id: string) {
    setSearchParams({ table: id })
  }

  // Coming from "Repeat this order" on a customer's visit history — match
  // each remembered item name against the live menu and add what's found.
  useEffect(() => {
    if (!pendingRepeat) return
    let addedCount = 0
    pendingRepeat.forEach(({ name, quantity }) => {
      const menuItem = menuItems.find((m) => m.name.toLowerCase() === name.toLowerCase())
      if (menuItem) {
        for (let i = 0; i < quantity; i++) cart.addItem({ ...menuItem, price: effectivePrice(menuItem) })
        addedCount++
      }
    })
    clearPendingRepeat()
    setToast(addedCount === pendingRepeat.length ? 'Previous order added to cart' : `${addedCount} of ${pendingRepeat.length} items added — rest are off the menu now`)
    setTimeout(() => setToast(null), 3000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRepeat])

  const items = useMemo(() => {
    let pool = menuItems
    if (search.trim()) {
      const q = search.toLowerCase()
      return pool.filter((i) => i.name.toLowerCase().includes(q))
    }
    if (activeCategory === 'favorites') return pool.filter((i) => i.isFavorite)
    return pool.filter((i) => i.categoryId === activeCategory)
  }, [activeCategory, search, menuItems])

  if (shiftLoading) {
    return <div className="p-6 max-w-sm mx-auto pt-20 h-40 rounded-2xl bg-ink/5 animate-pulse" />
  }

  if (!shift) {
    return (
      <div className="p-6 max-w-sm mx-auto text-center pt-20">
        <div className="font-ticket text-lg font-bold mb-2">No shift open</div>
        <p className="text-sm text-ink/50 mb-5">
          Orders can't be taken until the day's shift is started — count the drawer first.
        </p>
        <button
          onClick={() => navigate('/shifts')}
          className="rounded-xl bg-ink text-paper px-4 py-3 text-sm font-semibold"
        >
          Go start the shift
        </button>
      </div>
    )
  }

  if (tablesLoading) {
    return <div className="p-6 max-w-sm mx-auto pt-20 h-40 rounded-2xl bg-ink/5 animate-pulse" />
  }

  if (!activeTable) {
    return (
      <div className="p-6 max-w-sm mx-auto text-center pt-20">
        <div className="font-ticket text-lg font-bold mb-2">No table selected</div>
        <p className="text-sm text-ink/50 mb-5">Tap a table on the Floor to start or continue its order.</p>
        <button onClick={() => navigate('/tables')} className="rounded-xl bg-ink text-paper px-4 py-3 text-sm font-semibold">
          Go to Floor
        </button>
      </div>
    )
  }

  const existingOrder = orders.find((o) => o.tableId === activeTable && (o.status === 'open' || o.status === 'billing'))
  const activeTableRow = tables.find((t) => t.id === activeTable)
  const existingBillable = existingOrder?.items.filter((i) => i.status !== 'void') ?? []
  const existingTotal = existingBillable.reduce((s, i) => s + (i.isComplimentary ? 0 : i.unitPrice * i.quantity), 0)

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0 pb-24 md:pb-0 min-h-0">
        {/* Table selector */}
        <div className="px-4 md:px-6 pt-4 md:pt-6">
          <div className="flex gap-2 overflow-x-auto pb-3">
            {openTables.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTable(t.id)}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-left border transition-colors ${
                  activeTable === t.id ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink border-ink/10'
                }`}
              >
                <div className="font-ticket text-sm font-bold leading-none">{t.label}</div>
                <div className={`text-[11px] mt-0.5 ${activeTable === t.id ? 'text-paper/60' : 'text-ink/40'}`}>
                  {t.customerName ?? (t.status === 'available' ? 'New order' : t.status)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Guest name + elapsed time for this table */}
        <div className="px-4 md:px-6 pb-3 flex items-center gap-2 text-sm">
          {editingGuestName ? (
            <input
              autoFocus
              value={guestNameDraft}
              onChange={(e) => setGuestNameDraft(e.target.value)}
              onBlur={() => { updateGuestInfo(activeTable, guestNameDraft.trim()); setEditingGuestName(false) }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder="Guest name"
              className="text-sm rounded-lg border border-ink/10 px-2.5 py-1.5 outline-none focus:border-ember"
            />
          ) : (
            <button
              onClick={() => { setGuestNameDraft(activeTableRow?.customerName ?? ''); setEditingGuestName(true) }}
              className="text-ink/50 hover:text-ink font-medium"
            >
              {activeTableRow?.customerName ? `Guest: ${activeTableRow.customerName}` : '+ Add guest name'}
            </button>
          )}
          {activeTableRow?.seatedAt && (
            <span className="text-ink/30 text-xs">
              · seated {Math.max(0, Math.round((Date.now() - new Date(activeTableRow.seatedAt).getTime()) / 60000))}m ago
            </span>
          )}
        </div>

        {/* Always-visible summary of what's already confirmed for this table — stays
            put even after the working cart empties out, so nothing looks "gone". */}
        {existingBillable.length > 0 && (
          <div className="mx-4 md:mx-6 mb-3 rounded-xl bg-ink/[0.03] px-3.5 py-2.5 flex items-center justify-between">
            <div className="text-xs">
              <span className="font-semibold">{existingBillable.length} item{existingBillable.length === 1 ? '' : 's'} confirmed</span>
              <span className="text-ink/40"> · Rs. {existingTotal}</span>
            </div>
            <button onClick={() => setCartOpen(true)} className="md:hidden text-xs font-semibold text-ember">View</button>
          </div>
        )}

        {/* Search */}
        <div className="px-4 md:px-6 pb-3">
          <div className="flex items-center gap-2 bg-surface border border-ink/10 rounded-xl px-3 py-2.5">
            <Search size={16} className="text-ink/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu"
              className="flex-1 text-sm outline-none bg-transparent"
            />
          </div>
        </div>

        {/* Category rail */}
        {!search && (
          <div className="px-4 md:px-6 pb-3">
            <div className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => setActiveCategory('favorites')}
                className={`shrink-0 flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                  activeCategory === 'favorites' ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink/60 border-ink/10'
                }`}
              >
                <Star size={12} /> Favorites
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                    activeCategory === c.id ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink/60 border-ink/10'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {menuLoading ? (
              Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-ink/5 animate-pulse" />)
            ) : (
              <>
                {items.map((item) => {
                  const price = effectivePrice(item)
                  const onHappyHour = price !== item.price
                  return (
                    <button
                      key={item.id}
                      onClick={() => cart.addItem({ ...item, price })}
                      className="text-left bg-surface border border-ink/5 rounded-2xl p-3.5 hover:border-ink/15 hover:-translate-y-0.5 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    >
                      <div className="text-sm font-semibold leading-snug">{item.name}</div>
                      {item.comboItemIds && item.comboItemIds.length > 0 && (
                        <div className="text-[10px] text-status-reserved font-semibold mt-1">
                          Combo: {item.comboItemIds.map((id) => menuItems.find((m) => m.id === id)?.name).filter(Boolean).join(', ')}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="font-ticket text-sm font-bold text-ember">Rs. {price}</span>
                        {onHappyHour && <span className="text-[9px] font-bold text-ember bg-ember/10 rounded-full px-1.5 py-0.5">HAPPY HOUR</span>}
                      </div>
                    </button>
                  )
                })}
                {items.length === 0 && (
                  <p className="col-span-full text-sm text-ink/40 py-8 text-center">No items match "{search}".</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <CartPanel
        lines={cart.lines}
        subtotal={cart.subtotal}
        existingItems={existingBillable}
        onAdjust={cart.adjustQuantity}
        onNote={cart.setNote}
        onRemove={cart.removeLine}
        onVoid={cart.markVoid}
        onComplimentary={cart.markComplimentary}
        onConfirm={async () => {
          await sendItemsToKitchen(activeTable, cart.lines)
          cart.clear()
          setCartOpen(false)
          setToast('Order confirmed')
          setTimeout(() => setToast(null), 2500)
        }}
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
      />

      {/* Mobile floating cart button */}
      {cart.itemCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="md:hidden fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-ink text-paper px-4 py-3 shadow-lg"
        >
          <ShoppingBag size={16} />
          <span className="font-ticket text-sm font-bold">{cart.itemCount} · Rs. {cart.subtotal}</span>
        </button>
      )}

      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-ink text-paper px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg">
          <Check size={15} className="text-status-available" />
          {toast}
        </div>
      )}
    </div>
  )
}
