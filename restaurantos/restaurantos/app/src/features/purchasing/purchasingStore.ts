import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'
import { useAccountsStore } from '../accounts/accountsStore'
import { useInventoryStore } from '../inventory/inventoryStore'
import type { Supplier, PurchaseRecord, PurchaseLine, PurchaseCategory } from './types'

/**
 * Real data now, same pattern as the rest — `createPurchase` is the one
 * function that ties three tables together in one go: it withdraws whatever
 * was actually paid from Accounts (real ledger entry), adds any shortfall to
 * the supplier's outstanding balance, and bumps real Inventory stock if the
 * goods are marked received — the same way ordersStore.completePayment ties
 * payments + accounts + tables together.
 */
interface PurchasingState {
  suppliers: Supplier[]
  purchases: PurchaseRecord[]
  loading: boolean
  initialized: boolean
  init: () => void
  addSupplier: (name: string, phone?: string) => Promise<void>
  removeSupplier: (id: string) => Promise<{ ok: boolean; error?: string }>
  createPurchase: (input: {
    supplierId?: string
    category: PurchaseCategory
    lines: PurchaseLine[]
    received: boolean
    paidAmounts: Record<string, number>
  }) => Promise<void>
  markReceived: (purchaseId: string) => Promise<void>
  recordSupplierPayment: (supplierId: string, methodKey: string, amount: number) => Promise<void>
}

function mapSupplier(row: any): Supplier {
  return { id: row.id, name: row.name, phone: row.phone ?? undefined, outstandingBalance: Number(row.outstanding_balance) || 0 }
}

function mapPurchase(row: any, paidAmounts: Record<string, number>): PurchaseRecord {
  return {
    id: row.id,
    supplierId: row.supplier_id ?? undefined,
    category: row.category,
    status: row.status,
    lines: (row.purchase_lines ?? []).map((l: any) => ({
      id: l.id,
      kind: l.kind,
      inventoryItemId: l.inventory_item_id ?? undefined,
      description: l.description,
      quantity: Number(l.quantity),
      unitCost: Number(l.unit_cost),
    })),
    paidAmounts,
    createdAt: row.created_at,
  }
}

async function loadPurchasing(): Promise<{ suppliers: Supplier[]; purchases: PurchaseRecord[] }> {
  const [{ data: suppliers, error: supErr }, { data: purchases, error: purErr }, { data: payments, error: payErr }] = await Promise.all([
    supabase.from('suppliers').select('*').eq('branch_id', CURRENT_BRANCH_ID),
    supabase.from('purchases').select('*, purchase_lines ( * )').eq('branch_id', CURRENT_BRANCH_ID).order('created_at', { ascending: false }),
    supabase
      .from('purchase_payments')
      .select('purchase_id, amount, payment_methods ( key ), purchases!inner ( branch_id )')
      .eq('purchases.branch_id', CURRENT_BRANCH_ID),
  ])
  if (supErr) console.error('[purchasingStore] failed to load suppliers', supErr)
  if (purErr) console.error('[purchasingStore] failed to load purchases', purErr)
  if (payErr) console.error('[purchasingStore] failed to load purchase payments', payErr)

  const paidByPurchase = new Map<string, Record<string, number>>()
  for (const p of payments ?? []) {
    const key = (p as any).payment_methods?.key
    if (!key) continue
    const bucket = paidByPurchase.get(p.purchase_id) ?? {}
    bucket[key] = (bucket[key] ?? 0) + Number(p.amount)
    paidByPurchase.set(p.purchase_id, bucket)
  }

  return {
    suppliers: (suppliers ?? []).map(mapSupplier),
    purchases: (purchases ?? []).map((row) => mapPurchase(row, paidByPurchase.get(row.id) ?? {})),
  }
}

