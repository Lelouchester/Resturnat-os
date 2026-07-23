import { create } from 'zustand'

/**
 * Running balance per payment method (Cash, eSewa, Fonepay, or whatever's
 * configured in Settings). This is the piece that makes "pay for a purchase
 * with eSewa" mean something real: Billing deposits into these balances,
 * Purchasing withdraws from them, in the same account.
 *
 * Once wired to Supabase, this becomes the `accounts` + `ledger_entries`
 * tables from schema.sql — a balance is just the sum of its ledger entries.
 */
interface AccountsState {
  balances: Record<string, number>
  deposit: (method: string, amount: number) => void
  withdraw: (method: string, amount: number) => void
  ensureMethod: (method: string) => void
}

export const useAccountsStore = create<AccountsState>((set) => ({
  // Demo seed — represents money already sitting in each account before we
  // started tracking every movement live.
  balances: { cash: 24500, esewa: 12800, fonepay: 6300 },
  deposit: (method, amount) =>
    set((state) => ({ balances: { ...state.balances, [method]: (state.balances[method] ?? 0) + amount } })),
  withdraw: (method, amount) =>
    set((state) => ({ balances: { ...state.balances, [method]: (state.balances[method] ?? 0) - amount } })),
  ensureMethod: (method) =>
    set((state) => (method in state.balances ? state : { balances: { ...state.balances, [method]: 0 } })),
}))
