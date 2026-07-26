import { useEffect, useMemo } from 'react'
import { useOrdersStore } from '../orders/ordersStore'
import { buildKitchenTickets } from './selectors'
import { TicketCard } from './TicketCard'
import type { OrderItemStatus } from '../orders/types'

const COLUMNS: { status: OrderItemStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready' },
]

// pending → preparing → ready → served (tapping "Serve" clears it off the board)
const NEXT_STATUS: Record<'pending' | 'preparing' | 'ready', OrderItemStatus> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'served',
}

export function KitchenPage() {
  const orders = useOrdersStore((s) => s.orders)
  const loading = useOrdersStore((s) => s.loading)
  const init = useOrdersStore((s) => s.init)
  const updateItemStatus = useOrdersStore((s) => s.updateItemStatus)

  useEffect(() => {
    init()
  }, [init])

  const tickets = useMemo(() => buildKitchenTickets(orders), [orders])

  function advance(itemId: string) {
    const ticket = tickets.find((t) => t.id === itemId)
    if (!ticket || ticket.status === 'served' || ticket.status === 'void') return
    updateItemStatus(itemId, NEXT_STATUS[ticket.status])
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="font-ticket text-xl font-bold">Kitchen</h1>
        <p className="text-sm text-ink/50">{tickets.length} active ticket{tickets.length === 1 ? '' : 's'}</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((col) => (
            <div key={col.status} className="h-40 rounded-2xl bg-ink/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const colTickets = tickets.filter((t) => t.status === col.status)
            return (
              <div key={col.status}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">{col.label}</span>
                  <span className="text-xs font-ticket bg-ink/5 rounded-full px-1.5 py-0.5 font-semibold">{colTickets.length}</span>
                </div>
                <div className="space-y-3">
                  {colTickets.length === 0 && (
                    <p className="text-xs text-ink/30 italic py-6 text-center border border-dashed border-ink/10 rounded-2xl">
                      Nothing here
                    </p>
                  )}
                  {colTickets.map((t) => (
                    <TicketCard key={t.id} ticket={t} onAdvance={advance} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
