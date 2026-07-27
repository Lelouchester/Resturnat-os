import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'

export interface MethodLedger {
  revenue: number
  purchases: number
}

// Real money in/out per payment method since the shift opened, straight from
// ledger_entries (the same table Billing deposits into and Purchasing
// withdraws from) — this is what "Revenue" on Accounts is built from.
export function useShiftLedger(shiftId: string | undefined, openedAt: string | undefined) {
  const [byMethod, setByMethod] = useState<Record<string, MethodLedger>>({})
  const [orderCount, setOrderCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!shiftId || !openedAt) {
      setByMethod({})
      setOrderCount(0)
      setLoading(false)
      return
    }
    setLoading(true)

    const { data, error } = await supabase
      .from('ledger_entries')
      .select('amount, reason, order_id, accounts!inner ( branch_id, payment_methods ( key ) )')
      .eq('accounts.branch_id', CURRENT_BRANCH_ID)
      .gte('created_at', openedAt)

    if (error) {
      console.error('[useShiftLedger] query failed', error)
      setLoading(false)
      return
    }

    const next: Record<string, MethodLedger> = {}
    const paidOrderIds = new Set<string>()
    for (const row of data ?? []) {
      const key = (row as any).accounts?.payment_methods?.key
      if (!key) continue
      if (!next[key]) next[key] = { revenue: 0, purchases: 0 }
      if (row.reason === 'order payment') {
        next[key].revenue += Number(row.amount)
        if (row.order_id) paidOrderIds.add(row.order_id)
      } else if (row.reason === 'purchase payment') {
        next[key].purchases += Math.abs(Number(row.amount))
      }
    }
    setByMethod(next)
    setOrderCount(paidOrderIds.size)
    setLoading(false)
  }, [shiftId, openedAt])

  useEffect(() => {
    reload()
    if (!shiftId) return
    const channel = supabase
      .channel(`shift-ledger:${shiftId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_entries' }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [shiftId, reload])

  return { byMethod, orderCount, loading }
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

// Completed (paid) orders in a date range, newest first, for the Order
// History list and CSV export — capped at `limit` (default 50).
export async function fetchOrderHistory(fromISO: string, toISO: string, limit = 50): Promise<OrderHistoryRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, closed_at, subtotal, discount_amount, total, restaurant_tables ( label ), order_items ( quantity, custom_name, is_complimentary, status, menu_items ( name ) )')
    .eq('status', 'paid')
    .gte('closed_at', fromISO)
    .lte('closed_at', toISO)
    .order('closed_at', { ascending: false })
    .limit(limit)

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
