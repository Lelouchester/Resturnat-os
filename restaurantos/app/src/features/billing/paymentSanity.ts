// Decides whether a payment is unusual enough to ask "is this right?" before
// saving it — kept separate from BillingPage so the rule can be tested and
// tuned on its own without touching any UI code.
//
// The two real incidents this is aimed at (found in the owner's live data):
// an eSewa payment of Rs. 1,000 recorded against a Rs. 120 bill, and a
// Fonepay payment of Rs. 145 against a Rs. 60 bill — both almost certainly a
// mistyped amount, since a digital wallet payment has no reason to exceed
// the bill (there's no physical note to make change for).
//
// Cash is treated differently: a customer handing over a large note and
// getting change back is completely normal and happens many times a day, so
// cash is only flagged at an extreme multiple — never for an ordinary
// overpay-for-change.

export interface PaymentEntry {
  methodKey: string
  amount: number
}

export interface PaymentWarning {
  methodKey: string
  amount: number
  billRemaining: number
}

// remaining = what's left to pay on the bill (0 or less if already fully
// covered by earlier partial payments). Only checks payments actually being
// entered now, not money already on the order.
export function findSuspiciousPayments(payments: PaymentEntry[], billRemaining: number): PaymentWarning[] {
  const remaining = Math.max(0, billRemaining)
  const warnings: PaymentWarning[] = []

  for (const p of payments) {
    if (p.amount <= 0) continue

    if (p.methodKey === 'cash') {
      // Only an extreme outlier — ordinary change-making is never flagged.
      if (remaining > 0 && p.amount > remaining * 20 && p.amount - remaining > 500) {
        warnings.push({ methodKey: p.methodKey, amount: p.amount, billRemaining: remaining })
      }
      continue
    }

    // Non-cash: no legitimate reason to pay much more than what's owed.
    const buffer = Math.max(20, remaining * 0.1)
    if (p.amount > remaining + buffer) {
      warnings.push({ methodKey: p.methodKey, amount: p.amount, billRemaining: remaining })
    }
  }

  return warnings
}
