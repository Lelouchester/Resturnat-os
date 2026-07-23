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
  phone: string // not in the database yet — see note below, stays local-only for now
  openTime: string
  closeTime: string
  defaultTaxPct: number
  defaultServiceChargePct: number
  receiptFooter: string
  tableCount: number
  theme: 'light' | 'dark'
  dueReminderDays: number
}

interface SettingsState extends RestaurantSettings {
  paymentMethods: PaymentMethodConfig[]
  paymentMethodsLoading: boolean
  initPaymentMethods: () => void
  update: (patch: Partial<RestaurantSettings>) => void
  addPaymentMethod: (label: string) => Promise<void>
  removePaymentMethod: (key: string) => Promise<void>
}

let paymentMethodsInitialized = false

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // Restaurant profile / defaults — not wired to Supabase yet (that's
  // `branches` + `restaurant_settings`, next in line after the operational
  // loop). `phone` specifically has no column yet anywhere — local-only
  // until a small follow-up migration adds it.
  name: 'Café Kitli',
  address: 'Thamel, Kathmandu',
  phone: '01-XXXXXXX',
  openTime: '10:00',
  closeTime: '22:00',
  defaultTaxPct: 13,
  defaultServiceChargePct: 10,
  receiptFooter: 'Thank you — please visit again',
  tableCount: 8,
  theme: 'light',
  dueReminderDays: 7,
  update: (patch) => set(patch),

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
    const { error } = await supabase
      .from('payment_methods')
      .insert({ branch_id: CURRENT_BRANCH_ID, key, label, sort_order: sortOrder })
    if (error) console.error('[settingsStore] addPaymentMethod failed', error)
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
