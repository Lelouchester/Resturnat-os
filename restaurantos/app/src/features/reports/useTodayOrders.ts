import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'

export interface TodayOrderRow {
  id: string
  tableLabel: string
  customerName: string | null
  closedAt: string
  total: number
  itemsSummary: string
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
  const [loading, setLoading] = useState(true)

  async function reload() {
    setLoading(true)
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, closed_at, total, restaurant_tables ( label ), customers ( name ), order_items ( quantity, custom_name, status, menu_items ( name ) )'
      )
      .eq('status', 'paid')
      .gte('closed_at', dayStart.toISOString())
      .order('closed_at', { ascending: false })

    if (error) console.error('[useTodayOrders] query failed', error)

    const rows: TodayOrderRow[] = (data ?? []).map((o: any) => {
      const activeItems = (o.order_items ?? []).filter((i: any) => i.status !== 'void')
      return {
        id: o.id,
        tableLabel: o.restaurant_tables?.label ?? '—',
        customerName: o.customers?.name ?? null,
        closedAt: o.closed_at,
        total: Number(o.total) || 0,
        itemsSummary: activeItems.map((i: any) => `${i.quantity}x ${i.custom_name ?? i.menu_items?.name ?? 'Item'}`).join(', '),
      }
    })

    setOrders(rows)
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  return { orders, loading, reload }
}
