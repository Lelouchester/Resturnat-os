import type { LiveOrder } from '../orders/types'
import type { KitchenTicket } from './types'

// One ticket per table with an active order — not per item. A table drops
// off the board the moment every one of its items has been marked served.
export function buildKitchenTickets(orders: LiveOrder[]): KitchenTicket[] {
  const tickets: KitchenTicket[] = []
  for (const order of orders) {
    const active = order.items.filter((i) => i.status !== 'served' && i.status !== 'void')
    if (active.length === 0) continue
    const firedAt = active.reduce((earliest, i) => (i.createdAt < earliest ? i.createdAt : earliest), active[0].createdAt)
    tickets.push({ orderId: order.id, tableLabel: order.tableLabel, items: active, firedAt })
  }
  return tickets.sort((a, b) => a.firedAt.localeCompare(b.firedAt))
}
