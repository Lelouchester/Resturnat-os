import { useEffect, useMemo, useState } from 'react'
import { Plus, AlertTriangle, History, SlidersHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { useInventoryStore } from './inventoryStore'
import { useMenuLinksStore } from './menuLinksStore'
import { useMenuStore } from '../menu/menuStore'
import { AdjustStockModal } from './AdjustStockModal'
import { EditItemModal } from './EditItemModal'
import type { InventoryItem } from './types'

export function InventoryPage() {
  const items = useInventoryStore((s) => s.items)
  const movements = useInventoryStore((s) => s.movements)
  const loading = useInventoryStore((s) => s.loading)
  const init = useInventoryStore((s) => s.init)
  const addItem = useInventoryStore((s) => s.addItem)
  const updateItem = useInventoryStore((s) => s.updateItem)
  const menuItems = useMenuStore((s) => s.items)
  const initMenu = useMenuStore((s) => s.init)
  const linksByInventoryItem = useMenuLinksStore((s) => s.linksByInventoryItem)
  const initMenuLinks = useMenuLinksStore((s) => s.init)
  const setLinksForItem = useMenuLinksStore((s) => s.setLinksForItem)
  const deleteItem = useInventoryStore((s) => s.deleteItem)
  const adjustStock = useInventoryStore((s) => s.adjustStock)

  useEffect(() => {
    init()
    initMenu()
    initMenuLinks()
  }, [init, initMenu, initMenuLinks])

  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [removing, setRemoving] = useState<InventoryItem | null>(null)
  const [itemError, setItemError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('kg')
  const [newMin, setNewMin] = useState('10')
  const [newBarcode, setNewBarcode] = useState('')

  async function handleRemove() {
    if (!removing) return
    const result = await deleteItem(removing.id)
    if (result.deactivatedInstead) {
      setItemError('This item has purchase/stock history, so it was hidden instead of deleted.')
      setTimeout(() => setItemError(null), 5000)
    } else if (!result.ok) {
      setItemError(result.error ?? 'Could not remove this item.')
      setTimeout(() => setItemError(null), 4000)
    }
    setRemoving(null)
  }

  const lowStockItems = useMemo(() => items.filter((i) => i.currentStock <= i.minStock), [items])
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const visibleItems = useMemo(() => {
    let list = items
    if (lowStockOnly) list = list.filter((i) => i.currentStock <= i.minStock)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q))
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [items, search, lowStockOnly])

  function handleAddItem() {
    if (!newName.trim()) return
    addItem(newName.trim(), newUnit, Number(newMin) || 0, newBarcode.trim() || undefined)
    setNewName('')
    setNewBarcode('')
    setAddingItem(false)
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="font-ticket text-xl font-bold">Inventory</h1>
        </div>
        <div className="h-40 rounded-2xl bg-ink/5 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-ticket text-xl font-bold">Inventory</h1>
          <p className="text-sm text-ink/50">{items.length} items tracked</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-surface border border-ink/10 px-3 py-2.5 text-sm font-semibold hover:bg-ink/5"
          >
            <History size={15} /> History
          </button>
          <button
            onClick={() => setAddingItem(true)}
            className="flex items-center gap-1.5 rounded-xl bg-ember text-white px-3.5 py-2.5 text-sm font-semibold hover:brightness-95"
          >
            <Plus size={16} /> Add item
          </button>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <Card className="p-3.5 mb-4 border-status-cleaning/30 bg-status-cleaning-bg/40">
          <div className="flex items-center gap-2 text-status-cleaning font-semibold text-sm">
            <AlertTriangle size={16} />
            {lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''} at or below minimum stock
          </div>
        </Card>
      )}

      {addingItem && (
        <Card className="p-4 mb-3">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Item name"
              autoFocus
              className="col-span-3 text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
            />
            <select
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              className="text-sm border border-ink/10 rounded-xl px-2 py-2 outline-none focus:border-ember bg-surface"
            >
              <option value="kg">kg</option>
              <option value="g">g</option>
              <option value="ltr">ltr</option>
              <option value="ml">ml</option>
              <option value="pcs">pcs</option>
            </select>
            <input
              type="number"
              min="0"
              value={newMin}
              onChange={(e) => setNewMin(e.target.value)}
              placeholder="Min stock"
              className="text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
            />
            <input
              value={newBarcode}
              onChange={(e) => setNewBarcode(e.target.value)}
              placeholder="Barcode (optional)"
              className="text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
            />
            <button onClick={handleAddItem} className="text-sm font-semibold text-ember">Add</button>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search inventory…"
          className="flex-1 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember bg-surface"
        />
        <button
          onClick={() => setLowStockOnly((v) => !v)}
          className={`shrink-0 text-xs font-semibold rounded-full px-3 py-2.5 border ${
            lowStockOnly ? 'bg-status-cleaning text-white border-status-cleaning' : 'border-ink/10 text-ink/60'
          }`}
        >
          Low stock only
        </button>
      </div>
      {(search || lowStockOnly) && (
        <p className="text-xs text-ink/40 mb-2">{visibleItems.length} of {items.length} items</p>
      )}

      <div className="space-y-2">
        {visibleItems.length === 0 && items.length > 0 && (
          <p className="text-sm text-ink/40 text-center py-8">No items match that search.</p>
        )}
        {visibleItems.map((item) => {
          const low = item.currentStock <= item.minStock
          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 bg-surface border rounded-2xl p-3.5 ${low ? 'border-status-cleaning/30' : 'border-ink/5'}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  {item.name}
                  {low && <AlertTriangle size={13} className="text-status-cleaning" />}
                </div>
                <div className="text-xs text-ink/40 mt-0.5">Min {item.minStock} {item.unit}{item.barcode ? ` · barcode ${item.barcode}` : ''}</div>
              </div>
              <div className={`font-ticket text-sm font-bold ${low ? 'text-status-cleaning' : ''}`}>
                {item.currentStock} {item.unit}
              </div>
              <button
                onClick={() => setAdjusting(item)}
                className="shrink-0 flex items-center gap-1 text-xs font-semibold rounded-full border border-ink/10 px-2.5 py-1.5 hover:bg-ink/5"
              >
                <SlidersHorizontal size={12} /> Adjust
              </button>
              <button onClick={() => setEditing(item)} className="shrink-0 text-ink/40 hover:text-ink">
                <Pencil size={15} />
              </button>
              <button onClick={() => setRemoving(item)} className="shrink-0 text-ink/40 hover:text-status-cleaning">
                <Trash2 size={15} />
              </button>
            </div>
          )
        })}
      </div>

      {showHistory && (
        <Card className="p-4 mt-4">
          <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Recent movements</div>
          {movements.length === 0 ? (
            <p className="text-sm text-ink/40 text-center py-4">No adjustments yet.</p>
          ) : (
            <div className="space-y-2">
              {movements.map((mv) => {
                const item = items.find((i) => i.id === mv.itemId)
                return (
                  <div key={mv.id} className="flex justify-between text-sm">
                    <div>
                      <span className="font-medium">{item?.name}</span>
                      <span className="text-ink/40 text-xs ml-2 capitalize">{mv.type.replace('_', ' ')}</span>
                      {mv.note && <div className="text-xs text-ink/40">{mv.note}</div>}
                    </div>
                    <span className={`font-ticket font-semibold ${mv.quantity < 0 ? 'text-status-cleaning' : 'text-status-available'}`}>
                      {mv.quantity > 0 ? '+' : ''}{mv.quantity} {item?.unit}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {adjusting && (
        <AdjustStockModal
          item={adjusting}
          onSave={(delta, type, note) => { adjustStock(adjusting.id, delta, type, note); setAdjusting(null) }}
          onClose={() => setAdjusting(null)}
        />
      )}

      {editing && (
        <EditItemModal
          item={editing}
          menuItems={menuItems.map((mi) => ({ id: mi.id, name: mi.name }))}
          linkedMenuItemIds={linksByInventoryItem[editing.id] ?? []}
          onSave={(updates, linkedMenuItemIds) => {
            updateItem(editing.id, updates)
            setLinksForItem(editing.id, linkedMenuItemIds)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {removing && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRemoving(null)} />
          <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5">
            <h2 className="font-ticket text-lg font-bold mb-2">Remove {removing.name}?</h2>
            <p className="text-xs text-ink/50 mb-4">
              If this item has purchase or stock history, it'll be hidden instead of deleted, so that history stays intact.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setRemoving(null)}
                className="flex-1 rounded-xl border border-ink/10 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                className="flex-1 rounded-xl bg-status-cleaning text-white py-2.5 text-sm font-semibold"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {itemError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-status-cleaning text-white px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg">
          {itemError}
        </div>
      )}
    </div>
  )
}
