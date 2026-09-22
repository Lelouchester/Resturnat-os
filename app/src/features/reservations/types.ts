export type ReservationStatus = 'upcoming' | 'seated' | 'no_show' | 'cancelled'

export interface Reservation {
  id: string
  guestName: string
  phone: string
  partySize: number
  arrivalTime: string // ISO
  specialRequests?: string
  status: ReservationStatus
  tableId?: string
}
