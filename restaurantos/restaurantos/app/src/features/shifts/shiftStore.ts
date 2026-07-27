import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID, CURRENT_STAFF_ID } from '../../shared/lib/config'
import { useSettingsStore } from '../settings/settingsStore'
import type { ActiveShift, MethodBalances } from './types'

/**
 * Real data now, same pattern as tablesStore. `shifts` holds the open/closed
 * record; `shift_balances` holds one row per payment method per shift
 * (opening_amount, and closing_amount once the day ends). Resolving a
 * payment method's `key` (e.g. "cash") to the UUID `shift_balances` actually
 * stores reads from settingsStore, which already has the real list loaded.
 *
 * `lastClosing` carries yesterday's closing counts into today's opening
 * defaults — today's closing IS tomorrow's opening, so the next shift starts
 * pre-filled instead of asking the same numbers twice.
 */
interface ShiftState {
  shift: ActiveShift | null
  lastClosing: MethodBalances | null
  loading: boolean
  initialized: boolean
  init: () => void
  startShift: (opening: MethodBalances) => Promise<void>
  endShift: (closing: MethodBalances) => Promise<void>
}

function methodIdForKey(key: string): string | undefined {
  return useSettingsStore.getState().paymentMethods.find((m) => m.key === key)?.id
}

async function loadCurrentShift(): Promise<{ shift: ActiveShift | null; lastClosing: MethodBalances | null }> {
  const { data: openShift, error: openError } = await supabase
    .from('shifts')
    .select('id, opened_at, staff:opened_by(name), shift_balances(payment_method_id, opening_amount, payment_methods(key))')
    .eq('branch_id', CURRENT_BRANCH_ID)
    .eq('status', 'open')
    .maybeSingle()

  if (openError) console.error('[shiftStore] failed to load open shift', openError)

  let shift: ActiveShift | null = null
  if (openShift) {
    const opening: MethodBalances = {}
    for (const b of (openShift as any).shift_balances ?? []) {
      const key = b.payment_methods?.key
      if (key) opening[key] = Number(b.opening_amount)
    }
    shift = {
      id: openShift.id,
      openedBy: (openShift as any).staff?.name ?? 'Unknown',
      opening,
      openedAt: openShift.opened_at,
    }
  }

  // Most recent closed shift's closing balances, to pre-fill next opening.
  const { data: lastClosed } = await supabase
    .from('shifts')
    .select('id, shift_balances(closing_amount, payment_methods(key))')
    .eq('branch_id', CURRENT_BRANCH_ID)
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let lastClosing: MethodBalances | null = null
  if (lastClosed) {
    const closing: MethodBalances = {}
    for (const b of (lastClosed as any).shift_balances ?? []) {
      const key = b.payment_methods?.key
      if (key && b.closing_amount !== null) closing[key] = Number(b.closing_amount)
    }
    if (Object.keys(closing).length > 0) lastClosing = closing
  }

  return { shift, lastClosing }
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  shift: null,
  lastClosing: null,
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadCurrentShift().then(({ shift, lastClosing }) => set({ shift, lastClosing, loading: false }))

    supabase
      .channel(`shifts:${CURRENT_BRANCH_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` }, () => {
        // Shift open/close changes more than one field across two tables at
        // once — simplest correct thing is to just reload the current state
        // rather than try to patch it in place from a partial payload.
        loadCurrentShift().then(({ shift, lastClosing }) => set({ shift, lastClosing }))
      })
      .subscribe()
  },

  startShift: async (opening) => {
    const { data: newShift, error: shiftError } = await supabase
      .from('shifts')
      .insert({ branch_id: CURRENT_BRANCH_ID, opened_by: CURRENT_STAFF_ID, status: 'open' })
      .select()
      .single()

    if (shiftError || !newShift) {
      console.error('[shiftStore] startShift failed', shiftError)
      return
    }

    const rows = Object.entries(opening)
      .map(([key, amount]) => {
        const paymentMethodId = methodIdForKey(key)
        return paymentMethodId ? { shift_id: newShift.id, payment_method_id: paymentMethodId, opening_amount: amount } : null
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (rows.length > 0) {
      const { error: balancesError } = await supabase.from('shift_balances').insert(rows)
      if (balancesError) console.error('[shiftStore] failed to save opening balances', balancesError)
    }

    const { shift, lastClosing } = await loadCurrentShift()
    set({ shift, lastClosing })
  },

  endShift: async (closing) => {
    const currentShift = get().shift
    if (!currentShift) return

    for (const [key, amount] of Object.entries(closing)) {
      const paymentMethodId = methodIdForKey(key)
      if (!paymentMethodId) continue
      const { error } = await supabase
        .from('shift_balances')
        .update({ closing_amount: amount })
        .eq('shift_id', currentShift.id)
        .eq('payment_method_id', paymentMethodId)
      if (error) console.error('[shiftStore] failed to save closing balance', key, error)
    }

    const { error: closeError } = await supabase
      .from('shifts')
      .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: CURRENT_STAFF_ID })
      .eq('id', currentShift.id)
    if (closeError) console.error('[shiftStore] endShift failed', closeError)

    set({ shift: null, lastClosing: closing })
  },
}))
