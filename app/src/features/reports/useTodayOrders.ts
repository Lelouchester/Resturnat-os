import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { nepalToday, nepalDayStartUTC } from '../../shared/lib/nepalDate'

export interface TodayOrderRow {
  id: string
  tableLabel: string
  customerName: string | null
  closedAt: string
  total: number
  itemsSummary: string
  activityNote: string | null
  billingRemark: string | null
}

/**
 * Every order billed today, regardless of whether a customer was attached
 * — the "recon" list for finding and cancelling a same-day mistake (a
 * duplicate entry, a wrong table). Cancelled orders are excluded once
 * they're cancelled, since the point here is "which of today's still-active
 * bills needs fixing."
 */
export function useTodayOrders() {
  const [orders, setOrders] = useState<TodayOrderRow[]>([])
  // Staff (no-charge) orders billed today. They're recorded, but they're not
  // sales, so they're kept out of `orders` and only summarised here.
  const [staffSummary, setStaffSummary] = useState({ count: 0, value: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    setError(null)
    const dayStart = nepalDayStartUTC(nepalToday())

    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, closed_at, total, is_staff_order, activity_note, billing_remark, restaurant_tables ( label ), customers ( name ), order_items ( quantity, custom_name, status, menu_items ( name ) )'
      )
      .eq('status', 'paid')
      // A table merged into another table's bill is a Rs. 0 shell — the
      // surviving order carries the whole bill, so only that one is listed.
      .is('merged_into_order_id', null)
      .gte('closed_at', dayStart)
      .order('closed_at', { ascending: false })
      .limit(2000)

    if (error) {
      console.error('[useTodayOrders] query failed', error)
      // Say so, rather than showing "No orders billed today yet" for what
      // is really a failed request.
      setError("Couldn't load today's orders — check your connection and try again.")
      setLoading(false)
      return
    }

    const all = data ?? []
    const staff = all.filter((o: any) => o.is_staff_order)
    setStaffSummary({ count: staff.length, value: staff.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0) })

    const rows: TodayOrderRow[] = all.filter((o: any) => !o.is_staff_order).map((o: any) => {
      const activeItems = (o.order_items ?? []).filter((i: any) => i.status !== 'void')
      return {
        id: o.id,
        tableLabel: o.restaurant_tables?.label ?? '—',
        customerName: o.customers?.name ?? null,
        closedAt: o.closed_at,
        total: Number(o.total) || 0,
        itemsSummary: activeItems.map((i: any) => `${i.quantity}x ${i.custom_name ?? i.menu_items?.name ?? 'Item'}`).join(', '),
        activityNote: o.activity_note ?? null,
        billingRemark: o.billing_remark ?? null,
      }
    })

    setOrders(rows)
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  return { orders, staffSummary, loading, error, reload }
}
