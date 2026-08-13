import { Card } from '../../shared/ui/Card'
import { useOrdersStore } from '../orders/ordersStore'
import { useTodayOrders } from './useTodayOrders'
import { useState } from 'react'

export function TodayOrdersReport() {
  const { orders, loading, reload } = useTodayOrders()
  const cancelPaidOrder = useOrdersStore((s) => s.cancelPaidOrder)
  const [error, setError] = useState<string | null>(null)

  async function handleCancel(orderId: string) {
    if (!window.confirm('Cancel this order? This reverts the money, stock, and any customer due it affected.')) return
    const result = await cancelPaidOrder(orderId)
    if (result.ok) reload()
    else setError(result.error ?? 'Could not cancel this order.')
  }

  return (
    <div>
      <p className="text-sm text-ink/50 mb-4">
        Every order billed today — for fixing a same-day mistake like a duplicate entry. Cancelling reverts the money, any tracked stock, and any effect on a customer's due. Yesterday's orders and earlier aren't shown here on purpose.
      </p>

      {error && <div className="mb-3 text-xs font-semibold text-status-cleaning bg-status-cleaning-bg rounded-xl px-3 py-2">{error}</div>}

      {loading ? (
        <div className="space-y-2">
          <div className="h-16 rounded-2xl bg-ink/5 animate-pulse" />
          <div className="h-16 rounded-2xl bg-ink/5 animate-pulse" />
        </div>
      ) : orders.length === 0 ? (
        <p className="text-sm text-ink/30 italic py-16 text-center border border-dashed border-ink/10 rounded-2xl">No orders billed today yet.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Card key={o.id} className="p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>{o.tableLabel}</span>
                  {o.customerName && <span className="text-ink/40 font-normal">· {o.customerName}</span>}
                  <span className="text-ink/30 font-normal text-xs">{new Date(o.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="text-xs text-ink/50 truncate">{o.itemsSummary}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-ticket font-bold text-sm">Rs. {o.total}</span>
                <button onClick={() => handleCancel(o.id)} className="text-xs font-semibold text-status-cleaning">
                  Cancel
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
