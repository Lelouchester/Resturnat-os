import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'
import type { MenuCategory, MenuItem } from './types'

/**
 * Real data now — same pattern as tablesStore/shiftStore. Combos are stored
 * in a join table (menu_item_combo_components), fetched in one query via
 * PostgREST's relational embedding rather than a second round trip.
 */
interface MenuState {
  categories: MenuCategory[]
  items: MenuItem[]
  loading: boolean
  initialized: boolean
  init: () => void
  addCategory: (name: string) => Promise<void>
  removeCategory: (id: string) => Promise<{ ok: boolean; error?: string }>
  toggleCategoryDiscountExempt: (id: string) => Promise<void>
  saveItem: (data: Omit<MenuItem, 'id'> & { id?: string }) => Promise<void>
  deleteItem: (id: string) => Promise<{ ok: boolean; deactivatedInstead?: boolean; error?: string }>
  toggleAvailability: (id: string) => Promise<void>
}

function mapItemRow(row: any): MenuItem {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    categoryId: row.category_id,
    prepTimeMinutes: row.prep_time_minutes ?? undefined,
    isFavorite: row.is_favorite ?? false,
    isAvailable: row.is_available ?? true,
    comboItemIds: (row.combo_components ?? []).map((c: any) => c.component_item_id),
    trackedInventoryItemId: row.tracked_inventory_item_id ?? undefined,
    happyHour: row.happy_hour_price
      ? { price: Number(row.happy_hour_price), startTime: row.happy_hour_start, endTime: row.happy_hour_end }
      : undefined,
  }
}

const ITEM_SELECT = '*, combo_components:menu_item_combo_components!combo_item_id(component_item_id)'

async function loadAll() {
  const [{ data: categories, error: catError }, { data: items, error: itemError }] = await Promise.all([
    supabase.from('menu_categories').select('id, name, exclude_from_discount').eq('branch_id', currentBranchId()).order('sort_order'),
    supabase.from('menu_items').select(ITEM_SELECT).eq('branch_id', currentBranchId()).order('sort_order'),
  ])
  if (catError) console.error('[menuStore] failed to load categories', catError)
  if (itemError) console.error('[menuStore] failed to load items', itemError)
  return {
    categories: (categories ?? []).map((c: any) => ({ id: c.id, name: c.name, excludeFromDiscount: c.exclude_from_discount ?? false })),
    items: (items ?? []).map(mapItemRow),
  }
}

export const useMenuStore = create<MenuState>((set, get) => ({
  categories: [],
  items: [],
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadAll().then(({ categories, items }) => set({ categories, items, loading: false }))

    // Combos and happy-hour both live inside the same menu_items row, and a
    // combo edit also touches the join table — simplest correct approach is
    // reloading everything on any change rather than patching selectively.
    supabase
      .channel(`menu:${currentBranchId()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items', filter: `branch_id=eq.${currentBranchId()}` }, () => {
        loadAll().then(({ categories, items }) => set({ categories, items }))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories', filter: `branch_id=eq.${currentBranchId()}` }, () => {
        loadAll().then(({ categories, items }) => set({ categories, items }))
      })
      .subscribe()
  },

  addCategory: async (name) => {
    const sortOrder = get().categories.length + 1
    const { error } = await supabase
      .from('menu_categories')
      .insert({ branch_id: currentBranchId(), name, sort_order: sortOrder })
    if (error) {
      console.error('[menuStore] addCategory failed', error)
      return
    }
    // Explicit reload — this table isn't guaranteed to be covered by the
    // realtime publication the way others are, so don't rely on that alone.
    const { categories, items } = await loadAll()
    set({ categories, items })
  },

  removeCategory: async (id) => {
    // Items in this category aren't deleted — the schema sets their
    // category_id to null (they show up as "uncategorized"), never
    // silently disappears any menu items.
    const { error } = await supabase.from('menu_categories').delete().eq('id', id)
    if (error) {
      console.error('[menuStore] removeCategory failed', error)
      return { ok: false, error: 'Something went wrong removing this category.' }
    }
    const { categories, items } = await loadAll()
    set({ categories, items })
    return { ok: true }
  },

  toggleCategoryDiscountExempt: async (id) => {
    const category = get().categories.find((c) => c.id === id)
    if (!category) return
    const { error } = await supabase
      .from('menu_categories')
      .update({ exclude_from_discount: !category.excludeFromDiscount })
      .eq('id', id)
    if (error) console.error('[menuStore] toggleCategoryDiscountExempt failed', error)
    const { categories, items } = await loadAll()
    set({ categories, items })
  },

  saveItem: async (data) => {
    const payload = {
      branch_id: currentBranchId(),
      category_id: data.categoryId,
      name: data.name,
      price: data.price,
      prep_time_minutes: data.prepTimeMinutes ?? null,
      is_favorite: data.isFavorite ?? false,
      is_available: data.isAvailable ?? true,
      happy_hour_price: data.happyHour?.price ?? null,
      happy_hour_start: data.happyHour?.startTime ?? null,
      happy_hour_end: data.happyHour?.endTime ?? null,
      tracked_inventory_item_id: data.trackedInventoryItemId ?? null,
    }

    let itemId = data.id
    if (itemId) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', itemId)
      if (error) {
        console.error('[menuStore] saveItem (update) failed', error)
        return
      }
    } else {
      const { data: inserted, error } = await supabase.from('menu_items').insert(payload).select().single()
      if (error || !inserted) {
        console.error('[menuStore] saveItem (insert) failed', error)
        return
      }
      itemId = inserted.id
    }

    // Combo components: clear and re-insert to match whatever's currently selected.
    const { error: clearError } = await supabase.from('menu_item_combo_components').delete().eq('combo_item_id', itemId)
    if (clearError) console.error('[menuStore] failed to clear combo components', clearError)

    if (data.comboItemIds && data.comboItemIds.length > 0) {
      const rows = data.comboItemIds.map((componentId) => ({ combo_item_id: itemId, component_item_id: componentId }))
      const { error: comboError } = await supabase.from('menu_item_combo_components').insert(rows)
      if (comboError) console.error('[menuStore] failed to save combo components', comboError)
    }

    set(await loadAll())
  },

  deleteItem: async (id) => {
    const { error } = await supabase.from('menu_items').delete().eq('id', id)
    if (error) {
      // Real order history references this item — hard-deleting it would
      // break past receipts/reports. Hide it from ordering instead.
      if (error.code === '23503') {
        const { error: hideErr } = await supabase.from('menu_items').update({ is_available: false }).eq('id', id)
        if (hideErr) {
          console.error('[menuStore] fallback deactivate failed', hideErr)
          return { ok: false, error: 'Something went wrong removing this item.' }
        }
        const { categories, items } = await loadAll()
        set({ categories, items })
        return { ok: true, deactivatedInstead: true }
      }
      console.error('[menuStore] deleteItem failed', error)
      return { ok: false, error: 'Something went wrong removing this item.' }
    }
    const { categories, items } = await loadAll()
    set({ categories, items })
    return { ok: true }
  },

  toggleAvailability: async (id) => {
    const item = get().items.find((i) => i.id === id)
    if (!item) return
    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: item.isAvailable === false })
      .eq('id', id)
    if (error) console.error('[menuStore] toggleAvailability failed', error)
  },
}))
