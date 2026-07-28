import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { CURRENT_BRANCH_ID } from '../../shared/lib/config'
import type { InventoryItem, StockMovement, MovementType } from './types'

/**
 * Real data now, same pattern as the other stores. `adjustStock` and
 * `receiveStock` both write a stock_movements row and read-modify-write
 * inventory_items.current_stock in the same call — Purchasing calls
 * `receiveStock` directly (via getState()) when a purchase is marked
 * received, the same way ordersStore calls into accountsStore.
 */
interface InventoryState {
  items: InventoryItem[]
  movements: StockMovement[]
  loading: boolean
  initialized: boolean
  init: () => void
  addItem: (name: string, unit: string, minStock: number, barcode?: string) => Promise<string>
  adjustStock: (itemId: string, delta: number, type: MovementType, note?: string) => Promise<void>
  receiveStock: (itemId: string, quantity: number, note?: string) => Promise<void>
}

function mapItem(row: any): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit ?? 'pcs',
    currentStock: Number(row.current_stock) || 0,
    minStock: Number(row.min_stock) || 0,
    barcode: row.barcode ?? undefined,
  }
}

function mapMovement(row: any): StockMovement {
  return {
    id: row.id,
    itemId: row.inventory_item_id,
    type: row.type,
    quantity: Number(row.quantity),
    note: row.note ?? undefined,
    createdAt: row.created_at,
  }
}

async function loadInventory(): Promise<{ items: InventoryItem[]; movements: StockMovement[] }> {
  const [{ data: items, error: itemsErr }, { data: movements, error: movErr }] = await Promise.all([
    supabase.from('inventory_items').select('*').eq('branch_id', CURRENT_BRANCH_ID),
    supabase
      .from('stock_movements')
      .select('*, inventory_items!inner ( branch_id )')
      .eq('inventory_items.branch_id', CURRENT_BRANCH_ID)
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  if (itemsErr) console.error('[inventoryStore] failed to load items', itemsErr)
  if (movErr) console.error('[inventoryStore] failed to load movements', movErr)

  return {
    items: (items ?? []).map(mapItem),
    movements: (movements ?? []).map(mapMovement),
  }
}

async function bumpStock(itemId: string, delta: number, type: MovementType, note?: string) {
  const { data: item, error: fetchErr } = await supabase.from('inventory_items').select('current_stock').eq('id', itemId).maybeSingle()
  if (fetchErr || !item) {
    console.error('[inventoryStore] item not found for stock update', itemId, fetchErr)
    return
  }
  const nextStock = Math.max(0, Number(item.current_stock) + delta)
  const { error: updErr } = await supabase.from('inventory_items').update({ current_stock: nextStock }).eq('id', itemId)
  if (updErr) console.error('[inventoryStore] stock update failed', updErr)

  const { error: mvErr } = await supabase.from('stock_movements').insert({ inventory_item_id: itemId, type, quantity: delta, note: note ?? null })
  if (mvErr) console.error('[inventoryStore] movement insert failed', mvErr)
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  movements: [],
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadInventory().then((data) => set({ ...data, loading: false }))

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadInventory().then((data) => set(data))
    })

    supabase
      .channel(`inventory:${CURRENT_BRANCH_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `branch_id=eq.${CURRENT_BRANCH_ID}` }, () =>
        loadInventory().then((data) => set(data))
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () =>
        loadInventory().then((data) => set(data))
      )
      .subscribe()
  },

  addItem: async (name, unit, minStock, barcode) => {
    const { data, error } = await supabase
      .from('inventory_items')
      .insert({ branch_id: CURRENT_BRANCH_ID, name, unit, min_stock: minStock, barcode: barcode ?? null })
      .select()
      .single()
    if (error || !data) {
      console.error('[inventoryStore] addItem failed', error)
      throw error
    }
    set(await loadInventory())
    return data.id
  },

  adjustStock: async (itemId, delta, type, note) => {
    await bumpStock(itemId, delta, type, note)
    set(await loadInventory())
  },

  receiveStock: async (itemId, quantity, note) => {
    await bumpStock(itemId, quantity, 'purchase', note)
    set(await loadInventory())
  },
}))
