import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'

export type GlanceRange = '7 days' | '30 days' | '90 days'

export interface GlanceTrendPoint {
  period: string
  revenue: number
  purchases: number
}

function rangeStart(range: GlanceRange): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const days = range === '7 days' ? 6 : range === '30 days' ? 29 : 89
  d.setDate(d.getDate() - days)
  return d
}

function bucketKey(date: Date, weekly: boolean): string {
  if (!weekly) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const weekStart = new Date(date)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  return weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * The "where are we headed" glance — revenue and purchases side by side
 * over a quick default range, so it's visible the moment Reports opens
 * instead of needing a date range picked first every time.
 */
export function useRevenueVsPurchasesTrend(range: GlanceRange) {
  const [points, setPoints] = useState<GlanceTrendPoint[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalPurchases, setTotalPurchases] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const from = rangeStart(range)
      const weekly = range === '90 days'

      const [{ data: orders, error: ordersErr }, { data: lines, error: linesErr }] = await Promise.all([
        supabase.from('orders').select('total, closed_at').eq('status', 'paid').gte('closed_at', from.toISOString()),
        supabase
          .from('purchase_lines')
          .select('quantity, unit_cost, purchases!inner ( created_at, status )')
          .neq('purchases.status', 'cancelled')
          .gte('purchases.created_at', from.toISOString()),
      ])

      if (ordersErr) console.error('[useRevenueVsPurchasesTrend] orders query failed', ordersErr)
      if (linesErr) console.error('[useRevenueVsPurchasesTrend] purchase_lines query failed', linesErr)
      if (cancelled) return

      const byBucket = new Map<string, { revenue: number; purchases: number }>()
      let revSum = 0
      let purSum = 0

      for (const o of orders ?? []) {
        const key = bucketKey(new Date((o as any).closed_at), weekly)
        const amt = Number((o as any).total)
        const cur = byBucket.get(key) ?? { revenue: 0, purchases: 0 }
        cur.revenue += amt
        byBucket.set(key, cur)
        revSum += amt
      }

      for (const l of lines ?? []) {
        const purchase = (l as any).purchases
        const key = bucketKey(new Date(purchase.created_at), weekly)
        const amt = Number((l as any).quantity) * Number((l as any).unit_cost)
        const cur = byBucket.get(key) ?? { revenue: 0, purchases: 0 }
        cur.purchases += amt
        byBucket.set(key, cur)
        purSum += amt
      }

      const result = Array.from(byBucket.entries()).map(([period, v]) => ({ period, ...v }))

      setPoints(result)
      setTotalRevenue(revSum)
      setTotalPurchases(purSum)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [range])

  return { points, totalRevenue, totalPurchases, loading }
}
