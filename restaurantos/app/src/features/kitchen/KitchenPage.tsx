import { useEffect, useMemo } from 'react'
import { useOrdersStore } from '../orders/ordersStore'
import { buildKitchenTickets } from './selectors'
import { TicketCard } from './TicketCard'

export function KitchenPage() {
  const orders = useOrdersStore((s) => s.orders)
  const loading = useOrdersStore((s) => s.loading)
  const init = useOrdersStore((s) => s.init)
  const markItemsServed = useOrdersStore((s) => s.markItemsServed)

  useEffect(() => {
    init()
  }, [init])

  const tickets = useMemo(() => buildKitchenTickets(orders), [orders])

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <h1 className="font-ticket text-xl font-bold">Kitchen</h1>
        <p className="text-sm text-ink/50">{tickets.length} table{tickets.length === 1 ? '' : 's'} waiting on food</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-2xl bg-ink/5 animate-pulse" />)}
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-ink/30 italic py-16 text-center border border-dashed border-ink/10 rounded-2xl">
          All caught up — nothing waiting on the kitchen.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tickets.map((t) => (
            <TicketCard key={t.orderId} ticket={t} onMarkServed={(_, itemIds) => markItemsServed(itemIds)} />
          ))}
        </div>
      )}
    </div>
  )
}
