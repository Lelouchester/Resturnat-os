import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'

export type UsagePeriod = 'week' | 'month' | 'custom'

export interface ItemUsageRow {
  inventoryItemId: string
  inventoryItemName: string
  unit: string
  purchasedQty: number
  purchasedSpend: number
  soldTotal: number
  soldRevenue: number
  soldBreakdown: { menuItemName: string; qty: number; revenue: number }[]
}

/**
 * Purchased-vs-sold comparison for inventory items that have been linked to
 * menu items (Inventory > edit item > "Used in these menu items"). Purely a
 * reporting comparison — not tied to real-time stock deduction, so a rough
 * or incomplete set of links can't corrupt any real stock number.
 */
export function useItemUsageData(
  range: { from: string; to: string }, // yyyy-mm-dd, inclusive both ends
  itemsWithLinks: { id: string; name: string; unit: string; linkedMenuItemIds: string[] }[],
  menuItemNames: Record<string, string>
) {
  const [rows, setRows] = useState<ItemUsageRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (itemsWithLinks.length === 0) {
        setRows([])
        setLoading(false)
        return
      }
      setLoading(true)

      const from = `${range.from}T00:00:00`
      const to = `${range.to}T23:59:59`
      const inventoryIds = itemsWithLinks.map((i) => i.id)
      const allMenuIds = Array.from(new Set(itemsWithLinks.flatMap((i) => i.linkedMenuItemIds)))

      const [{ data: purchaseLines, error: plErr }, { data: orderItems, error: oiErr }] = await Promise.all([
        supabase
          .from('purchase_lines')
          .select('inventory_item_id, quantity, unit_cost, purchases!inner ( created_at, status )')
          .in('inventory_item_id', inventoryIds)
          .eq('kind', 'inventory')
          .neq('purchases.status', 'cancelled')
          .gte('purchases.created_at', from)
          .lte('purchases.created_at', to),
        allMenuIds.length > 0
          ? supabase
              .from('order_items')
              .select('menu_item_id, quantity, unit_price, status, orders!inner ( closed_at, status )')
              .in('menu_item_id', allMenuIds)
              .neq('status', 'void')
              .eq('orders.status', 'paid')
              .gte('orders.closed_at', from)
              .lte('orders.closed_at', to)
          : Promise.resolve({ data: [], error: null }),
      ])

      if (plErr) console.error('[useItemUsageData] purchase_lines query failed', plErr)
      if (oiErr) console.error('[useItemUsageData] order_items query failed', oiErr)

      const purchasedQtyByItem = new Map<string, number>()
      const purchasedSpendByItem = new Map<string, number>()
      for (const l of purchaseLines ?? []) {
        const id = (l as any).inventory_item_id
        const qty = Number((l as any).quantity)
        purchasedQtyByItem.set(id, (purchasedQtyByItem.get(id) ?? 0) + qty)
        purchasedSpendByItem.set(id, (purchasedSpendByItem.get(id) ?? 0) + qty * Number((l as any).unit_cost))
      }

      const soldQtyByMenuItem = new Map<string, number>()
      const soldRevenueByMenuItem = new Map<string, number>()
      for (const oi of orderItems ?? []) {
        const id = (oi as any).menu_item_id
        const qty = Number((oi as any).quantity)
        soldQtyByMenuItem.set(id, (soldQtyByMenuItem.get(id) ?? 0) + qty)
        soldRevenueByMenuItem.set(id, (soldRevenueByMenuItem.get(id) ?? 0) + qty * Number((oi as any).unit_price))
      }

      const result: ItemUsageRow[] = itemsWithLinks.map((item) => {
        const soldBreakdown = item.linkedMenuItemIds
          .map((menuId) => ({
            menuItemName: menuItemNames[menuId] ?? 'Item',
            qty: soldQtyByMenuItem.get(menuId) ?? 0,
            revenue: soldRevenueByMenuItem.get(menuId) ?? 0,
          }))
          .filter((b) => b.qty > 0)
          .sort((a, b) => b.qty - a.qty)
        return {
          inventoryItemId: item.id,
          inventoryItemName: item.name,
          unit: item.unit,
          purchasedQty: purchasedQtyByItem.get(item.id) ?? 0,
          purchasedSpend: purchasedSpendByItem.get(item.id) ?? 0,
          soldTotal: soldBreakdown.reduce((s, b) => s + b.qty, 0),
          soldRevenue: soldBreakdown.reduce((s, b) => s + b.revenue, 0),
          soldBreakdown,
        }
      })

      if (!cancelled) {
        setRows(result)
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [range.from, range.to, JSON.stringify(itemsWithLinks), JSON.stringify(menuItemNames)])

  return { rows, loading }
}
