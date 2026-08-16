import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { useAuthStore, currentBranchId } from '../auth/authStore'
import { useShiftStore } from '../shifts/shiftStore'
import { useTablesStore } from '../tables/tablesStore'
import { useAccountsStore } from '../accounts/accountsStore'
import { useMenuStore } from '../menu/menuStore'
import { useInventoryStore } from '../inventory/inventoryStore'
import type { CartLine, LiveOrder, OrderItemRow, OrderItemStatus } from './types'

/**
 * Real data now — this is the store that makes Orders, Kitchen, and Billing
 * all agree on the same thing, live. Same shape as tablesStore/shiftStore/
 * menuStore: `init()` loads every currently-open-or-billing order for the
 * branch (with its line items and table label embedded via PostgREST), then
 * keeps that in sync over Realtime. Every write below (sendItemsToKitchen,
 * updateItemStatus, transferOrderTable, mergeOrders, completePayment) writes
 * straight to Postgres and lets the same subscription reflect it back into
 * `orders` — on every device, kitchen included, without anyone refreshing.
 *
 * Note on Realtime filtering: `order_items` has no branch_id column of its
 * own (it hangs off `order_id`), so its channel below is NOT branch-filtered
 * — any order_items change anywhere reloads this branch's orders. Fine for
 * one or two branches; worth revisiting (a Postgres function + narrower
 * channel per branch) if this ever runs across many branches at once.
 */
interface OrdersState {
  orders: LiveOrder[]
  loading: boolean
  initialized: boolean
  init: () => void
  getOrderForTable: (tableId: string) => LiveOrder | undefined
  startOrGetOrder: (tableId: string) => Promise<string>
  sendItemsToKitchen: (tableId: string, lines: CartLine[]) => Promise<void>
  updateItemStatus: (itemId: string, status: OrderItemStatus) => Promise<void>
  markItemsServed: (itemIds: string[]) => Promise<void>
  markItemsPrinted: (itemIds: string[]) => Promise<void>
  voidItem: (itemId: string, reason: string) => Promise<void>
  cancelOrder: (tableId: string, reason: string) => Promise<void>
  beginBilling: (tableId: string) => Promise<void>
  attachCustomer: (tableId: string, customerId: string) => Promise<void>
  transferOrderTable: (fromTableId: string, toTableId: string) => Promise<void>
  mergeOrders: (fromTableId: string, intoTableId: string) => Promise<void>
  unmergeOrder: (orderId: string) => Promise<void>
  completePayment: (params: {
    orderId: string
    payments: { methodKey: string; amount: number }[]
    subtotal: number
    discountAmount: number
    serviceCharge: number
    taxAmount: number
    tipAmount: number
    total: number
    splitGuestCount: number
    customerId?: string
    mergedOrderIds?: string[]
  }) => Promise<void>
  cancelPaidOrder: (orderId: string) => Promise<{ ok: boolean; error?: string }>
}

const ORDER_SELECT = `
  id, table_id, shift_id, waiter_id, customer_id, status, merged_into_order_id,
  subtotal, discount_amount, service_charge, tax_amount, tip_amount, total, split_guest_count,
  opened_at, closed_at,
  restaurant_tables ( label ),
  order_items ( id, menu_item_id, custom_name, quantity, unit_price, note, status, is_complimentary, void_reason, created_at, kot_printed_at, menu_items ( name, menu_categories ( exclude_from_discount ) ) )
`

function mapOrderRow(row: any): LiveOrder {
  const items: OrderItemRow[] = (row.order_items ?? [])
    .map((it: any): OrderItemRow => ({
      id: it.id,
      menuItemId: it.menu_item_id,
      customName: it.custom_name ?? undefined,
      name: it.custom_name ?? it.menu_items?.name ?? 'Item',
      quantity: it.quantity,
      unitPrice: Number(it.unit_price),
      note: it.note ?? undefined,
      status: it.status,
      isComplimentary: it.is_complimentary ?? false,
      voidReason: it.void_reason ?? undefined,
      createdAt: it.created_at,
      excludeFromDiscount: it.menu_items?.menu_categories?.exclude_from_discount ?? false,
      kotPrintedAt: it.kot_printed_at ?? null,
    }))
    .sort((a: OrderItemRow, b: OrderItemRow) => a.createdAt.localeCompare(b.createdAt))

  return {
    id: row.id,
    tableId: row.table_id,
    tableLabel: row.restaurant_tables?.label ?? '—',
    status: row.status,
    customerId: row.customer_id ?? undefined,
    mergedIntoOrderId: row.merged_into_order_id ?? undefined,
    waiterId: row.waiter_id ?? undefined,
    shiftId: row.shift_id ?? undefined,
    subtotal: Number(row.subtotal) || 0,
    discountAmount: Number(row.discount_amount) || 0,
    serviceCharge: Number(row.service_charge) || 0,
    taxAmount: Number(row.tax_amount) || 0,
    tipAmount: Number(row.tip_amount) || 0,
    total: Number(row.total) || 0,
    splitGuestCount: row.split_guest_count ?? 1,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    items,
  }
}

