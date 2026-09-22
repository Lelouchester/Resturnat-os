import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'
import { nepalDateKeyToLabel } from '../../shared/lib/nepalDate'

export type TrendRange = '7 days' | '30 days' | '90 days' | 'custom'

export interface PurchaseTrendsData {
  spendTrend: { period: string; spend: number }[]
  topItems: { name: string; unit?: string; qty: number; spend: number }[]
  bySupplier: { name: string; spend: number }[]
  totalSpend: number
  purchaseCount: number
}

const EMPTY: PurchaseTrendsData = { spendTrend: [], topItems: [], bySupplier: [], totalSpend: 0, purchaseCount: 0 }

/**
 * Where the money's going and what's actually being bought — spend over
 * time, the items that make up most of the purchasing budget, and which
 * suppliers get the most. Cancelled purchases are excluded throughout,
 * same as the running total on the purchase history list.
 *
 * All three totals are computed inside the database (see migration 018)
 * instead of pulling every individual purchase_line row to the browser
 * and adding them up in JavaScript. That older approach is what caused
 * the revenue-vs-purchases trend to show zero for a stretch of recent
 * dates elsewhere in Reports — a busy range is easily 1000+ individual
 * rows, over Supabase's own server-side cap on how many rows a single
 * query can return, a cap no client-side .limit() can override. These
 * functions always return a small, fixed-shape result (one row per day,
 * or the top 10 items) no matter how much purchasing history sits
 * underneath, so there's no data volume that can trigger that failure
 * mode here.
 */
export function usePurchaseTrendsData(range: { from: string; to: string }) {
  const [data, setData] = useState<PurchaseTrendsData>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const branchId = currentBranchId()

    Promise.all([
      supabase.rpc('purchase_daily_spend', { p_branch_id: branchId, p_from: range.from, p_to: range.to }),
      supabase.rpc('purchase_totals_by_item', { p_branch_id: branchId, p_from: range.from, p_to: range.to }),
      supabase.rpc('purchase_totals_by_supplier', { p_branch_id: branchId, p_from: range.from, p_to: range.to }),
      // A count-only query never transfers row data regardless of volume —
      // safe on its own even without the functions above.
      supabase
        .from('purchases')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', branchId)
        .neq('status', 'cancelled')
        .gte('created_at', `${range.from}T00:00:00+05:45`)
        .lte('created_at', `${range.to}T23:59:59+05:45`),
    ]).then(([dailyRes, itemRes, supplierRes, countRes]) => {
      if (cancelled) return
      if (dailyRes.error) console.error('[usePurchaseTrendsData] daily spend query failed', dailyRes.error)
      if (itemRes.error) console.error('[usePurchaseTrendsData] by-item query failed', itemRes.error)
      if (supplierRes.error) console.error('[usePurchaseTrendsData] by-supplier query failed', supplierRes.error)
      if (countRes.error) console.error('[usePurchaseTrendsData] purchase count query failed', countRes.error)

      const spendTrend = (dailyRes.data ?? []).map((r: any) => ({
        period: nepalDateKeyToLabel(r.day),
        spend: Number(r.spend),
      }))
      const topItems = (itemRes.data ?? []).map((r: any) => ({
        name: r.name as string,
        unit: r.unit ?? undefined,
        qty: Number(r.qty),
        spend: Number(r.spend),
      }))
      const bySupplier = (supplierRes.data ?? []).map((r: any) => ({
        name: r.name as string,
        spend: Number(r.spend),
      }))
      const totalSpend = spendTrend.reduce((s: number, p: { spend: number }) => s + p.spend, 0)

      setData({ spendTrend, topItems, bySupplier, totalSpend, purchaseCount: countRes.count ?? 0 })
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [range.from, range.to])

  return { data, loading }
}
