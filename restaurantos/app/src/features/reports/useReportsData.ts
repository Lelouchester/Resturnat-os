import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'

export type ReportRange = 'Today' | '7 days' | '30 days' | 'Custom'

export interface ReportsData {
  revenueTrend: { day: string; revenue: number }[]
  topItems: { name: string; qty: number; revenue: number }[]
  // Same underlying numbers as topItems, just not truncated to 5 — every
  // menu item (and custom/off-menu line) sold in the range, most-sold first.
  allItems: { name: string; qty: number; revenue: number }[]
  slowMovers: { name: string; qty: number }[]
  paymentSplit: { method: string; value: number; color: string }[]
  peakHours: { hour: string; orders: number }[]
  tableTurnover: { table: string; avgMinutes: number; turns: number }[]
  kitchenPerformance: { avgPrepMinutes: number; onTimePct: number }
  totalRevenue: number
  orderCount: number
  orderDetails: {
    id: string
    tableLabel: string
    closedAt: string
    items: { name: string; qty: number }[]
    total: number
    paidVia: string[]
    billingRemark: string | null
  }[]
}

const METHOD_COLOR: Record<string, string> = {
  cash: '#1f9d55',
  esewa: '#2a7fd4',
  fonepay: '#e8862e',
}
const FALLBACK_COLORS = ['#6d4fd6', '#d43d3d', '#8b8f98']

const EMPTY: ReportsData = {
  revenueTrend: [],
  topItems: [],
  allItems: [],
  slowMovers: [],
  paymentSplit: [],
  peakHours: [],
  tableTurnover: [],
  kitchenPerformance: { avgPrepMinutes: 0, onTimePct: 0 },
  totalRevenue: 0,
  orderCount: 0,
  orderDetails: [],
}

function rangeStart(range: ReportRange): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (range === '7 days') d.setDate(d.getDate() - 6)
  if (range === '30 days') d.setDate(d.getDate() - 29)
  return d
}

