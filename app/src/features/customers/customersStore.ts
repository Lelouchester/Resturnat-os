import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId, useAuthStore } from '../auth/authStore'
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
  addCustomer: (name?: string, phone?: string, openingDue?: number) => Promise<string>
  updateNotes: (id: string, notes: string) => Promise<void>
  updateProfile: (id: string, patch: { name?: string; phone?: string }) => Promise<void>
  settleDue: (id: string, amount: number, methodKey?: string) => Promise<void>
  adjustDue: (id: string, amount: number, remark: string) => Promise<{ ok: boolean; error?: string }>
  applyPayment: (id: string, billTotal: number, dueDelta: number) => Promise<void>
  removeCustomer: (id: string) => Promise<{ ok: boolean; error?: string }>
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

  addCustomer: async (name, phone, openingDue) => {
    // A one-time starting balance for customers who already owed money
    // before this software existed — behaves exactly like a real due from
    // here on (same settleDue flow, same "X days" aging), it's just backdated
    // to today rather than created by an actual order.
    const due = openingDue && openingDue > 0 ? openingDue : 0
    const { data, error } = await supabase
      .from('customers')
      .insert({
        branch_id: currentBranchId(),
        name: name ?? null,
        phone: phone ?? null,
        outstanding_due: due,
        due_since: due > 0 ? new Date().toISOString() : null,
      })
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
    // Log it with a date, separately from the account deposit — this is
    // what lets the customer's due statement show "paid Rs. 100 back on
    // Aug 22nd" later, which nothing was recording before.
    const { error: logErr } = await supabase.from('due_settlements').insert({
      branch_id: currentBranchId(),
      customer_id: id,
      amount,
      payment_method_key: methodKey ?? null,
      created_by: useAuthStore.getState().staff?.id ?? null,
    })
    if (logErr) console.error('[customersStore] settleDue: logging settlement failed', logErr)
    set({ customers: await loadCustomers() })
  },

  // Reduces a due with no matching payment and no account effect at all —
  // for clearing out dummy dues a software bug created, not real
  // transactions. Enforced at the database level, not just hidden in the
  // UI — a non-management account gets a hard error from the function
  // itself if this somehow gets called.
  adjustDue: async (id, amount, remark) => {
    const { error } = await supabase.rpc('adjust_customer_due', {
      p_customer_id: id,
      p_amount: amount,
      p_remark: remark,
    })
    if (error) {
      console.error('[customersStore] adjustDue failed', error)
      return { ok: false, error: error.message }
    }
    set({ customers: await loadCustomers() })
    return { ok: true }
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

  // Only removes customers with no real history behind them — a name a
  // manager typed in by mistake, not a real customer with orders or an
  // unsettled due. If either exists, the database itself blocks the delete
  // (orders reference customer_id), so this is here mainly to turn that
  // block into a clear message instead of a raw database error, and to add
  // the due check up front so money owed can't quietly vanish.
  removeCustomer: async (id) => {
    const cust = get().customers.find((c) => c.id === id)
    if (cust && cust.outstandingDue > 0) {
      return { ok: false, error: `This customer still has Rs. ${cust.outstandingDue} due — settle that first, or the amount owed gets lost.` }
    }
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) {
      if (error.code === '23503') {
        return { ok: false, error: 'This customer has real order history, so they can\'t be deleted — rename them instead if the name was a mistake.' }
      }
      console.error('[customersStore] removeCustomer failed', error)
      return { ok: false, error: 'Could not remove this customer.' }
    }
    set({ customers: await loadCustomers() })
    return { ok: true }
  },
}))

export interface Visit {
  id: string
  date: string
  amount: number
  itemsSummary: string
  activityNote?: string
  duePortion: number // how much of this order was left unpaid at the time — the "which order, which date" trail for explaining a due later
}

// Fetched on demand when a customer's detail view opens — their real order
// history, plus their most-ordered item worked out from it.
export async function fetchCustomerVisits(customerId: string): Promise<{ visits: Visit[]; favoriteItem?: string }> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, closed_at, total, due_amount, activity_note, order_items ( quantity, custom_name, is_complimentary, status, menu_items ( name ) )')
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
      id: o.id,
      date: o.closed_at,
      amount: Number(o.total) || 0,
      itemsSummary: activeItems.map((i: any) => `${i.quantity}x ${i.custom_name ?? i.menu_items?.name ?? 'Item'}`).join(', '),
      activityNote: o.activity_note ?? undefined,
      // Read directly from what Billing stamped at the moment of payment —
      // not reconstructed from the payments table, which can be silently
      // incomplete if one of its rows failed to write (see migration 011).
      duePortion: Number(o.due_amount) || 0,
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

export interface DueStatementEntry {
  date: string
  type: 'incurred' | 'settled' | 'adjusted'
  amount: number // always positive — direction comes from `type`
  description: string
}

// Combines both sides into one dated trail: every visit that left something
// due (from fetchCustomerVisits above), and every time some of it got paid
// back (due_settlements, added alongside settleDue). This is purely for
// explaining "why do they owe this" — the actual current total lives on
// customers.outstanding_due, not something recomputed from this list.
export async function fetchDueStatement(customerId: string): Promise<DueStatementEntry[]> {
  const [{ visits }, settlementsRes] = await Promise.all([
    fetchCustomerVisits(customerId),
    supabase.from('due_settlements').select('amount, payment_method_key, kind, remark, created_at').eq('customer_id', customerId).order('created_at', { ascending: true }),
  ])

  if (settlementsRes.error) console.error('[fetchDueStatement] settlements query failed', settlementsRes.error)

  const incurred: DueStatementEntry[] = visits
    .filter((v) => v.duePortion > 0)
    .map((v) => ({ date: v.date, type: 'incurred' as const, amount: v.duePortion, description: v.itemsSummary }))

  const settled: DueStatementEntry[] = (settlementsRes.data ?? []).map((s: any) => ({
    date: s.created_at,
    type: s.kind === 'adjustment' ? ('adjusted' as const) : ('settled' as const),
    amount: Number(s.amount),
    description: s.kind === 'adjustment' ? `Adjusted — ${s.remark}` : s.payment_method_key ? `Paid via ${s.payment_method_key}` : 'Paid',
  }))

  return [...incurred, ...settled].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
