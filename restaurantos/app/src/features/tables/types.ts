import type { TableStatus } from '../../shared/ui/StatusPill'

export interface RestaurantTable {
  id: string
  label: string
  seats: number
  status: TableStatus
  customerName?: string
  guestCount?: number
  waiterName?: string
  seatedAt?: string // ISO timestamp
  runningTotal?: number
}
