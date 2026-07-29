import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'
import type { Reservation } from './types'

/**
 * Real data now, same pattern as the rest. `assignTable` also seats the
 * reservation the same way tablesStore.seatReservation does — it sets the
 * table to occupied with the guest's name/party size, since that's the
 * moment a reservation actually becomes a live table.
 */
interface ReservationsState {
  reservations: Reservation[]
  loading: boolean
  initialized: boolean
  init: () => void
  addReservation: (r: Omit<Reservation, 'id' | 'status'>) => Promise<void>
  assignTable: (reservationId: string, tableId: string) => Promise<void>
  markNoShow: (reservationId: string) => Promise<void>
  cancel: (reservationId: string) => Promise<void>
}

function mapRow(row: any): Reservation {
  return {
    id: row.id,
    guestName: row.guest_name,
    phone: row.phone ?? '',
    partySize: row.party_size ?? 1,
    arrivalTime: row.arrival_time,
    specialRequests: row.special_requests ?? undefined,
    status: row.status,
    tableId: row.table_id ?? undefined,
  }
}

async function loadReservations(): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('branch_id', CURRENT_BRANCH_ID)
    .order('arrival_time')
  if (error) {
    console.error('[reservationsStore] failed to load reservations', error)
    return []
  }
  return (data ?? []).map(mapRow)
}

export const useReservationsStore = create<ReservationsState>((set, get) => ({
  reservations: [],
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadReservations().then((reservations) => set({ reservations, loading: false }))

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadReservations().then((reservations) => set({ reservations }))
    })

    supabase
      .channel(`reservations:${CURRENT_BRANCH_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` }, () =>
        loadReservations().then((reservations) => set({ reservations }))
      )
      .subscribe()
  },

  addReservation: async (r) => {
    const { error } = await supabase.from('reservations').insert({
      branch_id: CURRENT_BRANCH_ID,
      guest_name: r.guestName,
      phone: r.phone || null,
      party_size: r.partySize,
      arrival_time: r.arrivalTime,
      special_requests: r.specialRequests || null,
    })
    if (error) console.error('[reservationsStore] addReservation failed', error)
    set({ reservations: await loadReservations() })
  },

  assignTable: async (reservationId, tableId) => {
    const reservation = get().reservations.find((r) => r.id === reservationId)
    if (!reservation) return

    const { error } = await supabase
      .from('reservations')
      .update({ table_id: tableId, status: 'seated' })
      .eq('id', reservationId)
    if (error) console.error('[reservationsStore] assignTable (reservation update) failed', error)

    // Seats the table for real — same effect as tablesStore.seatReservation.
    const { error: tableErr } = await supabase
      .from('restaurant_tables')
      .update({
        status: 'occupied',
        customer_name: reservation.guestName,
        guest_count: reservation.partySize,
        seated_at: new Date().toISOString(),
      })
      .eq('id', tableId)
    if (tableErr) console.error('[reservationsStore] assignTable (table seat) failed', tableErr)

    set({ reservations: await loadReservations() })
  },

  markNoShow: async (reservationId) => {
    const { error } = await supabase.from('reservations').update({ status: 'no_show' }).eq('id', reservationId)
    if (error) console.error('[reservationsStore] markNoShow failed', error)
    set({ reservations: await loadReservations() })
  },

  cancel: async (reservationId) => {
    const { error } = await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', reservationId)
    if (error) console.error('[reservationsStore] cancel failed', error)
    set({ reservations: await loadReservations() })
  },
}))
