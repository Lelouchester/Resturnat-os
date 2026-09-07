export type LoyaltyTier = 'New' | 'Regular' | 'Loyal' | 'VIP'

export interface Customer {
  id: string
  name?: string // optional — a visit can be logged before anyone gets a name
  phone?: string // optional — same reasoning; can be filled in later by a manager
  lifetimeSpend: number
  loyaltyPoints: number
  outstandingDue: number
  dueSince?: string // ISO — when they first went into debt (for the Settings reminder threshold), cleared once settled
  notes?: string
  visitCount: number // from a paid-orders count, not a separate stored field
}

// Loyalty isn't a stored field — it's derived from visit count, so it's
// always consistent with actual behavior rather than a number someone forgot
// to update.
export function loyaltyTier(visitCount: number): LoyaltyTier {
  if (visitCount >= 10) return 'VIP'
  if (visitCount >= 5) return 'Loyal'
  if (visitCount >= 2) return 'Regular'
  return 'New'
}
