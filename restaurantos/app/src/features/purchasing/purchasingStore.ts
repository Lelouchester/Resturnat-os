import { create } from 'zustand'
import type { Supplier, PurchaseRecord, PurchaseLine, PurchaseCategory } from './types'

const DEMO_SUPPLIERS: Supplier[] = [
  { id: 'sup1', name: 'Himalayan Fresh Meat Co.', phone: '98XXXXXXXX', outstandingBalance: 3200 },
  { id: 'sup2', name: 'Kathmandu Grocery Wholesale', phone: '98XXXXXXXX', outstandingBalance: 0 },
  { id: 'sup3', name: 'Valley Beverages Pvt. Ltd.', phone: '98XXXXXXXX', outstandingBalance: 1450 },
]

interface PurchasingState {
  suppliers: Supplier[]
  purchases: PurchaseRecord[]
  addSupplier: (name: string, phone?: string) => void
  /**
   * Records a purchase — this is the one function that ties three modules
   * together: it withdraws whatever was actually paid from Accounts, adds
   * any shortfall to the supplier's outstanding balance (only allowed when a
   * supplier is attached — a one-off purchase with no supplier must be paid
   * in full), and immediately bumps Inventory stock for any tracked lines
   * if the goods are marked received.
   */
  createPurchase: (
    input: {
      supplierId?: string
      category: PurchaseCategory
      lines: PurchaseLine[]
      received: boolean
      paidAmounts: Record<string, number>
    },
    hooks: {
      onWithdraw: (method: string, amount: number) => void
      onReceiveStock: (inventoryItemId: string, quantity: number, note: string) => void
    }
  ) => void
  markReceived: (purchaseId: string, onReceiveStock: (inventoryItemId: string, quantity: number, note: string) => void) => void
  recordSupplierPayment: (supplierId: string, method: string, amount: number, onWithdraw: (method: string, amount: number) => void) => void
}

export const usePurchasingStore = create<PurchasingState>((set, get) => ({
  suppliers: DEMO_SUPPLIERS,
  purchases: [],
  addSupplier: (name, phone) =>
    set((state) => ({
      suppliers: [...state.suppliers, { id: `sup-${Date.now()}`, name, phone, outstandingBalance: 0 }],
    })),
  createPurchase: (input, hooks) => {
    const total = input.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    const paid = Object.values(input.paidAmounts).reduce((s, a) => s + a, 0)
    const shortfall = Math.max(0, total - paid)

    Object.entries(input.paidAmounts).forEach(([method, amount]) => {
      if (amount > 0) hooks.onWithdraw(method, amount)
    })

    if (input.received) {
      input.lines
        .filter((l) => l.kind === 'inventory' && l.inventoryItemId)
        .forEach((l) => hooks.onReceiveStock(l.inventoryItemId!, l.quantity, `Purchase: ${l.description}`))
    }

    set((state) => ({
      purchases: [
        ...state.purchases,
        {
          id: `pur-${Date.now()}`,
          supplierId: input.supplierId,
          category: input.category,
          lines: input.lines,
          status: input.received ? 'received' : 'ordered',
          paidAmounts: input.paidAmounts,
          createdAt: new Date().toISOString(),
        },
      ],
      suppliers:
        shortfall > 0 && input.supplierId
          ? state.suppliers.map((s) => (s.id === input.supplierId ? { ...s, outstandingBalance: s.outstandingBalance + shortfall } : s))
          : state.suppliers,
    }))
  },
  markReceived: (purchaseId, onReceiveStock) => {
    const purchase = get().purchases.find((p) => p.id === purchaseId)
    if (!purchase) return
    purchase.lines
      .filter((l) => l.kind === 'inventory' && l.inventoryItemId)
      .forEach((l) => onReceiveStock(l.inventoryItemId!, l.quantity, `Purchase: ${l.description}`))
    set((state) => ({
      purchases: state.purchases.map((p) => (p.id === purchaseId ? { ...p, status: 'received' } : p)),
    }))
  },
  recordSupplierPayment: (supplierId, method, amount, onWithdraw) => {
    onWithdraw(method, amount)
    set((state) => ({
      suppliers: state.suppliers.map((s) =>
        s.id === supplierId ? { ...s, outstandingBalance: Math.max(0, s.outstandingBalance - amount) } : s
      ),
    }))
  },
}))
