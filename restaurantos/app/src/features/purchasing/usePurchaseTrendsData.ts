import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { fetchAllRows } from '../../shared/lib/fetchAllRows'

export type TrendRange = '7 days' | '30 days' | '90 days' | 'custom'

export interface PurchaseTrendsData {
  spendTrend: { period: string; spend: number }[]
  topItems: { name: string; unit?: string; qty: number; spend: number }[]
  bySupplier: { name: string; spend: number }[]
  totalSpend: number
  purchaseCount: number
  detailsByBucket: Record<string, { name: string; qty: number; unit?: string; spend: number; supplier: string }[]>
}

const EMPTY: PurchaseTrendsData = { spendTrend: [], topItems: [], bySupplier: [], totalSpend: 0, purchaseCount: 0, detailsByBucket: {} }

function bucketKey(date: Date, weekly: boolean): string {
  if (!weekly) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const weekStart = new Date(date)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  return weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Where the money's going and what's actually being bought — spend over
 * time, the items that make up most of the purchasing budget, and which
 * suppliers get the most. Cancelled purchases are excluded throughout,
 * same as the running total on the purchase history list.
 */
export function usePurchaseTrendsData(range: { from: string; to: string }) {
  const [data, setData] = useState<PurchaseTrendsData>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const from = `${range.from}T00:00:00`
      const to = `${range.to}T23:59:59`

      const lines = await fetchAllRows<any>((f, t) =>
        supabase
          .from('purchase_lines')
          .select(
            'description, quantity, unit_cost, inventory_item_id, inventory_items ( name, unit ), purchases!inner ( created_at, status, supplier_id, suppliers ( name ) )'
          )
          .neq('purchases.status', 'cancelled')
          .gte('purchases.created_at', from)
          .lte('purchases.created_at', to)
          .range(f, t) as any
      )

      if (cancelled) return

      // Bucket weekly once the span gets long enough that daily bars would
      // be too cramped to read — same idea regardless of whether the range
      // came from a preset button or a manually picked start/end date.
      const spanDays = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000
      const weekly = spanDays > 60
      const trendMap = new Map<string, { spend: number; sortKey: number }>()
      const itemMap = new Map<string, { name: string; unit?: string; qty: number; spend: number }>()
      const supplierMap = new Map<string, number>()
      const detailsByBucket = new Map<string, { name: string; qty: number; unit?: string; spend: number; supplier: string }[]>()
      let totalSpend = 0

      for (const l of lines ?? []) {
        const row = l as any
        const purchase = row.purchases
        const lineTotal = Number(row.quantity) * Number(row.unit_cost)
        totalSpend += lineTotal

        const bucket = bucketKey(new Date(purchase.created_at), weekly)
        const cur = trendMap.get(bucket) ?? { spend: 0, sortKey: new Date(purchase.created_at).getTime() }
        cur.spend += lineTotal
        trendMap.set(bucket, cur)

        const itemKey = row.inventory_item_id ? `inv:${row.inventory_item_id}` : `desc:${row.description.trim().toLowerCase()}`
        const existing = itemMap.get(itemKey)
        const name = row.inventory_items?.name ?? row.description
        const unit = row.inventory_items?.unit
        if (existing) {
          existing.qty += Number(row.quantity)
          existing.spend += lineTotal
        } else {
          itemMap.set(itemKey, { name, unit, qty: Number(row.quantity), spend: lineTotal })
        }

        const supplierName = purchase.suppliers?.name ?? 'One-off'
        supplierMap.set(supplierName, (supplierMap.get(supplierName) ?? 0) + lineTotal)

        // Kept per-bucket so clicking a point on the chart can show exactly
        // what made up that day's (or week's) total, instead of just the
        // one summed number.
        const details = detailsByBucket.get(bucket) ?? []
        details.push({ name, qty: Number(row.quantity), unit, spend: lineTotal, supplier: supplierName })
        detailsByBucket.set(bucket, details)
      }

      // Purchase count wants the actual distinct purchases, not lines — do it as
      // a light second pass keyed by nothing we have here, so just count via a
      // Set of the purchase's created_at+supplier combo as a stable-enough key.
      const distinctPurchases = new Set((lines ?? []).map((l: any) => `${l.purchases.created_at}:${l.purchases.supplier_id}`))

      // Was previously left in whatever order lines happened to load in
      // (JS Map preserves insertion order) — meaning the chart's x-axis
      // could come out scrambled rather than chronological.
      const spendTrend = Array.from(trendMap.entries())
        .map(([period, v]) => ({ period, spend: v.spend, sortKey: v.sortKey }))
        .sort((a, b) => a.sortKey - b.sortKey)
        .map(({ period, spend }) => ({ period, spend }))
      const topItems = Array.from(itemMap.values())
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10)
      const bySupplier = Array.from(supplierMap.entries())
        .map(([name, spend]) => ({ name, spend }))
        .sort((a, b) => b.spend - a.spend)

      setData({
        spendTrend,
        topItems,
        bySupplier,
        totalSpend,
        purchaseCount: distinctPurchases.size,
        detailsByBucket: Object.fromEntries(detailsByBucket),
      })
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [range.from, range.to])

  return { data, loading }
}
