export type LineStatus = 'active' | 'void' | 'complimentary'

export interface CartLine {
  key: string          // menuItemId + note hash, so same item with different notes are separate lines
  menuItemId: string
  name: string
  unitPrice: number
  quantity: number
  note?: string
  status: LineStatus
  voidReason?: string
}

// ---------------------------------------------------------------------------
// Real order data (from Supabase `orders` + `order_items`) — used by
// ordersStore, and consumed by Orders, Kitchen, and Billing alike.
// ---------------------------------------------------------------------------
export type OrderItemStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'void'
export type OrderStatus = 'open' | 'billing' | 'paid' | 'cancelled'

export interface OrderItemRow {
  id: string
  menuItemId: string | null
  customName?: string
  name: string // resolved display name — menu item name, or custom_name for one-off items
  quantity: number
  unitPrice: number
  note?: string
  status: OrderItemStatus
  isComplimentary: boolean
  voidReason?: string
  createdAt: string
}

export interface LiveOrder {
  id: string
  tableId: string
  tableLabel: string
  status: OrderStatus
  customerId?: string
  mergedIntoOrderId?: string // set when this order's bill was folded into another table's
  waiterId?: string
  shiftId?: string
  subtotal: number
  discountAmount: number
  serviceCharge: number
  taxAmount: number
  tipAmount: number
  total: number
  splitGuestCount: number
  openedAt: string
  closedAt?: string
  items: OrderItemRow[]
}
