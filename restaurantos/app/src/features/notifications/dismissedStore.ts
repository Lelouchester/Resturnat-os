import { create } from 'zustand'

/**
 * Notifications themselves aren't stored — they're computed live from
 * Inventory, Customers, Reservations, Kitchen, and Purchasing (see
 * useNotifications). The only bit of real state needed is which ones a
 * person has already dismissed, keyed by the notification's stable id.
 */
interface DismissedState {
  dismissedIds: Set<string>
  dismiss: (id: string) => void
}

export const useDismissedStore = create<DismissedState>((set) => ({
  dismissedIds: new Set(),
  dismiss: (id) => set((state) => ({ dismissedIds: new Set(state.dismissedIds).add(id) })),
}))
