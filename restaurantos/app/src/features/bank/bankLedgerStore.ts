import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'
import { useAuthStore } from '../auth/authStore'

export interface BankLedgerEntry {
  id: string
  entryDate: string
  amount: number // positive = credit/deposit, negative = debit/withdrawal
  remark: string
  createdByName: string
  createdAt: string
}

interface BankLedgerState {
  entries: BankLedgerEntry[]
  loading: boolean
  initialized: boolean
  init: () => void
  addEntry: (entryDate: string, amount: number, remark: string) => Promise<{ ok: boolean; error?: string }>
}

async function loadEntries(): Promise<BankLedgerEntry[]> {
  const { data, error } = await supabase
    .from('bank_ledger_entries')
    .select('id, entry_date, amount, remark, created_at, staff ( name )')
    .eq('branch_id', currentBranchId())
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    // Most likely cause: this staff member doesn't have the 'financials'
    // permission, so RLS is correctly returning nothing rather than an
    // error — but log it anyway in case it's something else (e.g. the
    // migration hasn't been run yet).
    console.error('[bankLedgerStore] failed to load entries', error)
    return []
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    entryDate: row.entry_date,
    amount: Number(row.amount),
    remark: row.remark,
    createdByName: row.staff?.name ?? 'Unknown',
    createdAt: row.created_at,
  }))
}

export const useBankLedgerStore = create<BankLedgerState>((set, get) => ({
  entries: [],
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadEntries().then((entries) => set({ entries, loading: false }))

    supabase
      .channel(`bank_ledger_entries:${currentBranchId()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bank_ledger_entries', filter: `branch_id=eq.${currentBranchId()}` },
        () => loadEntries().then((entries) => set({ entries }))
      )
      .subscribe()
  },

  // Deliberately insert-only — there's no updateEntry or deleteEntry here on
  // purpose, matching the database (no update/delete policy exists at all).
  // A mistake gets corrected with a new entry and a remark explaining it,
  // never by editing history.
  addEntry: async (entryDate, amount, remark) => {
    const { error } = await supabase.from('bank_ledger_entries').insert({
      branch_id: currentBranchId(),
      entry_date: entryDate,
      amount,
      remark,
      created_by: useAuthStore.getState().staff?.id ?? null,
    })
    if (error) {
      console.error('[bankLedgerStore] addEntry failed', error)
      return { ok: false, error: error.message }
    }
    set({ entries: await loadEntries() })
    return { ok: true }
  },
}))
