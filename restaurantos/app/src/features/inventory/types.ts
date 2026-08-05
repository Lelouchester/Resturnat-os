export interface InventoryItem {
  id: string
  name: string
  unit: string // 'kg', 'pcs', 'ltr', 'ml', etc.
  currentStock: number
  minStock: number
  barcode?: string
  isArchived?: boolean
}

export type MovementType = 'purchase' | 'sale_deduction' | 'adjustment' | 'waste' | 'physical_count'

export interface StockMovement {
  id: string
  itemId: string
  type: MovementType
  quantity: number // signed — negative for deductions/waste
  note?: string
  createdAt: string
}
