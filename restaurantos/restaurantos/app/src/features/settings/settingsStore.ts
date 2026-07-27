import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'

export interface PaymentMethodConfig {
  id: string // real Supabase row id — used for FK references once Billing/Shifts/Purchasing write against it
  key: string
  label: string
}

export interface RestaurantSettings {
  name: string
  address: string
  phone: string
  slogan: string
  notes: string
  openTime: string
  closeTime: string
  defaultTaxPct: number
  defaultServiceChargePct: number
  receiptFooter: string
  theme: 'light' | 'dark'
  dueReminderDays: number
}

interface SettingsState extends RestaurantSettings {
  profileLoading: boolean
  initProfile: () => void
  paymentMethods: PaymentMethodConfig[]
  paymentMethodsLoading: boolean
  initPaymentMethods: () => void
  update: (patch: Partial<RestaurantSettings>) => void
  addPaymentMethod: (label: string) => Promise<void>
  removePaymentMethod: (key: string) => Promise<void>
}

let paymentMethodsInitialized = false
let profileInitialized = false
let persistTimer: ReturnType<typeof setTimeout> | null = null
let pendingPatch: Partial<RestaurantSettings> = {}

async function loadProfile(): Promise<RestaurantSettings> {
  const [{ data: branch, error: branchErr }, { data: rs, error: rsErr }] = await Promise.all([
    supabase.from('branches').select('name, address, phone, slogan, notes').eq('id', CURRENT_BRANCH_ID).maybeSingle(),
    supabase
      .from('restaurant_settings')
      .select('open_time, close_time, default_tax_pct, default_service_charge_pct, receipt_footer, theme, due_reminder_days')
      .eq('branch_id', CURRENT_BRANCH_ID)
      .maybeSingle(),
  ])
  if (branchErr) console.error('[settingsStore] failed to load branch profile', branchErr)
  if (rsErr) console.error('[settingsStore] failed to load restaurant_settings', rsErr)

  return {
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    phone: branch?.phone ?? '',
    slogan: branch?.slogan ?? '',
    notes: branch?.notes ?? '',
    openTime: (rs?.open_time as string | undefined)?.slice(0, 5) ?? '10:00',
    closeTime: (rs?.close_time as string | undefined)?.slice(0, 5) ?? '22:00',
    defaultTaxPct: Number(rs?.default_tax_pct) || 0,
    defaultServiceChargePct: Number(rs?.default_service_charge_pct) || 0,
    receiptFooter: rs?.receipt_footer ?? '',
    theme: (rs?.theme as 'light' | 'dark') ?? 'light',
    dueReminderDays: rs?.due_reminder_days ?? 7,
  }
}

