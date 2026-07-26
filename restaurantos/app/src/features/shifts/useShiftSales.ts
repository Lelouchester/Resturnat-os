import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'

export interface ShiftSalesSummary {
  byPaymentMethod: Record<string, number> // keyed by payment method key, e.g. "cash"
  byCategory: { categoryName: string; total: number }[]
  orderCount: number
  totalSales: number
}

const EMPTY: ShiftSalesSummary = { byPaymentMethod: {}, byCategory: [], orderCount: 0, totalSales: 0 }

// Real numbers for the currently open shift — every paid order tagged with
// this shift_id, broken down by payment method and by menu category.
export function useShiftSales(shiftId: string | undefined) {
  const [summary, setSummary] = useState<ShiftSalesSummary>(EMPTY)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!shiftId) {
      setSummary(EMPTY)
      setLoading(false)
      return
    }
    setLoading(true)

    const { data: paidOrders, error: ordersErr } = await supabase
      .from('orders')
      .select('id, order_items ( quantity, unit_price, is_complimentary, status, menu_items ( menu_categories ( name ) ) )')
      .eq('shift_id', shiftId)
      .eq('status', 'paid')
    if (ordersErr) console.error('[useShiftSales] orders query failed', ordersErr)

    const orderIds = (paidOrders ?? []).map((o: any) => o.id)
    let payments: any[] = []
    if (orderIds.length > 0) {
      const { data, error } = await supabase.from('payments').select('amount, payment_methods ( key )').in('order_id', orderIds)
      if (error) console.error('[useShiftSales] payments query failed', error)
      payments = data ?? []
    }

    const byPaymentMethod: Record<string, number> = {}
    for (const p of payments) {
      const key = p.payment_methods?.key
      if (key) byPaymentMethod[key] = (byPaymentMethod[key] || 0) + Number(p.amount)
    }

    const categoryTotals = new Map<string, number>()
    for (const order of paidOrders ?? []) {
      for (const item of (order as any).order_items ?? []) {
        if (item.status === 'void' || item.is_complimentary) continue
        const categoryName = item.menu_items?.menu_categories?.name ?? 'Uncategorized'
        categoryTotals.set(categoryName, (categoryTotals.get(categoryName) || 0) + Number(item.unit_price) * item.quantity)
      }
    }
    const byCategory = Array.from(categoryTotals.entries())
      .map(([categoryName, total]) => ({ categoryName, total }))
      .sort((a, b) => b.total - a.total)

    setSummary({
      byPaymentMethod,
      byCategory,
      orderCount: (paidOrders ?? []).length,
      totalSales: Object.values(byPaymentMethod).reduce((s, v) => s + v, 0),
    })
    setLoading(false)
  }, [shiftId])

  useEffect(() => {
    reload()
    if (!shiftId) return
    const channel = supabase
      .channel(`shift-sales:${shiftId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `shift_id=eq.${shiftId}` }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [shiftId, reload])

  return { summary, loading, reload }
}

export interface OrderHistoryRow {
  id: string
  tableLabel: string
  closedAt: string
  itemsSummary: string
  subtotal: number
  discountAmount: number
  total: number
}

// Every completed (paid) order in a date range, for the "past orders" list
// and CSV export — not tied to any one shift.
export async function fetchOrderHistory(fromISO: string, toISO: string): Promise<OrderHistoryRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, closed_at, subtotal, discount_amount, total, restaurant_tables ( label ), order_items ( quantity, custom_name, is_complimentary, status, menu_items ( name ) )')
    .eq('status', 'paid')
    .gte('closed_at', fromISO)
    .lte('closed_at', toISO)
    .order('closed_at', { ascending: false })

  if (error) {
    console.error('[fetchOrderHistory] query failed', error)
    return []
  }

  return (data ?? []).map((o: any) => ({
    id: o.id,
    tableLabel: o.restaurant_tables?.label ?? '—',
    closedAt: o.closed_at,
    itemsSummary: (o.order_items ?? [])
      .filter((i: any) => i.status !== 'void')
      .map((i: any) => `${i.quantity}x ${i.custom_name ?? i.menu_items?.name ?? 'Item'}`)
      .join(', '),
    subtotal: Number(o.subtotal) || 0,
    discountAmount: Number(o.discount_amount) || 0,
    total: Number(o.total) || 0,
  }))
}
