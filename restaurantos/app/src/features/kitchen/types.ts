import type { OrderItemStatus } from '../orders/types'

/**
 * A single kitchen-board card — one order_item, with its table attached.
 * Items advance individually (pending → preparing → ready → served) rather
 * than as a whole fired batch, since a table's items don't all finish
 * cooking at once.
 */
export interface KitchenTicket {
  id: string // order_item id
  orderId: string
  tableLabel: string
  name: string
  quantity: number
  note?: string
  isComplimentary: boolean
  status: OrderItemStatus
  firedAt: string
}
