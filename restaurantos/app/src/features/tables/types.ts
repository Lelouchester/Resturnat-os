import type { TableStatus } from '../../shared/ui/StatusPill'

export interface RestaurantTable {
  id: string
  label: string
  seats: number
  status: TableStatus
  customerName?: string
  customerPhone?: string
  customerId?: string // set once the guest is matched to (or created as) a real CRM record
  guestCount?: number
  waiterName?: string
  seatedAt?: string // ISO timestamp
}
