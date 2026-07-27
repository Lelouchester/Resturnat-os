import { create } from 'zustand'

/**
 * A customer's past visit only has a plain-text items summary (e.g. "2x
 * Chicken sekuwa, 1x Masala tea"), not structured references — this store is
 * the handoff: Customers parses that text into name+quantity pairs and drops
 * them here, then Orders picks them up on load, matches them against the
 * live menu, and adds whatever still exists to the cart.
 */
interface RepeatOrderState {
  pending: { name: string; quantity: number }[] | null
  setPending: (items: { name: string; quantity: number }[]) => void
  clear: () => void
}

export const useRepeatOrderStore = create<RepeatOrderState>((set) => ({
  pending: null,
  setPending: (items) => set({ pending: items }),
  clear: () => set({ pending: null }),
}))
