import { create } from 'zustand'
import type { InventoryItem, StockMovement, MovementType } from './types'

const DEMO_ITEMS: InventoryItem[] = [
  { id: 'inv1', name: 'Chicken (raw)', unit: 'kg', currentStock: 14, minStock: 10 },
  { id: 'inv2', name: 'Basmati rice', unit: 'kg', currentStock: 38, minStock: 20 },
  { id: 'inv3', name: 'Cooking oil', unit: 'ltr', currentStock: 6, minStock: 8 },
  { id: 'inv4', name: 'Momo wrappers', unit: 'pcs', currentStock: 240, minStock: 200 },
  { id: 'inv5', name: 'Coke (bottles)', unit: 'pcs', currentStock: 18, minStock: 24, barcode: '8901030826244' },
  { id: 'inv6', name: 'Paneer', unit: 'kg', currentStock: 3, minStock: 5 },
]

/**
 * Same in-memory pattern as kitchenStore/shiftStore. Once wired to Supabase,
 * `receiveStock` becomes what a purchase order's "mark received" button
 * does for real — INSERT a stock_movement row of type 'purchase' and let a
 * trigger (or this same client call) update inventory_items.current_stock.
 */
interface InventoryState {
  items: InventoryItem[]
  movements: StockMovement[]
  addItem: (name: string, unit: string, minStock: number, barcode?: string) => string
  adjustStock: (itemId: string, delta: number, type: MovementType, note?: string) => void
  receiveStock: (itemId: string, quantity: number, note?: string) => void
}

export const useInventoryStore = create<InventoryState>((set) => ({
  items: DEMO_ITEMS,
  movements: [],
  addItem: (name, unit, minStock, barcode) => {
    const id = `inv-${Date.now()}`
    set((state) => ({
      items: [...state.items, { id, name, unit, currentStock: 0, minStock, barcode }],
    }))
    return id
  },
  adjustStock: (itemId, delta, type, note) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === itemId ? { ...i, currentStock: Math.max(0, i.currentStock + delta) } : i)),
      movements: [
        { id: `mv-${Date.now()}`, itemId, type, quantity: delta, note, createdAt: new Date().toISOString() },
        ...state.movements,
      ],
    })),
  receiveStock: (itemId, quantity, note) =>
    set((state) => ({
      items: state.items.map((i) => (i.id === itemId ? { ...i, currentStock: i.currentStock + quantity } : i)),
      movements: [
        { id: `mv-${Date.now()}`, itemId, type: 'purchase', quantity, note, createdAt: new Date().toISOString() },
        ...state.movements,
      ],
    })),
}))
