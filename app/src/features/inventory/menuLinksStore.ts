import { create } from 'zustand'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'

/**
 * Which menu items are made from which inventory items — used ONLY for the
 * Reports > Item Usage comparison ("110L milk bought, 500 milk-based drinks
 * sold"), never to automatically deduct stock. That's a deliberately
 * different, much simpler thing than recipe/BOM auto-deduction — see
 * README for why. A menu item can link to more than one inventory item
 * (e.g. "Milk Coffee" could link to both Milk and Coffee Powder), and an
 * inventory item can be linked from more than one menu item.
 */
interface MenuLinksState {
  linksByInventoryItem: Record<string, string[]> // inventoryItemId -> menuItemId[]
  loading: boolean
  initialized: boolean
  init: () => void
  setLinksForItem: (inventoryItemId: string, menuItemIds: string[]) => Promise<void>
}

async function loadLinks(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from('menu_inventory_links')
    .select('inventory_item_id, menu_item_id')
    .eq('branch_id', currentBranchId())
  if (error) {
    console.error('[menuLinksStore] failed to load links', error)
    return {}
  }
  const map: Record<string, string[]> = {}
  for (const row of data ?? []) {
    const key = (row as any).inventory_item_id
    const menuId = (row as any).menu_item_id
    if (!map[key]) map[key] = []
    map[key].push(menuId)
  }
  return map
}

export const useMenuLinksStore = create<MenuLinksState>((set, get) => ({
  linksByInventoryItem: {},
  loading: true,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })

    loadLinks().then((linksByInventoryItem) => set({ linksByInventoryItem, loading: false }))

    supabase
      .channel(`menu_inventory_links:${currentBranchId()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_inventory_links', filter: `branch_id=eq.${currentBranchId()}` },
        () => loadLinks().then((linksByInventoryItem) => set({ linksByInventoryItem }))
      )
      .subscribe()
  },

  // Replaces the full set of menu items linked to this inventory item —
  // simplest correct approach given how rarely this changes (set up once
  // per ingredient, then left alone), rather than diffing individual rows.
  setLinksForItem: async (inventoryItemId, menuItemIds) => {
    const { error: delErr } = await supabase.from('menu_inventory_links').delete().eq('inventory_item_id', inventoryItemId)
    if (delErr) console.error('[menuLinksStore] clearing old links failed', delErr)

    if (menuItemIds.length > 0) {
      const rows = menuItemIds.map((menuItemId) => ({
        branch_id: currentBranchId(),
        inventory_item_id: inventoryItemId,
        menu_item_id: menuItemId,
      }))
      const { error: insErr } = await supabase.from('menu_inventory_links').insert(rows)
      if (insErr) console.error('[menuLinksStore] inserting links failed', insErr)
    }
    set({ linksByInventoryItem: await loadLinks() })
  },
}))
