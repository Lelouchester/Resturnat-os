import { useReportsData } from './useReportsData'
import { Card } from '../../shared/ui/Card'
import { useInventoryStore } from '../inventory/inventoryStore'
import { usePurchasingStore } from '../purchasing/purchasingStore'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useMemo } from 'react'

// Deliberately simple — this is for someone who wants the headline numbers
// in ten seconds, not someone digging into trends. That's what the
// Detailed Reports tab next to this one is for; this one never grows
// charts, date pickers, or comparisons. If it starts feeling like it needs
// those, that's a sign the feature belongs in Detailed Reports instead.
export function TodaySnapshot() {
  const { data, loading } = useReportsData('Today')
  const inventoryItems = useInventoryStore((s) => s.items)
  const purchases = usePurchasingStore((s) => s.purchases)
  const initPurchasing = usePurchasingStore((s) => s.init)
  const lowStockCount = useMemo(() => inventoryItems.filter((i) => i.currentStock <= i.minStock).length, [inventoryItems])

  useEffect(() => {
    initPurchasing()
  }, [initPurchasing])

  const todayStr = new Date().toDateString()
  const purchasesToday = useMemo(
    () => purchases.filter((p) => new Date(p.createdAt).toDateString() === todayStr && p.status !== 'cancelled'),
    [purchases, todayStr]
  )
  const purchasesTotal = purchasesToday.reduce((sum, p) => sum + p.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0), 0)

  const avgOrderValue = data.orderCount > 0 ? Math.round(data.totalRevenue / data.orderCount) : 0
  const totalPayments = data.paymentSplit.reduce((s, p) => s + p.value, 0)

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-28 rounded-2xl bg-ink/5 animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 rounded-2xl bg-ink/5 animate-pulse" />
          <div className="h-24 rounded-2xl bg-ink/5 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Headline number — the one thing someone glancing at this for two
          seconds should walk away with. */}
      <Card className="p-6 text-center bg-ink text-paper">
        <div className="text-xs uppercase tracking-wider text-paper/50 mb-1">Today's sales</div>
        <div className="font-ticket text-4xl font-bold text-ember">Rs. {data.totalRevenue.toLocaleString()}</div>
        <div className="text-xs text-paper/50 mt-1">
          {data.orderCount} order{data.orderCount === 1 ? '' : 's'} · Rs. {avgOrderValue.toLocaleString()} average
        </div>
      </Card>

      {purchasesToday.length > 0 && (
        <Card className="p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink/50">Purchases today</span>
          <span className="font-ticket font-bold">Rs. {purchasesTotal.toLocaleString()}</span>
        </Card>
      )}

      {data.totalRevenue === 0 ? (
        <p className="text-sm text-ink/30 italic py-10 text-center border border-dashed border-ink/10 rounded-2xl">
          No paid orders yet today.
        </p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            {/* Payment split — simple bars, not a chart */}
            <Card className="p-4">
              <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">By payment method</div>
              <div className="space-y-2.5">
                {data.paymentSplit.map((p) => (
                  <div key={p.method}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="capitalize">{p.method}</span>
                      <span className="font-ticket font-semibold">Rs. {p.value.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ink/5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${totalPayments > 0 ? (p.value / totalPayments) * 100 : 0}%`, backgroundColor: p.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Top sellers — just the top 3, not the full breakdown */}
            <Card className="p-4">
              <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Selling today</div>
              {data.topItems.length === 0 ? (
                <p className="text-xs text-ink/30 py-4">Nothing sold yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.topItems.slice(0, 3).map((item) => (
                    <div key={item.name} className="flex justify-between text-sm">
                      <span>{item.name}</span>
                      <span className="font-ticket font-semibold text-ink/50">{item.qty}×</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {lowStockCount > 0 && (
            <div className="flex items-center gap-2 text-xs font-semibold text-status-cleaning bg-status-cleaning-bg rounded-xl px-3 py-2.5">
              <AlertTriangle size={14} />
              {lowStockCount} inventory item{lowStockCount === 1 ? '' : 's'} at or below its low-stock level
            </div>
          )}

          {/* Every order today — table, time, what they had, what they paid */}
          <Card className="p-4">
            <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Today's orders</div>
            <div className="space-y-3">
              {data.orderDetails.map((o) => (
                <div key={o.id} className="flex items-start justify-between gap-3 pb-3 border-b border-ink/5 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-ticket font-bold">{o.tableLabel}</span>
                      <span className="text-xs text-ink/40">
                        {new Date(o.closedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-xs text-ink/50 truncate">
                      {o.items.map((i) => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(', ')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-ticket font-semibold">Rs. {o.total.toLocaleString()}</div>
                    <div className="text-[11px] text-ink/40">{o.paidVia.join(', ') || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
