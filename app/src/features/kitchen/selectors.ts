import type { LiveOrder } from '../orders/types'
import type { KitchenTicket } from './types'

// One ticket per table with an order still open or being billed — it stays
// on the board (fully crossed-out items and all) until the bill is actually
// closed out, not the moment the last item gets served. Fully-served tickets
// sort to the end, out of the way of ones the kitchen still needs to work.
export function buildKitchenTickets(orders: LiveOrder[]): KitchenTicket[] {
  const tickets: KitchenTicket[] = []
  for (const order of orders) {
    const items = order.items.filter((i) => i.status !== 'void')
    if (items.length === 0) continue
    const allServed = items.every((i) => i.status === 'served')
    const activeTimes = items.filter((i) => i.status !== 'served').map((i) => i.createdAt)
    const firedAt = activeTimes.length > 0 ? activeTimes.reduce((earliest, t) => (t < earliest ? t : earliest)) : items[0].createdAt
    tickets.push({ orderId: order.id, tableLabel: order.tableLabel, items, firedAt, allServed })
  }
  return tickets.sort((a, b) => {
    if (a.allServed !== b.allServed) return a.allServed ? 1 : -1
    return a.firedAt.localeCompare(b.firedAt)
  })
}
