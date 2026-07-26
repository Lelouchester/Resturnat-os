import type { LiveOrder } from '../orders/types'
import type { KitchenTicket } from './types'

// Flattens every active order's items into individual kitchen-board cards.
// Only items still in play (pending/preparing/ready) show up — served and
// void items drop off the board once they're done.
export function buildKitchenTickets(orders: LiveOrder[]): KitchenTicket[] {
  const tickets: KitchenTicket[] = []
  for (const order of orders) {
    for (const item of order.items) {
      if (item.status === 'served' || item.status === 'void') continue
      tickets.push({
        id: item.id,
        orderId: order.id,
        tableLabel: order.tableLabel,
        name: item.name,
        quantity: item.quantity,
        note: item.note,
        isComplimentary: item.isComplimentary,
        status: item.status,
        firedAt: item.createdAt,
      })
    }
  }
  return tickets.sort((a, b) => a.firedAt.localeCompare(b.firedAt))
}
