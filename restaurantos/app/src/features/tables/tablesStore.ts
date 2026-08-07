import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'
import type { RestaurantTable } from './types'

/**
 * Real data now — this is the first screen wired to Supabase instead of
 * in-memory demo state. `init()` loads the branch's tables once and opens a
 * Realtime channel; every write below (seatReservation, markArrived,
 * addTable) updates Postgres and lets that same channel reflect the change
 * back into `tables`, the same way it would on a second phone sitting at
 * another table. Moving/merging a table's order lives in ordersStore now,
 * since that has to touch orders as well as the table row.
 */
interface TablesState {
  tables: RestaurantTable[]
  loading: boolean
  initialized: boolean
  init: () => void
  seatReservation: (tableId: string, customerName: string, guestCount: number) => Promise<void>
  markArrived: (tableId: string) => Promise<void>
  updateGuestInfo: (tableId: string, info: { customerName: string; customerPhone?: string; customerId?: string; guestCount?: number }) => Promise<void>
  markCleaned: (tableId: string) => Promise<void>
  addTable: (label: string, seats: number, type?: 'table' | 'cabin') => Promise<{ ok: boolean; error?: string }>
  archiveTable: (tableId: string) => Promise<{ ok: boolean; error?: string }>
}

function mapRow(row: any): RestaurantTable {
  return {
    id: row.id,
    label: row.label,
    seats: row.seats,
    type: row.type ?? 'table',
    status: row.status,
    customerName: row.customer_name ?? undefined,
    customerPhone: row.customer_phone ?? undefined,
    customerId: row.customer_id ?? undefined,
    guestCount: row.guest_count ?? undefined,
    seatedAt: row.seated_at ?? undefined,
  }
}

// "Table 2" before "Table 10" — plain alphabetical sorting puts Table 10
// right after Table 1 since it compares character by character.
function byLabel(a: RestaurantTable, b: RestaurantTable) {
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
}

export const useTablesStore = create<TablesState>((set, get) => ({
  tables: [],
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return // zustand stores are singletons — only wire the subscription once
    set({ initialized: true })

    async function load() {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('branch_id', CURRENT_BRANCH_ID)
        .eq('is_archived', false)

      if (error) {
        console.error('[tablesStore] failed to load tables', error)
        set({ loading: false })
        return
      }
      set({ tables: (data ?? []).map(mapRow).sort(byLabel), loading: false })
    }
    load()

    // Realtime can silently drop (phone screen locks, browser tab goes to
    // the background, wifi blips) without an obvious error — when that
    // happens the store would otherwise sit on stale data until a full page
    // reload. Re-pulling on every "welcome back" closes that gap cheaply.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') load()
    })

    supabase
      .channel(`tables:${CURRENT_BRANCH_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'restaurant_tables', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` },
        (payload) => {
          set((state) => {
            if (payload.eventType === 'DELETE' || (payload.new as any)?.is_archived) {
              const removedId = payload.eventType === 'DELETE' ? (payload.old as any).id : (payload.new as any).id
              return { tables: state.tables.filter((t) => t.id !== removedId) }
            }
            const updated = mapRow(payload.new as any)
            const exists = state.tables.some((t) => t.id === updated.id)
            return {
              tables: exists
                ? state.tables.map((t) => (t.id === updated.id ? updated : t))
                : [...state.tables, updated].sort(byLabel),
            }
          })
        }
      )
      .subscribe()
  },

  seatReservation: async (tableId, customerName, guestCount) => {
    const { error } = await supabase
      .from('restaurant_tables')
      .update({ status: 'reserved', customer_name: customerName, guest_count: guestCount })
      .eq('id', tableId)
    if (error) console.error('[tablesStore] seatReservation failed', error)
    // No manual setState here — the Realtime subscription above applies this
    // same change to `tables` the moment Postgres confirms it.
  },

  markArrived: async (tableId) => {
    const { error } = await supabase
      .from('restaurant_tables')
      .update({ status: 'occupied', seated_at: new Date().toISOString() })
      .eq('id', tableId)
    if (error) console.error('[tablesStore] markArrived failed', error)
  },

  updateGuestInfo: async (tableId, info) => {
    const payload: Record<string, unknown> = {
      customer_name: info.customerName || null,
      customer_phone: info.customerPhone ?? null,
      customer_id: info.customerId ?? null,
    }
    if (info.guestCount !== undefined) payload.guest_count = info.guestCount
    const { error } = await supabase.from('restaurant_tables').update(payload).eq('id', tableId)
    if (error) console.error('[tablesStore] updateGuestInfo failed', error)
  },

  markCleaned: async (tableId) => {
    const { error } = await supabase
      .from('restaurant_tables')
      .update({ status: 'available' })
      .eq('id', tableId)
      .eq('status', 'needs_cleaning')
    if (error) console.error('[tablesStore] markCleaned failed', error)
  },

  addTable: async (label, seats, type = 'table') => {
    // Two tables with the same number at once is exactly the mix-up this
    // guards against — order data, kitchen tickets, and billing all key off
    // the label being unique among currently-active tables.
    const duplicate = get().tables.find((t) => t.label.trim().toLowerCase() === label.trim().toLowerCase())
    if (duplicate) {
      return { ok: false, error: `"${label}" already exists on the floor — pick a different number or remove the old one first.` }
    }
    const { error } = await supabase
      .from('restaurant_tables')
      .insert({ branch_id: CURRENT_BRANCH_ID, label, seats, type, status: 'available' })
    if (error) {
      console.error('[tablesStore] addTable failed', error)
      return { ok: false, error: 'Something went wrong adding this table.' }
    }
    return { ok: true }
  },

  archiveTable: async (tableId) => {
    const table = get().tables.find((t) => t.id === tableId)
    if (!table) return { ok: false, error: 'Table not found.' }
    if (table.status === 'occupied' || table.status === 'billing') {
      return { ok: false, error: 'This table has an order in progress — clear or bill it out first.' }
    }
    const { error } = await supabase.from('restaurant_tables').update({ is_archived: true }).eq('id', tableId)
    if (error) {
      console.error('[tablesStore] archiveTable failed', error)
      return { ok: false, error: 'Something went wrong removing this table.' }
    }
    return { ok: true }
  },
}))
