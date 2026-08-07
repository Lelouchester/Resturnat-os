import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'

export interface MethodLedger {
  revenue: number
  purchases: number
}

// Real money in/out per payment method since the shift opened, straight from
// ledger_entries (the same table Billing deposits into and Purchasing
// withdraws from) — this is what "Revenue" on Accounts is built from.
// `totalSalesAccrual` is a different number on purpose: it's every paid
// order's total for the shift regardless of whether it was actually
// collected yet — a due is still a real sale the moment food goes out, even
// if the cash for it hasn't landed in an account.
export function useShiftLedger(shiftId: string | undefined, openedAt: string | undefined) {
  const [byMethod, setByMethod] = useState<Record<string, MethodLedger>>({})
  const [orderCount, setOrderCount] = useState(0)
  const [totalSalesAccrual, setTotalSalesAccrual] = useState(0)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!shiftId || !openedAt) {
      setByMethod({})
      setOrderCount(0)
      setTotalSalesAccrual(0)
      setLoading(false)
      return
    }
    setLoading(true)

    const [{ data, error }, { data: salesData, error: salesErr }] = await Promise.all([
      supabase
        .from('ledger_entries')
        .select('amount, reason, order_id, accounts!inner ( branch_id, payment_methods ( key ) )')
        .eq('accounts.branch_id', currentBranchId())
        .gte('created_at', openedAt),
      supabase.from('orders').select('total').eq('shift_id', shiftId).eq('status', 'paid'),
    ])

    if (error) console.error('[useShiftLedger] ledger query failed', error)
    if (salesErr) console.error('[useShiftLedger] sales query failed', salesErr)

    const next: Record<string, MethodLedger> = {}
    const paidOrderIds = new Set<string>()
    for (const row of data ?? []) {
      const key = (row as any).accounts?.payment_methods?.key
      if (!key) continue
      if (!next[key]) next[key] = { revenue: 0, purchases: 0 }
      const amount = Number(row.amount)
      // Bucket by sign, not by exact reason string — money in is revenue
      // (order payments, dues settled), money out is a purchase, regardless
      // of which of purchasing's several reason labels wrote it.
      if (amount >= 0) {
        next[key].revenue += amount
        if (row.order_id) paidOrderIds.add(row.order_id)
      } else {
        next[key].purchases += Math.abs(amount)
      }
    }
    setByMethod(next)
    setOrderCount(paidOrderIds.size)
    setTotalSalesAccrual((salesData ?? []).reduce((s, o) => s + Number(o.total), 0))
    setLoading(false)
  }, [shiftId, openedAt])

  useEffect(() => {
    reload()
    if (!shiftId) return
    const channel = supabase
      .channel(`shift-ledger:${shiftId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_entries' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `shift_id=eq.${shiftId}` }, () => reload())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [shiftId, reload])

  return { byMethod, orderCount, totalSalesAccrual, loading }
}

export interface OrderHistoryLine {
  name: string
  quantity: number
  unitPrice: number
}

export interface OrderHistoryRow {
  id: string
  tableLabel: string
  customerName: string
  closedAt: string
  itemsSummary: string
  lines: OrderHistoryLine[]
  subtotal: number
  discountAmount: number
  serviceCharge: number
  taxAmount: number
  tipAmount: number
  total: number
  paidByMethod: Record<string, number> // e.g. {cash: 500, esewa: 200} — empty means fully due, unpaid
  paymentSummary: string // "Cash: 500, eSewa: 200" or "Due" for display
}

// Completed (paid) orders in a date range, newest first, for the Order
// History list, CSV export, and reprinting a past receipt — capped at
// `limit` (default 50).
export async function fetchOrderHistory(fromISO: string, toISO: string, limit = 50): Promise<OrderHistoryRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      `id, closed_at, subtotal, discount_amount, service_charge, tax_amount, tip_amount, total,
       restaurant_tables ( label ), customers ( name ),
       order_items ( quantity, unit_price, custom_name, is_complimentary, status, menu_items ( name ) ),
       payments ( amount, payment_methods ( key, label ) )`
    )
    .eq('status', 'paid')
    .gte('closed_at', fromISO)
    .lte('closed_at', toISO)
    .order('closed_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[fetchOrderHistory] query failed', error)
    return []
  }

  return (data ?? []).map((o: any) => {
    const activeItems = (o.order_items ?? []).filter((i: any) => i.status !== 'void')
    const paidByMethod: Record<string, number> = {}
    for (const p of o.payments ?? []) {
      const label = p.payment_methods?.label ?? p.payment_methods?.key ?? 'Other'
      paidByMethod[label] = (paidByMethod[label] ?? 0) + Number(p.amount)
    }
    const paidTotal = Object.values(paidByMethod).reduce((s, v) => s + v, 0)
    const paymentSummary =
      Object.keys(paidByMethod).length === 0
        ? 'Due (unpaid)'
        : Object.entries(paidByMethod)
            .map(([label, amt]) => `${label}: ${amt}`)
            .join(', ') + (paidTotal < Number(o.total) ? ' (partial, rest due)' : '')

    return {
      id: o.id,
      tableLabel: o.restaurant_tables?.label ?? '—',
      customerName: o.customers?.name ?? 'Walk-in',
      closedAt: o.closed_at,
      itemsSummary: activeItems.map((i: any) => `${i.quantity}x ${i.custom_name ?? i.menu_items?.name ?? 'Item'}`).join(', '),
      lines: activeItems.map((i: any) => ({
        name: i.custom_name ?? i.menu_items?.name ?? 'Item',
        quantity: i.quantity,
        unitPrice: i.is_complimentary ? 0 : Number(i.unit_price),
      })),
      subtotal: Number(o.subtotal) || 0,
      discountAmount: Number(o.discount_amount) || 0,
      serviceCharge: Number(o.service_charge) || 0,
      taxAmount: Number(o.tax_amount) || 0,
      tipAmount: Number(o.tip_amount) || 0,
      total: Number(o.total) || 0,
      paidByMethod,
      paymentSummary,
    }
  })
}
