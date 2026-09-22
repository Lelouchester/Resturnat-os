import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'
import { nepalDateKeyToLabel } from '../../shared/lib/nepalDate'
import { daysInRange, previousRange } from './trendMath'

export type GlanceRange = '7 days' | '30 days' | '90 days' | 'custom'

export interface GlanceTrendPoint {
  period: string // short label for the chart axis ("Sep 15")
  dateKey: string // 'YYYY-MM-DD', Nepal day — for the day-by-day table
  revenue: number
  purchases: number
}

interface PeriodTotals {
  revenue: number
  purchases: number
}

const EMPTY = {
  points: [] as GlanceTrendPoint[],
  totalRevenue: 0,
  totalPurchases: 0,
  // The same-length stretch just before this one, for "vs previous" — null
  // when it couldn't be loaded, so a failure never shows up as a fake zero.
  previous: null as PeriodTotals | null,
  days: 0,
}

function sumRows(rows: any[] | null): PeriodTotals {
  return (rows ?? []).reduce(
    (t: PeriodTotals, r: any) => ({ revenue: t.revenue + Number(r.revenue), purchases: t.purchases + Number(r.purchases) }),
    { revenue: 0, purchases: 0 }
  )
}

function fetchDaily(from: string, to: string) {
  return supabase.rpc('daily_revenue_vs_purchases', { p_branch_id: currentBranchId(), p_from: from, p_to: to })
}

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
  // A failed request is reported as such, not shown as "Rs. 0 sales".
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    const prev = previousRange(range.from, range.to)
    // The comparison period is fetched alongside; if only THAT fails, the
    // main numbers still show and the comparison is simply left out.
    Promise.all([fetchDaily(range.from, range.to), prev ? fetchDaily(prev.from, prev.to) : Promise.resolve(null)]).then(
      ([current, previous]) => {
        if (cancelled) return
        if (current.error) {
          console.error('[useRevenueVsPurchasesTrend] query failed', current.error)
          setData(EMPTY)
          setError(true)
          setLoading(false)
          return
        }
        const points: GlanceTrendPoint[] = (current.data ?? []).map((r: any) => ({
          period: nepalDateKeyToLabel(r.day),
          dateKey: r.day,
          revenue: Number(r.revenue),
          purchases: Number(r.purchases),
        }))
        const totalRevenue = points.reduce((s: number, p: GlanceTrendPoint) => s + p.revenue, 0)
        const totalPurchases = points.reduce((s: number, p: GlanceTrendPoint) => s + p.purchases, 0)
        setData({
          points,
          totalRevenue,
          totalPurchases,
          previous: previous && !previous.error ? sumRows(previous.data) : null,
          days: daysInRange(range.from, range.to),
        })
        setLoading(false)
      }
    )

    return () => {
      cancelled = true
    }
  }, [range.from, range.to])

  return { ...data, loading, error }
}
