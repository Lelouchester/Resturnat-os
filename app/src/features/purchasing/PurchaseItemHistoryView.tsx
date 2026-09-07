import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Card } from '../../shared/ui/Card'
import { useInventoryStore } from '../inventory/inventoryStore'
import { usePurchasingStore } from '../purchasing/purchasingStore'
import type { Supplier } from './types'

const RANGE_DAYS: Record<'30 days' | '90 days' | '180 days' | 'All time', number | null> = {
  '30 days': 30,
  '90 days': 90,
  '180 days': 180,
  'All time': null,
}

/**
 * Pick any inventory item — including ones like Gas or Cigarettes that
 * aren't linked to a menu item, so they'd never show up in the
 * bought-vs-sold Item Usage report — and see literally every purchase of
 * it: when, how much, from whom. The point isn't the total, it's the
 * rhythm: milk shows up every day or two, gas maybe once a month. That
 * rhythm is what "average days between purchases" below is trying to
 * surface directly instead of making someone eyeball a list of dates.
 */
export function PurchaseItemHistoryView() {
  const inventoryItems = useInventoryStore((s) => s.items)
  const purchases = usePurchasingStore((s) => s.purchases)
  const suppliers = usePurchasingStore((s) => s.suppliers)
  const [itemId, setItemId] = useState<string>('')
  const [rangeKey, setRangeKey] = useState<keyof typeof RANGE_DAYS>('90 days')

  const activeItems = useMemo(
    () => [...inventoryItems].filter((i) => !i.isArchived).sort((a, b) => a.name.localeCompare(b.name)),
    [inventoryItems]
  )

  const cutoff = useMemo(() => {
    const days = RANGE_DAYS[rangeKey]
    if (days === null) return null
    const d = new Date()
    d.setDate(d.getDate() - days)
    d.setHours(0, 0, 0, 0)
    return d
  }, [rangeKey])

  const records = useMemo(() => {
    if (!itemId) return []
    const rows: { date: string; quantity: number; unitCost: number; supplierName: string; purchaseId: string }[] = []
    for (const p of purchases) {
      if (p.status === 'cancelled') continue
      if (cutoff && new Date(p.createdAt) < cutoff) continue
      for (const l of p.lines) {
        if (l.kind === 'inventory' && l.inventoryItemId === itemId) {
          const supplier = suppliers.find((s: Supplier) => s.id === p.supplierId)
          rows.push({ date: p.createdAt, quantity: l.quantity, unitCost: l.unitCost, supplierName: supplier?.name ?? 'One-off', purchaseId: p.id })
        }
      }
    }
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [purchases, suppliers, itemId, cutoff])

  const selectedItem = activeItems.find((i) => i.id === itemId)

  // Bucketed by calendar date for the chart — someone buying the same item
  // twice in one day (a top-up order) should read as one taller bar for
  // that day, not two separate points that make the rhythm harder to read.
  const chartData = useMemo(() => {
    const byDay = new Map<string, number>() // key: 'YYYY-MM-DD'
    for (const r of records) {
      const d = new Date(r.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      byDay.set(key, (byDay.get(key) ?? 0) + r.quantity)
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, qty]) => ({
        day: new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        qty,
      }))
  }, [records])

  const stats = useMemo(() => {
    if (records.length === 0) return null
    const totalQty = records.reduce((s, r) => s + r.quantity, 0)
    const totalSpend = records.reduce((s, r) => s + r.quantity * r.unitCost, 0)
    // Distinct purchase days, not distinct line-item rows — two top-up
    // orders on the same day are one restocking event, not two.
    const distinctDays = new Set(records.map((r) => new Date(r.date).toDateString())).size
    let avgDaysBetween: number | null = null
    if (distinctDays > 1) {
      const sortedAsc = [...records].map((r) => new Date(r.date).getTime()).sort((a, b) => a - b)
      const span = sortedAsc[sortedAsc.length - 1] - sortedAsc[0]
      avgDaysBetween = Math.round(span / (24 * 60 * 60 * 1000) / (distinctDays - 1))
    }
    return { totalQty, totalSpend, distinctDays, avgDaysBetween }
  }, [records])

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm text-ink/50">Pick any stock item — including ones not sold directly, like gas or cleaning supplies — to see its buying pattern.</p>
        <div className="flex gap-1 bg-surface border border-ink/10 rounded-xl p-1">
          {(Object.keys(RANGE_DAYS) as (keyof typeof RANGE_DAYS)[]).map((r) => (
            <button
              key={r}
              onClick={() => setRangeKey(r)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${rangeKey === r ? 'bg-ink text-paper' : 'text-ink/50'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <select
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        className="w-full mb-4 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember bg-surface"
      >
        <option value="">Select an item…</option>
        {activeItems.map((i) => (
          <option key={i.id} value={i.id}>{i.name}</option>
        ))}
      </select>

      {!itemId ? (
        <p className="text-sm text-ink/30 italic py-16 text-center border border-dashed border-ink/10 rounded-2xl">
          Pick an item above to see when and how much of it gets bought.
        </p>
      ) : records.length === 0 ? (
        <p className="text-sm text-ink/30 italic py-16 text-center border border-dashed border-ink/10 rounded-2xl">
          No purchases of {selectedItem?.name} in this range.
        </p>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Card className="p-3">
                <div className="text-[10px] uppercase tracking-wide text-ink/40">Total bought</div>
                <div className="font-ticket font-bold text-lg">{stats.totalQty} <span className="text-xs font-normal text-ink/50">{selectedItem?.unit}</span></div>
              </Card>
              <Card className="p-3">
                <div className="text-[10px] uppercase tracking-wide text-ink/40">Total spent</div>
                <div className="font-ticket font-bold text-lg">Rs. {Math.round(stats.totalSpend).toLocaleString()}</div>
              </Card>
              <Card className="p-3">
                <div className="text-[10px] uppercase tracking-wide text-ink/40">Times bought</div>
                <div className="font-ticket font-bold text-lg">{stats.distinctDays}</div>
              </Card>
              <Card className="p-3">
                <div className="text-[10px] uppercase tracking-wide text-ink/40">Avg. days between</div>
                <div className="font-ticket font-bold text-lg">{stats.avgDaysBetween ?? '—'}</div>
              </Card>
            </div>
          )}

          <Card className="p-4 mb-4">
            <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Buying pattern</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'rgba(20,22,26,0.4)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(20,22,26,0.4)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }}
                  formatter={(v: any) => [`${v} ${selectedItem?.unit ?? ''}`, 'Bought']}
                />
                <Bar dataKey="qty" fill="#e8862e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-2">Every purchase</div>
          <div className="space-y-2">
            {records.map((r, i) => (
              <Card key={`${r.purchaseId}-${i}`} className="p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">{new Date(r.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</div>
                  <div className="text-xs text-ink/40">{r.supplierName}</div>
                </div>
                <div className="text-right">
                  <div className="font-ticket font-bold text-sm">{r.quantity} {selectedItem?.unit}</div>
                  <div className="text-xs text-ink/40">Rs. {r.unitCost}/{selectedItem?.unit} · Rs. {Math.round(r.quantity * r.unitCost)}</div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
