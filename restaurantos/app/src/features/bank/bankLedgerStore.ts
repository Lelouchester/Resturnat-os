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
  source: string | null // null = manual entry; 'fonepay_revenue' / 'fonepay_purchases' = posted automatically overnight
  editedAt: string | null
  deletedAt: string | null
  deletedByName: string | null
}

export interface BankLedgerHistoryEntry {
  changeType: 'edit' | 'delete'
  previousEntryDate: string
  previousAmount: number
  previousRemark: string
  changedByName: string
  changedAt: string
}

interface BankLedgerState {
  entries: BankLedgerEntry[]
  loading: boolean
  initialized: boolean
  init: () => void
  addEntry: (entryDate: string, amount: number, remark: string) => Promise<{ ok: boolean; error?: string }>
  editEntry: (entryId: string, entryDate: string, amount: number, remark: string) => Promise<{ ok: boolean; error?: string }>
  deleteEntry: (entryId: string) => Promise<{ ok: boolean; error?: string }>
  fetchHistory: (entryId: string) => Promise<BankLedgerHistoryEntry[]>
}

async function loadEntries(): Promise<BankLedgerEntry[]> {
  const { data, error } = await supabase
    .from('bank_ledger_entries')
    .select('id, entry_date, amount, remark, created_at, source, edited_at, deleted_at, staff:created_by ( name ), deleted_staff:deleted_by ( name )')
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
    createdByName: row.staff?.name ?? (row.source ? 'Fonepay (auto)' : 'Unknown'),
    createdAt: row.created_at,
    source: row.source ?? null,
    editedAt: row.edited_at ?? null,
    deletedAt: row.deleted_at ?? null,
    deletedByName: row.deleted_staff?.name ?? null,
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

  // Direct insert for new entries; editing and deleting an existing one go
  // through database functions instead (below), never a direct update/
  // delete — that's what guarantees the history log always gets written,
  // no matter what.
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

  editEntry: async (entryId, entryDate, amount, remark) => {
    const { error } = await supabase.rpc('edit_bank_ledger_entry', {
      p_entry_id: entryId,
      p_new_entry_date: entryDate,
      p_new_amount: amount,
      p_new_remark: remark,
    })
    if (error) {
      console.error('[bankLedgerStore] editEntry failed', error)
      return { ok: false, error: error.message }
    }
    set({ entries: await loadEntries() })
    return { ok: true }
  },

  deleteEntry: async (entryId) => {
    const { error } = await supabase.rpc('delete_bank_ledger_entry', { p_entry_id: entryId })
    if (error) {
      console.error('[bankLedgerStore] deleteEntry failed', error)
      return { ok: false, error: error.message }
    }
    set({ entries: await loadEntries() })
    return { ok: true }
  },

  fetchHistory: async (entryId) => {
    const { data, error } = await supabase
      .from('bank_ledger_entry_history')
      .select('change_type, previous_entry_date, previous_amount, previous_remark, changed_at, staff:changed_by ( name )')
      .eq('entry_id', entryId)
      .order('changed_at', { ascending: true })
    if (error) {
      console.error('[bankLedgerStore] fetchHistory failed', error)
      return []
    }
    return (data ?? []).map((row: any) => ({
      changeType: row.change_type,
      previousEntryDate: row.previous_entry_date,
      previousAmount: Number(row.previous_amount),
      previousRemark: row.previous_remark,
      changedByName: row.staff?.name ?? 'Unknown',
      changedAt: row.changed_at,
    }))
  },
}))
