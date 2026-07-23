import { create } from 'zustand'
import type { Reservation } from './types'

const DEMO_RESERVATIONS: Reservation[] = [
  {
    id: 'r1',
    guestName: 'Sharma',
    phone: '98XXXXXX09',
    partySize: 5,
    arrivalTime: new Date(new Date().setHours(20, 0, 0, 0)).toISOString(),
    specialRequests: 'Window seat if possible',
    status: 'upcoming',
  },
  {
    id: 'r2',
    guestName: 'Thapa family',
    phone: '98XXXXXX10',
    partySize: 3,
    arrivalTime: new Date(new Date().setHours(19, 30, 0, 0)).toISOString(),
    status: 'upcoming',
  },
]

interface ReservationsState {
  reservations: Reservation[]
  addReservation: (r: Omit<Reservation, 'id' | 'status'>) => void
  assignTable: (reservationId: string, tableId: string) => void
  markNoShow: (reservationId: string) => void
  cancel: (reservationId: string) => void
}

export const useReservationsStore = create<ReservationsState>((set) => ({
  reservations: DEMO_RESERVATIONS,
  addReservation: (r) =>
    set((state) => ({
      reservations: [...state.reservations, { ...r, id: `res-${Date.now()}`, status: 'upcoming' }],
    })),
  assignTable: (reservationId, tableId) =>
    set((state) => ({
      reservations: state.reservations.map((r) => (r.id === reservationId ? { ...r, tableId } : r)),
    })),
  markNoShow: (reservationId) =>
    set((state) => ({
      reservations: state.reservations.map((r) => (r.id === reservationId ? { ...r, status: 'no_show' } : r)),
    })),
  cancel: (reservationId) =>
    set((state) => ({
      reservations: state.reservations.map((r) => (r.id === reservationId ? { ...r, status: 'cancelled' } : r)),
    })),
}))
