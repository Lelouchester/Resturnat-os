import type { OrderItemRow } from '../orders/types'

/**
 * One kitchen-board card per TABLE'S order — not per item. Whatever hasn't
 * been served yet for that table shows up as a single ticket with one
 * "Mark Served" action, matching how a real kitchen ticket reads.
 */
export interface KitchenTicket {
  orderId: string
  tableLabel: string
  items: OrderItemRow[] // active items only — served/void already dropped
  firedAt: string // earliest still-active item's created_at
}
