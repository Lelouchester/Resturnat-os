import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'

export type TrendRange = '7 days' | '30 days' | '90 days'

export interface PurchaseTrendsData {
  spendTrend: { period: string; spend: number }[]
  topItems: { name: string; unit?: string; qty: number; spend: number }[]
  bySupplier: { name: string; spend: number }[]
  totalSpend: number
  purchaseCount: number
}

const EMPTY: PurchaseTrendsData = { spendTrend: [], topItems: [], bySupplier: [], totalSpend: 0, purchaseCount: 0 }

function rangeStart(range: TrendRange): Date {
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
 * Where the money's going and what's actually being bought — spend over
 * time, the items that make up most of the purchasing budget, and which
 * suppliers get the most. Cancelled purchases are excluded throughout,
 * same as the running total on the purchase history list.
 */
export function usePurchaseTrendsData(range: TrendRange) {
  const [data, setData] = useState<PurchaseTrendsData>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const from = rangeStart(range)

      const { data: lines, error } = await supabase
        .from('purchase_lines')
        .select(
          'description, quantity, unit_cost, inventory_item_id, inventory_items ( name, unit ), purchases!inner ( created_at, status, supplier_id, suppliers ( name ) )'
        )
        .neq('purchases.status', 'cancelled')
        .gte('purchases.created_at', from.toISOString())

      if (error) console.error('[usePurchaseTrendsData] query failed', error)
      if (cancelled) return

      const weekly = range === '90 days'
      const trendMap = new Map<string, number>()
      const itemMap = new Map<string, { name: string; unit?: string; qty: number; spend: number }>()
      const supplierMap = new Map<string, number>()
      let totalSpend = 0

      for (const l of lines ?? []) {
        const row = l as any
        const purchase = row.purchases
        const lineTotal = Number(row.quantity) * Number(row.unit_cost)
        totalSpend += lineTotal

        const bucket = bucketKey(new Date(purchase.created_at), weekly)
        trendMap.set(bucket, (trendMap.get(bucket) ?? 0) + lineTotal)

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
      }

      // Purchase count wants the actual distinct purchases, not lines — do it as
      // a light second pass keyed by nothing we have here, so just count via a
      // Set of the purchase's created_at+supplier combo as a stable-enough key.
      const distinctPurchases = new Set((lines ?? []).map((l: any) => `${l.purchases.created_at}:${l.purchases.supplier_id}`))

      const spendTrend = Array.from(trendMap.entries()).map(([period, spend]) => ({ period, spend }))
      const topItems = Array.from(itemMap.values())
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 10)
      const bySupplier = Array.from(supplierMap.entries())
        .map(([name, spend]) => ({ name, spend }))
        .sort((a, b) => b.spend - a.spend)

      setData({ spendTrend, topItems, bySupplier, totalSpend, purchaseCount: distinctPurchases.size })
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [range])

  return { data, loading }
}
