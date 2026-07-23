export type TicketStatus = 'pending' | 'preparing' | 'ready'

export interface TicketItem {
  name: string
  quantity: number
  note?: string
}

export interface KitchenTicket {
  id: string
  tableLabel: string
  items: TicketItem[]
  status: TicketStatus
  firedAt: string // ISO timestamp — when it was sent to the kitchen
}