export const usePurchasingStore = create<PurchasingState>((set, get) => ({
  suppliers: [],
  purchases: [],
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadPurchasing().then((data) => set({ ...data, loading: false }))

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadPurchasing().then((data) => set(data))
    })

    supabase
      .channel(`purchasing:${CURRENT_BRANCH_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` }, () =>
        loadPurchasing().then((data) => set(data))
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` }, () =>
        loadPurchasing().then((data) => set(data))
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_lines' }, () => loadPurchasing().then((data) => set(data)))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_payments' }, () => loadPurchasing().then((data) => set(data)))
      .subscribe()
  },

  addSupplier: async (name, phone) => {
    const { error } = await supabase.from('suppliers').insert({ branch_id: CURRENT_BRANCH_ID, name, phone: phone ?? null })
    if (error) console.error('[purchasingStore] addSupplier failed', error)
    set(await loadPurchasing())
  },

  removeSupplier: async (id) => {
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) {
      // Foreign-key violation — this supplier has purchase history attached.
      const friendly = error.code === '23503'
      console.error('[purchasingStore] removeSupplier failed', error)
      return { ok: false, error: friendly ? "Can't remove — this supplier has purchase history attached." : 'Something went wrong removing this supplier.' }
    }
    set(await loadPurchasing())
    return { ok: true }
  },

  createPurchase: async (input) => {
    const { data: purchase, error } = await supabase
      .from('purchases')
      .insert({
        branch_id: CURRENT_BRANCH_ID,
        supplier_id: input.supplierId ?? null,
        category: input.category,
        status: input.received ? 'received' : 'ordered',
        received_at: input.received ? new Date().toISOString() : null,
      })
      .select()
      .single()
    if (error || !purchase) {
      console.error('[purchasingStore] createPurchase failed', error)
      return
    }

    const lineRows = input.lines.map((l) => ({
      purchase_id: purchase.id,
      kind: l.kind,
      inventory_item_id: l.kind === 'inventory' ? l.inventoryItemId ?? null : null,
      description: l.description,
      quantity: l.quantity,
      unit_cost: l.unitCost,
    }))
    const { error: lineErr } = await supabase.from('purchase_lines').insert(lineRows)
    if (lineErr) console.error('[purchasingStore] purchase_lines insert failed', lineErr)

    const total = input.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    const paidTotal = Object.values(input.paidAmounts).reduce((s, a) => s + a, 0)
    const shortfall = Math.max(0, total - paidTotal)

    const paymentRows = Object.entries(input.paidAmounts)
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => {
        const methodId = useAccountsStore.getState().methodIdForKey(key)
        return methodId ? { purchase_id: purchase.id, payment_method_id: methodId, amount } : null
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
    if (paymentRows.length > 0) {
      const { error: ppErr } = await supabase.from('purchase_payments').insert(paymentRows)
      if (ppErr) console.error('[purchasingStore] purchase_payments insert failed', ppErr)
    }

    // Real money out, same as Billing's real money in.
    for (const [key, amount] of Object.entries(input.paidAmounts)) {
      if (amount > 0) await useAccountsStore.getState().withdraw(key, amount, { purchaseId: purchase.id, reason: 'purchase payment' })
    }

    if (shortfall > 0 && input.supplierId) {
      const supplier = get().suppliers.find((s) => s.id === input.supplierId)
      if (supplier) {
        const { error: supErr } = await supabase
          .from('suppliers')
          .update({ outstanding_balance: supplier.outstandingBalance + shortfall })
          .eq('id', input.supplierId)
        if (supErr) console.error('[purchasingStore] supplier balance update failed', supErr)
      }
    }

    if (input.received) {
      for (const l of input.lines) {
        if (l.kind === 'inventory' && l.inventoryItemId) {
          await useInventoryStore.getState().receiveStock(l.inventoryItemId, l.quantity, `Purchase: ${l.description}`)
        }
      }
    }

    set(await loadPurchasing())
  },

  markReceived: async (purchaseId) => {
    const purchase = get().purchases.find((p) => p.id === purchaseId)
    if (!purchase) return
    const { error } = await supabase.from('purchases').update({ status: 'received', received_at: new Date().toISOString() }).eq('id', purchaseId)
    if (error) console.error('[purchasingStore] markReceived failed', error)

    for (const l of purchase.lines) {
      if (l.kind === 'inventory' && l.inventoryItemId) {
        await useInventoryStore.getState().receiveStock(l.inventoryItemId, l.quantity, `Purchase: ${l.description}`)
      }
    }
    set(await loadPurchasing())
  },

  recordSupplierPayment: async (supplierId, methodKey, amount) => {
    if (amount <= 0) return
    const supplier = get().suppliers.find((s) => s.id === supplierId)
    if (!supplier) return
    await useAccountsStore.getState().withdraw(methodKey, amount, { reason: 'supplier payment' })
    const { error } = await supabase
      .from('suppliers')
      .update({ outstanding_balance: Math.max(0, supplier.outstandingBalance - amount) })
      .eq('id', supplierId)
    if (error) console.error('[purchasingStore] recordSupplierPayment failed', error)
    set(await loadPurchasing())
  },
}))
