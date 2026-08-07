import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'
import { useAccountsStore } from '../accounts/accountsStore'
import type { Customer } from './types'

/**
 * Real data now, same shape as the other stores. `visitCount` is loaded as a
 * single aggregate query (paid orders grouped by customer_id) rather than
 * fetching every customer's full order history up front — the full visit
 * list (with items) is fetched on demand per-customer, see
 * fetchCustomerVisits below, only when someone opens that customer's detail.
 */
interface CustomersState {
  customers: Customer[]
  loading: boolean
  initialized: boolean
  init: () => void
  addCustomer: (name?: string, phone?: string) => Promise<string>
  updateNotes: (id: string, notes: string) => Promise<void>
  updateProfile: (id: string, patch: { name?: string; phone?: string }) => Promise<void>
  settleDue: (id: string, amount: number, methodKey?: string) => Promise<void>
  applyPayment: (id: string, billTotal: number, dueDelta: number) => Promise<void>
}

function mapRow(row: any, visitCounts: Map<string, number>): Customer {
  return {
    id: row.id,
    name: row.name ?? undefined,
    phone: row.phone ?? undefined,
    lifetimeSpend: Number(row.lifetime_spend) || 0,
    loyaltyPoints: row.loyalty_points ?? 0,
    outstandingDue: Number(row.outstanding_due) || 0,
    dueSince: row.due_since ?? undefined,
    notes: row.notes ?? undefined,
    visitCount: visitCounts.get(row.id) ?? 0,
  }
}

async function loadCustomers(): Promise<Customer[]> {
  const [{ data: customers, error: custErr }, { data: paidOrders, error: ordErr }] = await Promise.all([
    supabase.from('customers').select('*').eq('branch_id', currentBranchId()),
    supabase.from('orders').select('customer_id').eq('branch_id', currentBranchId()).eq('status', 'paid').not('customer_id', 'is', null),
  ])
  if (custErr) console.error('[customersStore] failed to load customers', custErr)
  if (ordErr) console.error('[customersStore] failed to load visit counts', ordErr)

  const visitCounts = new Map<string, number>()
  for (const o of paidOrders ?? []) {
    const id = (o as any).customer_id
    visitCounts.set(id, (visitCounts.get(id) ?? 0) + 1)
  }

  return (customers ?? []).map((row) => mapRow(row, visitCounts))
}

export const useCustomersStore = create<CustomersState>((set, get) => ({
  customers: [],
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadCustomers().then((customers) => set({ customers, loading: false }))

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadCustomers().then((customers) => set({ customers }))
    })

    supabase
      .channel(`customers:${currentBranchId()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `branch_id=eq.${currentBranchId()}` }, () =>
        loadCustomers().then((customers) => set({ customers }))
      )
      // A newly-paid order changes someone's visit count — cheap enough to
      // just reload the whole list rather than track this incrementally.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `branch_id=eq.${currentBranchId()}` }, () =>
        loadCustomers().then((customers) => set({ customers }))
      )
      .subscribe()
  },

  addCustomer: async (name, phone) => {
    const { data, error } = await supabase
      .from('customers')
      .insert({ branch_id: currentBranchId(), name: name ?? null, phone: phone ?? null })
      .select()
      .single()
    if (error || !data) {
      console.error('[customersStore] addCustomer failed', error)
      throw error
    }
    set({ customers: await loadCustomers() })
    return data.id
  },

  updateNotes: async (id, notes) => {
    const { error } = await supabase.from('customers').update({ notes }).eq('id', id)
    if (error) console.error('[customersStore] updateNotes failed', error)
  },

  updateProfile: async (id, patch) => {
    const { error } = await supabase
      .from('customers')
      .update({ name: patch.name ?? null, phone: patch.phone ?? null })
      .eq('id', id)
    if (error) console.error('[customersStore] updateProfile failed', error)
  },

  settleDue: async (id, amount, methodKey) => {
    const cust = get().customers.find((c) => c.id === id)
    if (!cust || amount <= 0) return
    const nextDue = Math.max(0, cust.outstandingDue - amount)
    const { error } = await supabase
      .from('customers')
      .update({ outstanding_due: nextDue, due_since: nextDue === 0 ? null : cust.dueSince ?? null })
      .eq('id', id)
    if (error) console.error('[customersStore] settleDue failed', error)
    // A due being settled is real cash coming in — deposit it the same way
    // Billing does, so it shows up in Accounts too.
    if (methodKey) await useAccountsStore.getState().deposit(methodKey, amount, { reason: 'due settled' })
    set({ customers: await loadCustomers() })
  },

  applyPayment: async (id, billTotal, dueDelta) => {
    const cust = get().customers.find((c) => c.id === id)
    if (!cust) return
    const nextDue = Math.max(0, cust.outstandingDue + dueDelta)
    const { error } = await supabase
      .from('customers')
      .update({
        lifetime_spend: cust.lifetimeSpend + billTotal,
        loyalty_points: cust.loyaltyPoints + Math.round(billTotal / 100),
        outstanding_due: nextDue,
        due_since: cust.outstandingDue === 0 && dueDelta > 0 ? new Date().toISOString() : cust.dueSince ?? null,
      })
      .eq('id', id)
    if (error) console.error('[customersStore] applyPayment failed', error)
    set({ customers: await loadCustomers() })
  },
}))

export interface Visit {
  date: string
  amount: number
  itemsSummary: string
}

// Fetched on demand when a customer's detail view opens — their real order
// history, plus their most-ordered item worked out from it.
export async function fetchCustomerVisits(customerId: string): Promise<{ visits: Visit[]; favoriteItem?: string }> {
  const { data, error } = await supabase
    .from('orders')
    .select('closed_at, total, order_items ( quantity, custom_name, is_complimentary, status, menu_items ( name ) )')
    .eq('customer_id', customerId)
    .eq('status', 'paid')
    .order('closed_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[fetchCustomerVisits] query failed', error)
    return { visits: [] }
  }

  const itemCounts = new Map<string, number>()
  const visits: Visit[] = (data ?? []).map((o: any) => {
    const activeItems = (o.order_items ?? []).filter((i: any) => i.status !== 'void')
    for (const i of activeItems) {
      const name = i.custom_name ?? i.menu_items?.name ?? 'Item'
      itemCounts.set(name, (itemCounts.get(name) ?? 0) + i.quantity)
    }
    return {
      date: o.closed_at,
      amount: Number(o.total) || 0,
      itemsSummary: activeItems.map((i: any) => `${i.quantity}x ${i.custom_name ?? i.menu_items?.name ?? 'Item'}`).join(', '),
    }
  })

  let favoriteItem: string | undefined
  let max = 0
  for (const [name, count] of itemCounts) {
    if (count > max) {
      max = count
      favoriteItem = name
    }
  }

  return { visits, favoriteItem }
}
