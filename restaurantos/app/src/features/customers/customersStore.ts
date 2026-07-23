import { create } from 'zustand'
import type { Customer } from './types'

const DEMO_CUSTOMERS: Customer[] = [
  {
    id: 'c1',
    name: 'Rai family',
    phone: '98XXXXXX01',
    lifetimeSpend: 18420,
    loyaltyPoints: 184,
    outstandingDue: 0,
    favoriteItem: 'Chicken sekuwa',
    notes: 'Usually asks for a corner table, comes with 2 kids.',
    visits: [
      { date: '2026-07-08T19:20:00', amount: 1840, itemsSummary: '1x Chicken chilli, 2x Chicken sekuwa, 4x Masala tea' },
      { date: '2026-06-29T20:05:00', amount: 2120, itemsSummary: '2x Mutton curry, 1x Veg thali' },
      { date: '2026-06-14T18:40:00', amount: 1560, itemsSummary: '3x Chicken momo, 2x Lassi' },
    ],
  },
  {
    id: 'c2',
    name: 'Gurung',
    phone: '98XXXXXX02',
    lifetimeSpend: 9260,
    loyaltyPoints: 92,
    outstandingDue: 3260,
    dueSince: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    favoriteItem: 'Mutton curry',
    notes: '',
    visits: [
      { date: '2026-07-08T20:10:00', amount: 3260, itemsSummary: '2x Mutton curry, 1x Veg thali, 3x Buff momo, 3x Coke' },
    ],
  },
  {
    id: 'c3',
    name: 'Karki party',
    phone: '98XXXXXX03',
    lifetimeSpend: 4120,
    loyaltyPoints: 41,
    outstandingDue: 0,
    favoriteItem: 'Chicken momo (steamed)',
    notes: 'Regular Friday evening group, usually 6-7 people.',
    visits: [
      { date: '2026-07-08T19:45:00', amount: 640, itemsSummary: '2x Chicken momo, 2x Lassi' },
      { date: '2026-07-01T19:30:00', amount: 720, itemsSummary: '3x Chicken momo, 1x Lassi' },
    ],
  },
]

interface CustomersState {
  customers: Customer[]
  addCustomer: (name?: string, phone?: string) => string // returns new id
  updateNotes: (id: string, notes: string) => void
  updateProfile: (id: string, patch: { name?: string; phone?: string }) => void
  settleDue: (id: string, amount: number) => void
  recordVisit: (id: string, amount: number, itemsSummary: string, dueDelta: number) => void
}

export const useCustomersStore = create<CustomersState>((set) => ({
  customers: DEMO_CUSTOMERS,
  addCustomer: (name, phone) => {
    const id = `c-${Date.now()}`
    set((state) => ({
      customers: [
        ...state.customers,
        { id, name, phone, lifetimeSpend: 0, loyaltyPoints: 0, outstandingDue: 0, visits: [] },
      ],
    }))
    return id
  },
  updateNotes: (id, notes) =>
    set((state) => ({
      customers: state.customers.map((c) => (c.id === id ? { ...c, notes } : c)),
    })),
  updateProfile: (id, patch) =>
    set((state) => ({
      customers: state.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  settleDue: (id, amount) =>
    set((state) => ({
      customers: state.customers.map((c) => {
        if (c.id !== id) return c
        const nextDue = Math.max(0, c.outstandingDue - amount)
        return { ...c, outstandingDue: nextDue, dueSince: nextDue === 0 ? undefined : c.dueSince }
      }),
    })),
  recordVisit: (id, amount, itemsSummary, dueDelta) =>
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === id
          ? {
              ...c,
              lifetimeSpend: c.lifetimeSpend + amount,
              outstandingDue: Math.max(0, c.outstandingDue + dueDelta),
              dueSince: c.outstandingDue === 0 && dueDelta > 0 ? new Date().toISOString() : c.dueSince,
              loyaltyPoints: c.loyaltyPoints + Math.round(amount / 100),
              visits: [{ date: new Date().toISOString(), amount, itemsSummary }, ...c.visits],
            }
          : c
      ),
    })),
}))
