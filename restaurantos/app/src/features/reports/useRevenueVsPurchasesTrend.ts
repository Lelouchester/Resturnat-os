import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { nepalDateKey, nepalDateKeyToLabel, nepalWeekStartKey, nepalDayStartUTC, nepalDayEndUTC } from '../../shared/lib/nepalDate'

export type GlanceRange = '7 days' | '30 days' | '90 days' | 'custom'

export interface GlanceTrendPoint {
  period: string
  revenue: number
  purchases: number
}

// A Nepal-anchored day key, or that week's Sunday, still as a key — never
// a display string. Bucketing by a device-local display label (the old
// approach here) is exactly what caused the recurring "trend line is
// broken" reports: a transaction between midnight and 5:45am Nepal time
// lands on a different calendar day depending on the viewing device's own
// clock/timezone, so two people looking at the same range could silently
// get different buckets. See shared/lib/nepalDate.ts.
function bucketKey(date: Date, weekly: boolean): string {
  const dayKey = nepalDateKey(date)
  return weekly ? nepalWeekStartKey(dayKey) : dayKey
}

/**
 * The "where are we headed" glance — revenue and purchases side by side
 * over a quick default range, so it's visible the moment Reports opens
 * instead of needing a date range picked first every time.
 */
export function useRevenueVsPurchasesTrend(range: { from: string; to: string }) {
  const [points, setPoints] = useState<GlanceTrendPoint[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalPurchases, setTotalPurchases] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const from = nepalDayStartUTC(range.from)
      const to = nepalDayEndUTC(range.to)
      const spanDays = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000
      const weekly = spanDays > 60

      const [{ data: orders, error: ordersErr }, { data: lines, error: linesErr }] = await Promise.all([
        supabase
          .from('orders')
          .select('total, closed_at')
          .eq('status', 'paid')
          // Staff/no-charge orders (migration 014) carry a real `total` —
          // that's item cost, not revenue — so they'd otherwise inflate
          // this figure with money that was never actually collected,
          // and disagree with the (correctly-filtered) figures elsewhere
          // in Reports for the exact same range.
          .eq('is_staff_order', false)
          .gte('closed_at', from)
          .lte('closed_at', to),
        supabase
          .from('purchase_lines')
          .select('quantity, unit_cost, purchases!inner ( created_at, status )')
          .neq('purchases.status', 'cancelled')
          .gte('purchases.created_at', from)
          .lte('purchases.created_at', to),
      ])

      if (ordersErr) console.error('[useRevenueVsPurchasesTrend] orders query failed', ordersErr)
      if (linesErr) console.error('[useRevenueVsPurchasesTrend] purchase_lines query failed', linesErr)
      if (cancelled) return

      const byBucket = new Map<string, { revenue: number; purchases: number; sortKey: number }>()
      let revSum = 0
      let purSum = 0

      for (const o of orders ?? []) {
        const d = new Date((o as any).closed_at)
        const key = bucketKey(d, weekly)
        const amt = Number((o as any).total)
        const cur = byBucket.get(key) ?? { revenue: 0, purchases: 0, sortKey: d.getTime() }
        cur.revenue += amt
        byBucket.set(key, cur)
        revSum += amt
      }

      for (const l of lines ?? []) {
        const purchase = (l as any).purchases
        const d = new Date(purchase.created_at)
        const key = bucketKey(d, weekly)
        const amt = Number((l as any).quantity) * Number((l as any).unit_cost)
        const cur = byBucket.get(key) ?? { revenue: 0, purchases: 0, sortKey: d.getTime() }
        cur.purchases += amt
        byBucket.set(key, cur)
        purSum += amt
      }

      // Was previously left in whatever order orders/purchases happened to
      // load in (JS Map preserves insertion order) — meaning the chart's
      // x-axis could come out scrambled rather than chronological. Sort by
      // each bucket's actual timestamp, not the display string.
      const result = Array.from(byBucket.entries())
        .map(([period, v]) => ({ period, revenue: v.revenue, purchases: v.purchases, sortKey: v.sortKey }))
        .sort((a, b) => a.sortKey - b.sortKey)
        .map(({ period, revenue, purchases }) => ({ period: nepalDateKeyToLabel(period), revenue, purchases }))

      setPoints(result)
      setTotalRevenue(revSum)
      setTotalPurchases(purSum)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [range.from, range.to])

  return { points, totalRevenue, totalPurchases, loading }
}
