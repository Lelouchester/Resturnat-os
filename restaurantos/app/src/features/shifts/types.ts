// Keyed by payment method key (from settingsStore.paymentMethods) — dynamic,
// so adding/removing a payment method in Settings just works here too.
export type MethodBalances = Record<string, number>

export interface ActiveShift {
  id: string
  openedBy: string // display name, joined from staff.name
  opening: MethodBalances
  openedAt: string // ISO
}
