import type { LiveOrder } from '../orders/types'
import type { KitchenTicket } from './types'

// One ticket per table with an unfinished order — the ticket itself only
// drops off the board once every item on it is served (or void). Individual
// served items stay visible on the ticket, crossed out, until then.
export function buildKitchenTickets(orders: LiveOrder[]): KitchenTicket[] {
  const tickets: KitchenTicket[] = []
  for (const order of orders) {
    const items = order.items.filter((i) => i.status !== 'void')
    const stillActive = items.some((i) => i.status !== 'served')
    if (!stillActive) continue
    const activeTimes = items.filter((i) => i.status !== 'served').map((i) => i.createdAt)
    const firedAt = activeTimes.length > 0 ? activeTimes.reduce((earliest, t) => (t < earliest ? t : earliest)) : items[0].createdAt
    tickets.push({ orderId: order.id, tableLabel: order.tableLabel, items, firedAt })
  }
  return tickets.sort((a, b) => a.firedAt.localeCompare(b.firedAt))
}
