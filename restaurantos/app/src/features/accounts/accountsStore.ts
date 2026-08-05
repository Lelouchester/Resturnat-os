import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'
import { useSettingsStore } from '../settings/settingsStore'
import { useAuthStore } from '../auth/authStore'

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
export interface TransferRow {
  id: string
  fromKey: string
  fromLabel: string
  toKey: string
  toLabel: string
  amount: number
  note: string | null
  createdByName: string | null
  createdAt: string
}

interface AccountsState {
  balances: Record<string, number>
  accountIds: Record<string, string> // payment method key -> accounts.id, needed for transfers
  transfers: TransferRow[]
  transfersLoading: boolean
  loading: boolean
  initialized: boolean
  init: () => void
  methodIdForKey: (key: string) => string | undefined
  deposit: (key: string, amount: number, opts?: { orderId?: string; reason?: string }) => Promise<void>
  withdraw: (key: string, amount: number, opts?: { purchaseId?: string; reason?: string }) => Promise<void>
  transferFunds: (fromKey: string, toKey: string, amount: number, note?: string) => Promise<{ ok: boolean; error?: string }>
  loadTransfers: () => Promise<void>
}

function methodIdForKey(key: string): string | undefined {
  return useSettingsStore.getState().paymentMethods.find((m) => m.key === key)?.id
}

function currentStaffId(): string | undefined {
  return useAuthStore.getState().staff?.id
}

async function loadBalances(): Promise<{ balances: Record<string, number>; accountIds: Record<string, string> }> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, balance, payment_methods ( key )')
    .eq('branch_id', CURRENT_BRANCH_ID)

  if (error) {
    console.error('[accountsStore] failed to load balances', error)
    return { balances: {}, accountIds: {} }
  }
  const balances: Record<string, number> = {}
  const accountIds: Record<string, string> = {}
  for (const row of data ?? []) {
    const key = (row as any).payment_methods?.key
    if (key) {
      balances[key] = Number((row as any).balance)
      accountIds[key] = (row as any).id
    }
  }
  return { balances, accountIds }
}

async function loadTransfers(): Promise<TransferRow[]> {
  const { data, error } = await supabase
    .from('account_transfers')
    .select(
      `id, amount, note, created_at,
       from:accounts!account_transfers_from_account_id_fkey ( payment_methods ( key, label ) ),
       to:accounts!account_transfers_to_account_id_fkey ( payment_methods ( key, label ) ),
       staff ( name )`
    )
    .eq('branch_id', CURRENT_BRANCH_ID)
    .order('created_at', { ascending: false })

  if (error) {
    // Staff without the 'financials' permission get an empty/denied result
    // here (RLS), which is expected — not logged as an error.
    return []
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    fromKey: row.from?.payment_methods?.key ?? '—',
    fromLabel: row.from?.payment_methods?.label ?? 'Unknown',
    toKey: row.to?.payment_methods?.key ?? '—',
    toLabel: row.to?.payment_methods?.label ?? 'Unknown',
    amount: Number(row.amount),
    note: row.note,
    createdByName: row.staff?.name ?? null,
    createdAt: row.created_at,
  }))
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
    .insert({ account_id: account.id, amount: delta, reason, order_id: orderId ?? null, purchase_id: purchaseId ?? null, created_by: currentStaffId() ?? null })
  if (ledgerErr) console.error('[accountsStore] ledger entry failed', ledgerErr)
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  balances: {},
  accountIds: {},
  transfers: [],
  transfersLoading: true,
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadBalances().then(({ balances, accountIds }) => set({ balances, accountIds, loading: false }))
    loadTransfers().then((transfers) => set({ transfers, transfersLoading: false }))

    supabase
      .channel(`accounts:${CURRENT_BRANCH_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` },
        () => loadBalances().then(({ balances, accountIds }) => set({ balances, accountIds }))
      )
      .subscribe()

    supabase
      .channel(`account_transfers:${CURRENT_BRANCH_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'account_transfers', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` },
        () => loadTransfers().then((transfers) => set({ transfers }))
      )
      .subscribe()
  },

  methodIdForKey,

  deposit: async (key, amount, opts) => {
    if (amount <= 0) return
    await moveBalance(key, amount, opts?.reason ?? 'order payment', opts?.orderId)
    set({ ...(await loadBalances()) })
  },

  withdraw: async (key, amount, opts) => {
    if (amount <= 0) return
    await moveBalance(key, -amount, opts?.reason ?? 'purchase payment', undefined, opts?.purchaseId)
    set({ ...(await loadBalances()) })
  },

  transferFunds: async (fromKey, toKey, amount, note) => {
    const { accountIds } = get()
    const fromId = accountIds[fromKey]
    const toId = accountIds[toKey]
    if (!fromId || !toId) return { ok: false, error: 'Could not find one of those accounts.' }
    if (amount <= 0) return { ok: false, error: 'Enter an amount greater than zero.' }

    const { error } = await supabase.rpc('transfer_funds', {
      p_from_account_id: fromId,
      p_to_account_id: toId,
      p_amount: amount,
      p_note: note ?? null,
    })
    if (error) {
      console.error('[accountsStore] transferFunds failed', error)
      return { ok: false, error: error.message.includes('insufficient') ? 'Not enough balance in that account.' : 'Something went wrong with that transfer.' }
    }
    const [{ balances, accountIds: ids }, transfers] = await Promise.all([loadBalances(), loadTransfers()])
    set({ balances, accountIds: ids, transfers })
    return { ok: true }
  },

  loadTransfers: async () => {
    set({ transfers: await loadTransfers() })
  },
}))
