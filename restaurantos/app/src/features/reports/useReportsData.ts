import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'

export type ReportRange = 'Today' | '7 days' | '30 days'

export interface ReportsData {
  revenueTrend: { day: string; revenue: number }[]
  topItems: { name: string; qty: number; revenue: number }[]
  slowMovers: { name: string; qty: number }[]
  paymentSplit: { method: string; value: number; color: string }[]
  peakHours: { hour: string; orders: number }[]
  tableTurnover: { table: string; avgMinutes: number; turns: number }[]
  kitchenPerformance: { avgPrepMinutes: number; onTimePct: number }
  totalRevenue: number
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
  slowMovers: [],
  paymentSplit: [],
  peakHours: [],
  tableTurnover: [],
  kitchenPerformance: { avgPrepMinutes: 0, onTimePct: 0 },
  totalRevenue: 0,
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
async function loadReports(range: ReportRange): Promise<ReportsData> {
  const from = rangeStart(range).toISOString()

  const { data, error } = await supabase
    .from('orders')
    .select(
      `id, table_id, opened_at, closed_at, total,
       restaurant_tables ( label ),
       order_items ( quantity, unit_price, is_complimentary, status, custom_name, created_at, status_updated_at, menu_items ( name ) ),
       payments ( amount, payment_methods ( key, label ) )`
    )
    .eq('branch_id', currentBranchId())
    .eq('status', 'paid')
    .gte('closed_at', from)

  if (error) {
    console.error('[useReportsData] query failed', error)
    return EMPTY
  }
  const orders = data ?? []

  // Revenue trend — by calendar date across the whole range.
  const revenueByDay = new Map<string, number>()
  for (const o of orders) {
    const day = new Date(o.closed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + Number(o.total))
  }
  const revenueTrend = Array.from(revenueByDay.entries())
    .map(([day, revenue]) => ({ day, revenue }))
    .sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime())

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

  return {
    revenueTrend,
    topItems,
    slowMovers,
    paymentSplit,
    peakHours,
    tableTurnover,
    kitchenPerformance: { avgPrepMinutes, onTimePct },
    totalRevenue: orders.reduce((s, o) => s + Number(o.total), 0),
  }
}

export function useReportsData(range: ReportRange) {
  const [data, setData] = useState<ReportsData>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadReports(range).then((result) => {
      if (!cancelled) {
        setData(result)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [range])

  return { data, loading }
}