// A dozen or so orders a day, even over 30 days, is a small enough result
// set to just aggregate client-side in one round trip — same approach as
// the rest of the app's reporting (useShiftLedger, fetchOrderHistory).
async function loadReports(range: ReportRange, customFrom?: string, customTo?: string): Promise<ReportsData> {
  // Custom dates come from a plain <input type="date">, so they're
  // 'YYYY-MM-DD' with no time component — anchor them to local midnight
  // (start) and the last instant of that day (end) rather than letting the
  // browser interpret them as UTC, which would quietly shift results by
  // Nepal's +5:45 offset near the edges of the range.
  const from = range === 'Custom' && customFrom
    ? new Date(`${customFrom}T00:00:00`).toISOString()
    : rangeStart(range).toISOString()
  const to = range === 'Custom' && customTo
    ? new Date(`${customTo}T23:59:59.999`).toISOString()
    : new Date().toISOString()

  const { data, error } = await supabase
    .from('orders')
    .select(
      `id, table_id, opened_at, closed_at, total, billing_remark,
       restaurant_tables ( label ),
       order_items ( quantity, unit_price, is_complimentary, status, custom_name, created_at, status_updated_at, menu_items ( name ) ),
       payments ( amount, payment_methods ( key, label ) )`
    )
    .eq('branch_id', currentBranchId())
    .eq('status', 'paid')
    // Staff/no-charge orders (migration 014) still carry a real `total` —
    // that's item cost, not revenue — so they'd otherwise inflate every
    // figure below (revenue trend, top items, payment split) with money
    // that was never actually collected.
    .eq('is_staff_order', false)
    .gte('closed_at', from)
    .lte('closed_at', to)

  if (error) {
    console.error('[useReportsData] query failed', error)
    return EMPTY
  }
  const orders = data ?? []

  // Revenue trend — grouped by an unambiguous ISO date key (not a
  // re-parsed display string like "Sep 5", which has no year and sorts
  // unreliably across a month/year boundary, and inconsistently across
  // browsers — that was the cause of the trend line scrambling/dropping
  // points before). The pretty "Sep 5" label is only produced at the end,
  // purely for display.
  const revenueByDay = new Map<string, number>() // key: 'YYYY-MM-DD'
  for (const o of orders) {
    const d = new Date(o.closed_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + Number(o.total))
  }
  const revenueTrend = Array.from(revenueByDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0])) // ISO keys sort correctly as plain strings, no date re-parsing involved
    .map(([key, revenue]) => ({
      day: new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      revenue,
    }))

  // Top items / slow movers — by quantity sold, excluding voided lines.
  const itemStats = new Map<string, { qty: number; revenue: number }>()
  for (const o of orders) {
    for (const item of (o as any).order_items ?? []) {
      if (item.status === 'void') continue
      const name = item.custom_name ?? item.menu_items?.name ?? 'Item'
      const cur = itemStats.get(name) ?? { qty: 0, revenue: 0 }
      cur.qty += item.quantity
      cur.revenue += item.is_complimentary ? 0 : item.quantity * Number(item.unit_price)
      itemStats.set(name, cur)
    }
  }
  const itemsSorted = Array.from(itemStats.entries()).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.qty - a.qty)
  const topItems = itemsSorted.slice(0, 5)
  const allItems = itemsSorted
  const slowMovers = itemsSorted.slice(-3).reverse().map((i) => ({ name: i.name, qty: i.qty }))

  // Payment split — real methods only, colored consistently with the rest of the app.
  const paymentTotals = new Map<string, { label: string; value: number }>()
  for (const o of orders) {
    for (const p of (o as any).payments ?? []) {
      const key = p.payment_methods?.key ?? 'other'
      const label = p.payment_methods?.label ?? 'Other'
      const cur = paymentTotals.get(key) ?? { label, value: 0 }
      cur.value += Number(p.amount)
      paymentTotals.set(key, cur)
    }
  }
  const paymentSplit = Array.from(paymentTotals.entries()).map(([key, v], i) => ({
    method: v.label,
    value: v.value,
    color: METHOD_COLOR[key] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }))

  // Peak hours — order count by hour of day.
  const hourCounts = new Map<number, number>()
  for (const o of orders) {
    const hour = new Date(o.closed_at).getHours()
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1)
  }
  const peakHours = Array.from(hourCounts.entries())
    .map(([hour, orders]) => ({ hour: hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`, orders, _hour: hour }))
    .sort((a, b) => a._hour - b._hour)
    .map(({ hour, orders }) => ({ hour, orders }))

  // Table turnover — avg minutes seated (opened_at to closed_at) and turn count per table.
  const tableStats = new Map<string, { totalMinutes: number; turns: number }>()
  for (const o of orders) {
    const label = (o as any).restaurant_tables?.label ?? '—'
    const minutes = (new Date(o.closed_at).getTime() - new Date(o.opened_at).getTime()) / 60000
    const cur = tableStats.get(label) ?? { totalMinutes: 0, turns: 0 }
    cur.totalMinutes += minutes
    cur.turns += 1
    tableStats.set(label, cur)
  }
  const tableTurnover = Array.from(tableStats.entries())
    .map(([table, s]) => ({ table, avgMinutes: Math.round(s.totalMinutes / s.turns), turns: s.turns }))
    .sort((a, b) => b.turns - a.turns)
    .slice(0, 8)

  // Kitchen performance — how long an item sat between being fired and being
  // marked served. "On time" is a working definition (15 minutes), not a
  // configurable setting yet.
  const prepTimes: number[] = []
  for (const o of orders) {
    for (const item of (o as any).order_items ?? []) {
      if (item.status !== 'served' || !item.status_updated_at) continue
      const minutes = (new Date(item.status_updated_at).getTime() - new Date(item.created_at).getTime()) / 60000
      if (minutes >= 0) prepTimes.push(minutes)
    }
  }
  const avgPrepMinutes = prepTimes.length > 0 ? Math.round(prepTimes.reduce((s, m) => s + m, 0) / prepTimes.length) : 0
  const onTimePct = prepTimes.length > 0 ? Math.round((prepTimes.filter((m) => m <= 15).length / prepTimes.length) * 100) : 0

  const orderDetails = orders
    .map((o: any) => ({
      id: o.id,
      tableLabel: o.restaurant_tables?.label ?? 'Unknown',
      closedAt: o.closed_at,
      items: Object.values(
        (o.order_items ?? [])
          .filter((item: any) => item.status !== 'void')
          .reduce((acc: Record<string, { name: string; qty: number }>, item: any) => {
            const name = item.custom_name ?? item.menu_items?.name ?? 'Item'
            acc[name] = acc[name] ? { name, qty: acc[name].qty + item.quantity } : { name, qty: item.quantity }
            return acc
          }, {})
      ) as { name: string; qty: number }[],
      total: Number(o.total),
      paidVia: (o.payments ?? []).map((p: any) => p.payment_methods?.label ?? 'Other'),
      billingRemark: o.billing_remark ?? null,
    }))
    .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())

  return {
    revenueTrend,
    topItems,
    allItems,
    slowMovers,
    paymentSplit,
    peakHours,
    tableTurnover,
    kitchenPerformance: { avgPrepMinutes, onTimePct },
    totalRevenue: orders.reduce((s, o) => s + Number(o.total), 0),
    orderCount: orders.length,
    orderDetails,
  }
}

export function useReportsData(range: ReportRange, customFrom?: string, customTo?: string) {
  const [data, setData] = useState<ReportsData>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // A custom range with only one end picked so far isn't a real query yet
    // — wait for both dates rather than firing off a request that'd
    // silently fall back to "today" and confuse whoever's mid-pick.
    if (range === 'Custom' && (!customFrom || !customTo)) {
      setData(EMPTY)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    loadReports(range, customFrom, customTo).then((result) => {
      if (!cancelled) {
        setData(result)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [range, customFrom, customTo])

  return { data, loading }
}
