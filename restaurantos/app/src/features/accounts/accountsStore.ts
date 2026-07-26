import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'
import { useSettingsStore } from '../settings/settingsStore'

/**
 * Real data now — running balance per payment method (Cash, eSewa, Fonepay,
 * or whatever's configured in Settings), backed by `accounts` +
 * `ledger_entries`. Billing deposits into these, Purchasing withdraws from
 * them, same as before — just real money now instead of an in-memory demo.
 *
 * Balances are keyed by the payment method's `key` (e.g. "cash") rather than
 * its row id, since that's what Billing/Shifts/Purchasing already pass
 * around — `methodIdForKey` resolves the id only when a write actually needs
 * one.
 */
interface AccountsState {
  balances: Record<string, number>
  loading: boolean
  initialized: boolean
  init: () => void
  methodIdForKey: (key: string) => string | undefined
  deposit: (key: string, amount: number, opts?: { orderId?: string; reason?: string }) => Promise<void>
  withdraw: (key: string, amount: number, opts?: { purchaseId?: string; reason?: string }) => Promise<void>
}

function methodIdForKey(key: string): string | undefined {
  return useSettingsStore.getState().paymentMethods.find((m) => m.key === key)?.id
}

async function loadBalances(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('accounts')
    .select('balance, payment_methods ( key )')
    .eq('branch_id', CURRENT_BRANCH_ID)

  if (error) {
    console.error('[accountsStore] failed to load balances', error)
    return {}
  }
  const balances: Record<string, number> = {}
  for (const row of data ?? []) {
    const key = (row as any).payment_methods?.key
    if (key) balances[key] = Number((row as any).balance)
  }
  return balances
}

// Moves money for one payment method: read-modify-write the running balance,
// then log a ledger entry against it. Not atomic against a concurrent write
// to the *same* method from another device in the same instant — acceptable
// for a single-cafe till; worth a Postgres RPC (`increment_balance`) if this
// ever needs to survive true concurrent writers.
async function moveBalance(key: string, delta: number, reason: string, orderId?: string, purchaseId?: string) {
  const methodId = methodIdForKey(key)
  if (!methodId) {
    console.error('[accountsStore] no payment method found for key', key)
    return
  }
  const { data: account, error: fetchErr } = await supabase
    .from('accounts')
    .select('id, balance')
    .eq('branch_id', CURRENT_BRANCH_ID)
    .eq('payment_method_id', methodId)
    .maybeSingle()

  if (fetchErr || !account) {
    console.error('[accountsStore] account row missing for method', key, fetchErr)
    return
  }

  const { error: updErr } = await supabase
    .from('accounts')
    .update({ balance: Number(account.balance) + delta })
    .eq('id', account.id)
  if (updErr) console.error('[accountsStore] balance update failed', updErr)

  const { error: ledgerErr } = await supabase
    .from('ledger_entries')
    .insert({ account_id: account.id, amount: delta, reason, order_id: orderId ?? null, purchase_id: purchaseId ?? null })
  if (ledgerErr) console.error('[accountsStore] ledger entry failed', ledgerErr)
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  balances: {},
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadBalances().then((balances) => set({ balances, loading: false }))

    supabase
      .channel(`accounts:${CURRENT_BRANCH_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` },
        () => loadBalances().then((balances) => set({ balances }))
      )
      .subscribe()
  },

  methodIdForKey,

  deposit: async (key, amount, opts) => {
    if (amount <= 0) return
    await moveBalance(key, amount, opts?.reason ?? 'order payment', opts?.orderId)
    set({ balances: await loadBalances() })
  },

  withdraw: async (key, amount, opts) => {
    if (amount <= 0) return
    await moveBalance(key, -amount, opts?.reason ?? 'purchase payment', undefined, opts?.purchaseId)
    set({ balances: await loadBalances() })
  },
}))