async function loadOpenOrders(): Promise<LiveOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('branch_id', currentBranchId())
    .in('status', ['open', 'billing'])
    .order('opened_at')

  if (error) {
    console.error('[ordersStore] failed to load orders', error)
    return []
  }
  return (data ?? []).map(mapOrderRow)
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadOpenOrders().then((orders) => set({ orders, loading: false }))

    // Same safety net as tablesStore — don't rely on the websocket alone.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadOpenOrders().then((orders) => set({ orders }))
    })

    // An order/order_items change can touch totals, statuses, and table
    // linkage all at once — reload rather than patch, same reasoning as
    // shiftStore.
    supabase
      .channel(`orders:${currentBranchId()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${currentBranchId()}` },
        () => loadOpenOrders().then((orders) => set({ orders }))
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () =>
        loadOpenOrders().then((orders) => set({ orders }))
      )
      .subscribe()
  },

  getOrderForTable: (tableId) =>
    get().orders.find((o) => o.tableId === tableId && (o.status === 'open' || o.status === 'billing')),

  startOrGetOrder: async (tableId) => {
    const existing = get().getOrderForTable(tableId)
    if (existing) return existing.id

    const shiftId = useShiftStore.getState().shift?.id
    // A customer may already have been assigned to this table before any
    // items were added (tapping the table and picking a name first) — carry
    // that over onto the order now, or it's otherwise never linked, since
    // this insert is the only place the order's customer_id gets set at
    // creation time.
    const table = useTablesStore.getState().tables.find((t) => t.id === tableId)
    const { data, error } = await supabase
      .from('orders')
      .insert({
        branch_id: currentBranchId(),
        table_id: tableId,
        shift_id: shiftId ?? null,
        waiter_id: useAuthStore.getState().staff?.id ?? null,
        customer_id: table?.customerId ?? null,
        status: 'open',
      })
      .select()
      .single()

    if (error || !data) {
      console.error('[ordersStore] startOrGetOrder failed', error)
      throw error
    }

    // Flips the table straight to occupied whether it was sitting
    // 'available' or still marked 'needs_cleaning' — a new party sitting
    // down clears that status on its own, no separate step required.
    await supabase
      .from('restaurant_tables')
      .update({ status: 'occupied', seated_at: new Date().toISOString() })
      .eq('id', tableId)
      .in('status', ['available', 'needs_cleaning'])

    set({ orders: await loadOpenOrders() })
    return data.id
  },

  sendItemsToKitchen: async (tableId, lines) => {
    const billable = lines.filter((l) => l.status !== 'void')
    if (billable.length === 0) return

    const orderId = await get().startOrGetOrder(tableId)
    const rows = billable.map((l) => ({
      order_id: orderId,
      // Custom (off-menu) lines are created client-side as `custom-<timestamp>`
      // in useCart.addCustomItem — anything else is a real menu_items id.
      menu_item_id: l.menuItemId.startsWith('custom-') ? null : l.menuItemId,
      custom_name: l.menuItemId.startsWith('custom-') ? l.name : null,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      note: l.note ?? null,
      is_complimentary: l.status === 'complimentary',
      status: 'pending' as const,
    }))

    const { error } = await supabase.from('order_items').insert(rows)
    if (error) {
      console.error('[ordersStore] sendItemsToKitchen failed', error)
      return
    }

    // Trackable menu items (beer, liquor, cigarettes — sold directly, not
    // cooked) decrease inventory the moment they're committed to the
    // order, same moment everything else in this app treats a line as
    // "on its way." voidItem below is the mirror: it restores this if the
    // line gets corrected afterward.
    const menuItems = useMenuStore.getState().items
    for (const l of billable) {
      const menuItem = menuItems.find((m) => m.id === l.menuItemId)
      if (menuItem?.trackedInventoryItemId) {
        useInventoryStore.getState().adjustStock(menuItem.trackedInventoryItemId, -l.quantity, 'sale_deduction', `Sold: ${l.name}`)
      }
    }

    set({ orders: await loadOpenOrders() })
  },

  updateItemStatus: async (itemId, status) => {
    const { error } = await supabase
      .from('order_items')
      .update({ status, status_updated_at: new Date().toISOString() })
      .eq('id', itemId)
    if (error) console.error('[ordersStore] updateItemStatus failed', error)
  },

  markItemsServed: async (itemIds) => {
    if (itemIds.length === 0) return
    const { error } = await supabase
      .from('order_items')
      .update({ status: 'served', status_updated_at: new Date().toISOString() })
      .in('id', itemIds)
    if (error) console.error('[ordersStore] markItemsServed failed', error)
  },

  // Stamps the moment these items were sent to the kitchen. Only ever
  // called for items that don't already have a kot_printed_at — that's what
  // lets a reprint (after new items get added to the same table) show which
  // ones are genuinely new versus already fired, instead of the whole order
  // looking new again every time.
  markItemsPrinted: async (itemIds) => {
    if (itemIds.length === 0) return
    const { error } = await supabase
      .from('order_items')
      .update({ kot_printed_at: new Date().toISOString() })
      .in('id', itemIds)
      .is('kot_printed_at', null)
    if (error) console.error('[ordersStore] markItemsPrinted failed', error)
  },

  voidItem: async (itemId, reason) => {
    // Need the item's menu_item_id/quantity to restore any tracked stock,
    // and to make sure we don't restore twice if this is somehow called on
    // an item that's already void.
    const { data: existing, error: fetchErr } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity, status')
      .eq('id', itemId)
      .maybeSingle()
    if (fetchErr) console.error('[ordersStore] voidItem: failed to look up item before voiding', fetchErr)

    const { error } = await supabase
      .from('order_items')
      .update({ status: 'void', void_reason: reason, status_updated_at: new Date().toISOString() })
      .eq('id', itemId)
    if (error) {
      console.error('[ordersStore] voidItem failed', error)
      return
    }

    if (existing && existing.status !== 'void' && existing.menu_item_id) {
      const menuItem = useMenuStore.getState().items.find((m) => m.id === existing.menu_item_id)
      if (menuItem?.trackedInventoryItemId) {
        useInventoryStore.getState().adjustStock(menuItem.trackedInventoryItemId, existing.quantity, 'sale_deduction', `Voided: ${reason}`)
      }
    }
  },

  // For a table's whole order before it's ever billed — wrong table, guest
  // walked out, order entered by mistake. Voids every item (restoring any
  // tracked inventory, same as voiding one item does), closes the order out
  // as cancelled instead of leaving it lingering as "open" with nothing in
  // it, and frees the table completely — this is meant to be a clean slate,
  // not something that needs cleanup afterward.
  cancelOrder: async (tableId, reason) => {
    const order = get().getOrderForTable(tableId)
    if (!order) return
    // Once billing has started for this table (someone's actively checking
    // it out), cancelling from here would race against that — money could
    // get deposited for items this just voided. Cancel is only for before
    // checkout begins; once it's started, it needs to be finished or
    // corrected through Billing itself.
    if (order.status === 'billing') return

    const { data: items, error: fetchErr } = await supabase
      .from('order_items')
      .select('id, menu_item_id, quantity')
      .eq('order_id', order.id)
      .neq('status', 'void')
    if (fetchErr) console.error('[ordersStore] cancelOrder: failed to look up items', fetchErr)

    const { error: voidErr } = await supabase
      .from('order_items')
      .update({ status: 'void', void_reason: reason, status_updated_at: new Date().toISOString() })
      .eq('order_id', order.id)
      .neq('status', 'void')
    if (voidErr) {
      console.error('[ordersStore] cancelOrder: voiding items failed', voidErr)
      return
    }

    const menuItems = useMenuStore.getState().items
    for (const item of items ?? []) {
      if (!item.menu_item_id) continue
      const menuItem = menuItems.find((m) => m.id === item.menu_item_id)
      if (menuItem?.trackedInventoryItemId) {
        useInventoryStore.getState().adjustStock(menuItem.trackedInventoryItemId, item.quantity, 'sale_deduction', `Order cancelled: ${reason}`)
      }
    }

    const { error: orderErr } = await supabase
      .from('orders')
      .update({ status: 'cancelled', closed_at: new Date().toISOString() })
      .eq('id', order.id)
    if (orderErr) console.error('[ordersStore] cancelOrder: closing order failed', orderErr)

    const { error: tableErr } = await supabase
      .from('restaurant_tables')
      .update({ status: 'needs_cleaning', customer_name: null, guest_count: null, seated_at: null, note: null })
      .eq('id', tableId)
    if (tableErr) console.error('[ordersStore] cancelOrder: freeing table failed', tableErr)

    set({ orders: await loadOpenOrders() })
  },

  // Marks a table (and its order) as actively being closed out — lets the
  // floor plan and kitchen both show "billing" instead of "occupied".
  beginBilling: async (tableId) => {
    const order = get().getOrderForTable(tableId)
    if (!order) return
    await supabase.from('orders').update({ status: 'billing' }).eq('id', order.id)
    await supabase
      .from('restaurant_tables')
      .update({ status: 'billing' })
      .eq('id', tableId)
      .eq('status', 'occupied')
  },

  attachCustomer: async (tableId, customerId) => {
    // If an order already exists for this table, link it right away — that
    // way Billing shows the customer already attached instead of needing to
    // search again at payment time.
    const order = get().getOrderForTable(tableId)
    if (order) {
      const { error } = await supabase.from('orders').update({ customer_id: customerId }).eq('id', order.id)
      if (error) console.error('[ordersStore] attachCustomer failed', error)
      set({ orders: await loadOpenOrders() })
    }
  },

  transferOrderTable: async (fromTableId, toTableId) => {
    const order = get().getOrderForTable(fromTableId)
    const fromTable = useTablesStore.getState().tables.find((t) => t.id === fromTableId)
    if (!order || !fromTable) return

    const { error: orderErr } = await supabase.from('orders').update({ table_id: toTableId }).eq('id', order.id)
    if (orderErr) {
      console.error('[ordersStore] transferOrderTable (order move) failed', orderErr)
      return
    }

    await supabase
      .from('restaurant_tables')
      .update({
        status: fromTable.status,
        customer_name: fromTable.customerName ?? null,
        customer_phone: fromTable.customerPhone ?? null,
        customer_id: fromTable.customerId ?? null,
        guest_count: fromTable.guestCount ?? null,
        seated_at: fromTable.seatedAt ?? null,
      })
      .eq('id', toTableId)

    await supabase
      .from('restaurant_tables')
      .update({ status: 'needs_cleaning', customer_name: null, guest_count: null, seated_at: null, note: null })
      .eq('id', fromTableId)

    set({ orders: await loadOpenOrders() })
  },

  mergeOrders: async (fromTableId, intoTableId) => {
    const fromOrder = get().getOrderForTable(fromTableId)
    const intoOrder = get().getOrderForTable(intoTableId)
    if (!fromOrder || !intoOrder) return

    // Merging into a table that's itself already merged elsewhere, or
    // merging a table that already has others merged into it, would build a
    // hidden A→B→C chain — Billing only looks one level deep, so anything
    // past the first link would silently vanish from the bill. Flatten
    // everything onto one root instead.
    const root = intoOrder.mergedIntoOrderId
      ? get().orders.find((o) => o.id === intoOrder.mergedIntoOrderId) ?? intoOrder
      : intoOrder
    const existingChildren = get().orders.filter((o) => o.mergedIntoOrderId === fromOrder.id).map((o) => o.id)
    const idsToRelink = [fromOrder.id, ...existingChildren]

    const { error } = await supabase.from('orders').update({ merged_into_order_id: root.id }).in('id', idsToRelink)
    if (error) {
      console.error('[ordersStore] mergeOrders failed', error)
      return
    }
    set({ orders: await loadOpenOrders() })
  },

  unmergeOrder: async (orderId) => {
    const { error } = await supabase.from('orders').update({ merged_into_order_id: null }).eq('id', orderId)
    if (error) console.error('[ordersStore] unmergeOrder failed', error)
    set({ orders: await loadOpenOrders() })
  },

  completePayment: async (params) => {
    const { orderId, payments, mergedOrderIds = [], customerId } = params
    const order = get().orders.find((o) => o.id === orderId)

    const paymentRows = payments
      .filter((p) => p.amount > 0)
      .map((p) => {
        const methodId = useAccountsStore.getState().methodIdForKey(p.methodKey)
        return methodId ? { order_id: orderId, payment_method_id: methodId, amount: p.amount } : null
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (paymentRows.length > 0) {
      const { error } = await supabase.from('payments').insert(paymentRows)
      if (error) console.error('[ordersStore] completePayment: writing payments failed', error)
    }

    // Move real money: each collected payment deposits into that method's
    // account (and logs a ledger entry) — the same balance Purchasing
    // withdraws from.
    for (const p of payments) {
      if (p.amount > 0) await useAccountsStore.getState().deposit(p.methodKey, p.amount, { orderId, reason: 'order payment' })
    }

    // If what came in adds up to more than the bill, that excess gets
    // physically handed back as cash — whether the overpayment itself was
    // cash or something else (eSewa, Fonepay). Without this, a customer
    // paying extra by eSewa and getting cash change back would silently
    // leave the tracked Cash balance higher than what's actually in the
    // drawer, since the cash going *out* as change was never recorded
    // anywhere. This assumes change is always given in cash, which is
    // standard practice — if that's ever not true for a specific order,
    // this would need a manual correction via Accounts > Adjust balance.
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
    const changeGiven = totalPaid - params.total
    if (changeGiven > 0) {
      await useAccountsStore.getState().withdraw('cash', changeGiven, { reason: 'Change given to customer' })
    }

    const { error: closeErr } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        closed_at: new Date().toISOString(),
        customer_id: customerId ?? null,
        subtotal: params.subtotal,
        discount_amount: params.discountAmount,
        service_charge: params.serviceCharge,
        tax_amount: params.taxAmount,
        tip_amount: params.tipAmount,
        total: params.total,
        split_guest_count: params.splitGuestCount,
      })
      .eq('id', orderId)
    if (closeErr) console.error('[ordersStore] completePayment: closing order failed', closeErr)

    if (mergedOrderIds.length > 0) {
      const { error: mergedErr } = await supabase
        .from('orders')
        .update({ status: 'paid', closed_at: new Date().toISOString() })
        .in('id', mergedOrderIds)
      if (mergedErr) console.error('[ordersStore] completePayment: closing merged orders failed', mergedErr)
    }

    const tableIds = [
      order?.tableId,
      ...mergedOrderIds.map((id) => get().orders.find((o) => o.id === id)?.tableId),
    ].filter((id): id is string => Boolean(id))

    if (tableIds.length > 0) {
      const { error: tableErr } = await supabase
        .from('restaurant_tables')
        .update({ status: 'needs_cleaning', customer_name: null, guest_count: null, seated_at: null, note: null })
        .in('id', tableIds)
      if (tableErr) console.error('[ordersStore] completePayment: freeing tables failed', tableErr)
    }

    set({ orders: await loadOpenOrders() })
  },

  // Reverses a completed (paid) order from today — the money it collected,
  // any tracked inventory it deducted, and its effect on the attached
  // customer's due/lifetime spend, all atomically in one database function.
  // Built for same-day mistakes like a duplicate order entered twice, not
  // as a general "undo any order" tool — see the migration for the exact
  // rules it enforces (today only, paid orders only, not a merged bill).
  cancelPaidOrder: async (orderId) => {
    const localDayStart = new Date()
    localDayStart.setHours(0, 0, 0, 0)
    const { error } = await supabase.rpc('cancel_order', {
      p_order_id: orderId,
      p_local_day_start: localDayStart.toISOString(),
    })
    if (error) {
      console.error('[ordersStore] cancelPaidOrder failed', error)
      return { ok: false, error: error.message }
    }
    set({ orders: await loadOpenOrders() })
    return { ok: true }
  },
}))
