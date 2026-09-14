import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'
import { nepalDateKeyToLabel } from '../../shared/lib/nepalDate'

export type GlanceRange = '7 days' | '30 days' | '90 days' | 'custom'

export interface GlanceTrendPoint {
  period: string
  revenue: number
  purchases: number
}

const EMPTY = { points: [] as GlanceTrendPoint[], totalRevenue: 0, totalPurchases: 0 }

/**
 * Does the day-by-day addition entirely in the database (see migration
 * 017, daily_revenue_vs_purchases) instead of pulling every individual
 * order and purchase-line row to the browser and adding them up in
 * JavaScript. That older approach is what caused the trend line to show
 * zero for a stretch of recent dates: a busy month is easily 1500-2000+
 * individual order rows, comfortably over Supabase's own server-side cap
 * on how many rows a single query can return — a cap that cannot be
 * overridden by a client-side .limit() call, no matter how high it's
 * set. This function always returns exactly one row per calendar day in
 * the range (30, 90, whatever was asked for), never one row per order,
 * so there's no volume of underlying data that can ever trigger that
 * failure mode again.
 */
export function useRevenueVsPurchasesTrend(range: { from: string; to: string }) {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    supabase
      .rpc('daily_revenue_vs_purchases', {
        p_branch_id: currentBranchId(),
        p_from: range.from,
        p_to: range.to,
      })
      .then(({ data: rows, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[useRevenueVsPurchasesTrend] query failed', error)
          setData(EMPTY)
          setLoading(false)
          return
        }
        const points: GlanceTrendPoint[] = (rows ?? []).map((r: any) => ({
          period: nepalDateKeyToLabel(r.day),
          revenue: Number(r.revenue),
          purchases: Number(r.purchases),
        }))
        const totalRevenue = points.reduce((s: number, p: GlanceTrendPoint) => s + p.revenue, 0)
        const totalPurchases = points.reduce((s: number, p: GlanceTrendPoint) => s + p.purchases, 0)
        setData({ points, totalRevenue, totalPurchases })
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [range.from, range.to])

  return { ...data, loading }
}
