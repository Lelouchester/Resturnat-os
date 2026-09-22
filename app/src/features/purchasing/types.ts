export type PurchaseCategory = 'ingredients' | 'beverages' | 'cleaning' | 'equipment' | 'utilities' | 'other'

export const CATEGORY_LABELS: Record<PurchaseCategory, string> = {
  ingredients: 'Ingredients',
  beverages: 'Beverages',
  cleaning: 'Cleaning & supplies',
  equipment: 'Equipment & utensils',
  utilities: 'Utilities',
  other: 'Other',
}

export interface PurchaseLine {
  id: string
  kind: 'inventory' | 'expense' // inventory = tracked stock item; expense = one-off (broom, repair, etc.)
  inventoryItemId?: string
  description: string
  quantity: number
  unitCost: number
}

export interface Supplier {
  id: string
  name: string
  phone?: string
  outstandingBalance: number
}

export type PurchaseStatus = 'ordered' | 'received' | 'cancelled'

export interface PurchaseRecord {
  id: string
  supplierId?: string // undefined = one-off purchase, no ongoing supplier relationship
  category: PurchaseCategory
  lines: PurchaseLine[]
  status: PurchaseStatus
  paidAmounts: Record<string, number> // payment method key -> amount paid at time of purchase
  createdAt: string
}
