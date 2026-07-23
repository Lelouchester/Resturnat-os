import { create } from 'zustand'
import type { KitchenTicket, TicketItem, TicketStatus } from './types'

/**
 * Temporary in-memory store standing in for the real thing.
 *
 * Once `orders` / `order_items` are wired to Supabase, this becomes a
 * `useKitchenTickets(branchId)` hook that subscribes to Postgres changes —
 * the exact same pattern as `features/tables/useTables.ts`. Firing an order
 * from the Orders screen will INSERT into `order_items` with status
 * 'pending', and this board will update in realtime on every device, kitchen
 * included, without anyone refreshing anything.
 *
 * Kept as a Zustand store for now purely so the Orders screen and the
 * Kitchen screen can talk to each other inside this demo without a backend.
 */
interface KitchenState {
  tickets: KitchenTicket[]
  fireTicket: (tableLabel: string, items: TicketItem[]) => void
  advanceTicket: (id: string) => void
}

const NEXT_STATUS: Record<TicketStatus, TicketStatus | null> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: null, // "ready" -> served removes it from the board entirely
}

export const useKitchenStore = create<KitchenState>((set) => ({
  tickets: [],
  fireTicket: (tableLabel, items) =>
    set((state) => ({
      tickets: [
        ...state.tickets,
        {
          id: `t-${Date.now()}`,
          tableLabel,
          items,
          status: 'pending',
          firedAt: new Date().toISOString(),
        },
      ],
    })),
  advanceTicket: (id) =>
    set((state) => {
      const ticket = state.tickets.find((t) => t.id === id)
      if (!ticket) return state
      const next = NEXT_STATUS[ticket.status]
      if (next === null) {
        // "Serve" — remove from the board.
        return { tickets: state.tickets.filter((t) => t.id !== id) }
      }
      return {
        tickets: state.tickets.map((t) => (t.id === id ? { ...t, status: next } : t)),
      }
    }),
}))