// Every field lives on one of two tables (branches, or restaurant_settings)
// — this splits an incoming patch and writes each half to the right place.
// Debounced so typing a name doesn't fire a network call per keystroke;
// local state (via `set`) updates instantly regardless.
function schedulePersist(patch: Partial<RestaurantSettings>) {
  pendingPatch = { ...pendingPatch, ...patch }
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(async () => {
    const toSave = pendingPatch
    pendingPatch = {}

    const branchPatch: Record<string, unknown> = {}
    if (toSave.name !== undefined) branchPatch.name = toSave.name
    if (toSave.address !== undefined) branchPatch.address = toSave.address
    if (toSave.phone !== undefined) branchPatch.phone = toSave.phone
    if (toSave.slogan !== undefined) branchPatch.slogan = toSave.slogan
    if (toSave.notes !== undefined) branchPatch.notes = toSave.notes

    const settingsPatch: Record<string, unknown> = {}
    if (toSave.openTime !== undefined) settingsPatch.open_time = toSave.openTime
    if (toSave.closeTime !== undefined) settingsPatch.close_time = toSave.closeTime
    if (toSave.defaultTaxPct !== undefined) settingsPatch.default_tax_pct = toSave.defaultTaxPct
    if (toSave.defaultServiceChargePct !== undefined) settingsPatch.default_service_charge_pct = toSave.defaultServiceChargePct
    if (toSave.receiptFooter !== undefined) settingsPatch.receipt_footer = toSave.receiptFooter
    if (toSave.theme !== undefined) settingsPatch.theme = toSave.theme
    if (toSave.dueReminderDays !== undefined) settingsPatch.due_reminder_days = toSave.dueReminderDays

    if (Object.keys(branchPatch).length > 0) {
      const { error } = await supabase.from('branches').update(branchPatch).eq('id', CURRENT_BRANCH_ID)
      if (error) console.error('[settingsStore] failed to save branch profile', error)
    }
    if (Object.keys(settingsPatch).length > 0) {
      const { error } = await supabase.from('restaurant_settings').update(settingsPatch).eq('branch_id', CURRENT_BRANCH_ID)
      if (error) console.error('[settingsStore] failed to save restaurant settings', error)
    }
  }, 600)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // Placeholder values until initProfile() loads the real row — every field
  // here is real now, split across `branches` (name/address/phone/slogan/
  // notes) and `restaurant_settings` (hours/tax/service charge/receipt
  // footer/theme/due reminder), one row per branch.
  name: '',
  address: '',
  phone: '',
  slogan: '',
  notes: '',
  openTime: '10:00',
  closeTime: '22:00',
  defaultTaxPct: 13,
  defaultServiceChargePct: 10,
  receiptFooter: '',
  theme: 'light',
  dueReminderDays: 7,
  profileLoading: true,

  initProfile: () => {
    if (profileInitialized) return
    profileInitialized = true

    loadProfile().then((profile) => set({ ...profile, profileLoading: false }))

    supabase
      .channel(`branch-profile:${CURRENT_BRANCH_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branches', filter: `id=eq.${CURRENT_BRANCH_ID}` }, () =>
        loadProfile().then((profile) => set(profile))
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'restaurant_settings', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` },
        () => loadProfile().then((profile) => set(profile))
      )
      .subscribe()
  },

  // Updates local state immediately (so typing feels instant) and persists
  // to Supabase shortly after, batched — see schedulePersist above.
  update: (patch) => {
    set(patch)
    schedulePersist(patch)
  },

  // Payment methods ARE real now — Billing, Shifts, and Purchasing all read
  // this same list, so adding one here (or removing one) genuinely changes
  // what those screens offer, backed by the `payment_methods` table.
  paymentMethods: [],
  paymentMethodsLoading: true,

  initPaymentMethods: () => {
    if (paymentMethodsInitialized) return
    paymentMethodsInitialized = true

    async function load() {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, key, label')
        .eq('branch_id', CURRENT_BRANCH_ID)
        .order('sort_order')

      if (error) {
        console.error('[settingsStore] failed to load payment methods', error)
        set({ paymentMethodsLoading: false })
        return
      }
      set({ paymentMethods: data ?? [], paymentMethodsLoading: false })
    }
    load()

    supabase
      .channel(`payment_methods:${CURRENT_BRANCH_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_methods', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` },
        (payload) => {
          set((state) => {
            if (payload.eventType === 'DELETE') {
              return { paymentMethods: state.paymentMethods.filter((m) => m.id !== (payload.old as any).id) }
            }
            const row = payload.new as any
            const updated: PaymentMethodConfig = { id: row.id, key: row.key, label: row.label }
            const exists = state.paymentMethods.some((m) => m.id === updated.id)
            return {
              paymentMethods: exists
                ? state.paymentMethods.map((m) => (m.id === updated.id ? updated : m))
                : [...state.paymentMethods, updated],
            }
          })
        }
      )
      .subscribe()
  },

  addPaymentMethod: async (label) => {
    const key = label.toLowerCase().replace(/\s+/g, '-')
    const sortOrder = get().paymentMethods.length + 1
    const { data, error } = await supabase
      .from('payment_methods')
      .insert({ branch_id: CURRENT_BRANCH_ID, key, label, sort_order: sortOrder })
      .select()
      .single()
    if (error || !data) {
      console.error('[settingsStore] addPaymentMethod failed', error)
      return
    }
    // Every payment method needs a matching `accounts` row (balance starts
    // at 0) or Billing/Purchasing have nowhere to deposit/withdraw money
    // for it — easy to forget since it's a second table.
    const { error: acctError } = await supabase
      .from('accounts')
      .insert({ branch_id: CURRENT_BRANCH_ID, payment_method_id: data.id, balance: 0 })
    if (acctError) console.error('[settingsStore] failed to create matching account row', acctError)
  },

  removePaymentMethod: async (key) => {
    const { error } = await supabase
      .from('payment_methods')
      .delete()
      .eq('branch_id', CURRENT_BRANCH_ID)
      .eq('key', key)
    if (error) console.error('[settingsStore] removePaymentMethod failed', error)
  },
}))
