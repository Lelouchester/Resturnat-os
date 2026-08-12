import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import type { InventoryItem } from './types'

const UNITS = ['kg', 'g', 'ltr', 'ml', 'pcs']

export function EditItemModal({
  item,
  menuItems,
  linkedMenuItemIds,
  onSave,
  onClose,
}: {
  item: InventoryItem
  menuItems: { id: string; name: string }[]
  linkedMenuItemIds: string[]
  onSave: (updates: { name: string; unit: string; minStock: number; barcode?: string }, linkedMenuItemIds: string[]) => void
  onClose: () => void
}) {
  const [name, setName] = useState(item.name)
  const [unit, setUnit] = useState(item.unit)
  const [minStock, setMinStock] = useState(String(item.minStock))
  const [barcode, setBarcode] = useState(item.barcode ?? '')
  const [selectedLinks, setSelectedLinks] = useState<string[]>(linkedMenuItemIds)

  function toggleLink(menuItemId: string) {
    setSelectedLinks((prev) => (prev.includes(menuItemId) ? prev.filter((id) => id !== menuItemId) : [...prev, menuItemId]))
  }

  function handleSave() {
    if (!name.trim()) return
    onSave({ name: name.trim(), unit, minStock: Number(minStock) || 0, barcode: barcode.trim() || undefined }, selectedLinks)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-ticket text-lg font-bold">Edit item</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>

        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Item name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full mb-4 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
        />

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Unit</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full text-sm border border-ink/10 rounded-xl px-2 py-2.5 outline-none focus:border-ember bg-surface"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Low-stock level</label>
            <input
              type="number"
              min="0"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
            />
          </div>
        </div>
        <p className="text-[11px] text-ink/40 -mt-3 mb-4">
          This item turns red once its stock falls to or below this number.
        </p>

        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Barcode (optional)</label>
        <input
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          className="w-full mb-5 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
        />

        {menuItems.length > 0 && (
          <div className="mb-5">
            <label className="text-xs font-semibold text-ink/50 mb-1 block">Used in these menu items</label>
            <p className="text-[11px] text-ink/40 mb-2">
              For the Item Usage report only — comparing how much of this you bought vs. how many of these were sold. Doesn't affect stock automatically.
            </p>
            <div className="max-h-40 overflow-y-auto border border-ink/10 rounded-xl divide-y divide-ink/5">
              {menuItems.map((mi) => (
                <label key={mi.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLinks.includes(mi.id)}
                    onChange={() => toggleLink(mi.id)}
                    className="accent-ember"
                  />
                  {mi.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <Button className="w-full" disabled={!name.trim()} onClick={handleSave}>
          Save changes
        </Button>
      </div>
    </div>
  )
}
