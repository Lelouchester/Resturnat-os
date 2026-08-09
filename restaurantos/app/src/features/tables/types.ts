import type { TableStatus } from '../../shared/ui/StatusPill'

export interface RestaurantTable {
  id: string
  label: string
  nickname?: string // persistent, purely for staff's own reference — "Near window"
  seats: number
  status: TableStatus
  customerName?: string
  customerPhone?: string
  customerId?: string // set once the guest is matched to (or created as) a real CRM record
  guestCount?: number
  waiterName?: string
  seatedAt?: string // ISO timestamp
  note?: string // transient, tied to the current party — e.g. "came from Table 3" — clears automatically when they leave
}
