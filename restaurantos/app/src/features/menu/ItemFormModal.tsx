import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import type { MenuCategory, MenuItem } from './types'
import type { InventoryItem } from '../inventory/types'

export function ItemFormModal({
  categories,
  allItems,
  inventoryItems,
  initial,
  onSave,
  onClose,
}: {
  categories: MenuCategory[]
  allItems: MenuItem[]
  inventoryItems: InventoryItem[]
  initial?: MenuItem
  onSave: (item: Omit<MenuItem, 'id'> & { id?: string }) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(initial?.price?.toString() ?? '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories[0]?.id ?? '')
  const [prepTime, setPrepTime] = useState(initial?.prepTimeMinutes?.toString() ?? '')
  const [isFavorite, setIsFavorite] = useState(initial?.isFavorite ?? false)
  const [isAvailable, setIsAvailable] = useState(initial?.isAvailable ?? true)

  const [isCombo, setIsCombo] = useState(!!initial?.comboItemIds?.length)
  const [comboItemIds, setComboItemIds] = useState<string[]>(initial?.comboItemIds ?? [])

  const [isHappyHour, setIsHappyHour] = useState(!!initial?.happyHour)
  const [hhPrice, setHhPrice] = useState(initial?.happyHour?.price?.toString() ?? '')
  const [hhStart, setHhStart] = useState(initial?.happyHour?.startTime ?? '16:00')
  const [hhEnd, setHhEnd] = useState(initial?.happyHour?.endTime ?? '18:00')

  const [isTrackable, setIsTrackable] = useState(!!initial?.trackedInventoryItemId)
  const [trackedInventoryItemId, setTrackedInventoryItemId] = useState(initial?.trackedInventoryItemId ?? inventoryItems[0]?.id ?? '')

  const canSave = name.trim().length > 0 && Number(price) > 0 && categoryId

  function toggleComboItem(id: string) {
    setComboItemIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  function handleSave() {
    onSave({
      id: initial?.id,
      name: name.trim(),
      price: Number(price),
      categoryId,
      prepTimeMinutes: prepTime ? Number(prepTime) : undefined,
      isFavorite,
      isAvailable,
      comboItemIds: isCombo && comboItemIds.length > 0 ? comboItemIds : undefined,
      happyHour: isHappyHour && hhPrice ? { price: Number(hhPrice), startTime: hhStart, endTime: hhEnd } : undefined,
      trackedInventoryItemId: isTrackable && trackedInventoryItemId ? trackedInventoryItemId : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-md md:rounded-3xl rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-ticket text-lg font-bold">{initial ? 'Edit item' : 'New item'}</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chicken chilli"
              className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (Rs.)">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full text-sm font-ticket border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
              />
            </Field>
            <Field label="Prep time (min)">
              <input
                type="number"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="optional"
                className="w-full text-sm font-ticket border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
              />
            </Field>
          </div>

          <Field label="Category">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember bg-surface"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Mark as favorite</span>
            <Toggle checked={isFavorite} onChange={setIsFavorite} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Available right now</span>
            <Toggle checked={isAvailable} onChange={setIsAvailable} />
          </div>

          {/* Combo meal */}
          <div className="border-t border-ink/5 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">This is a combo meal</span>
              <Toggle checked={isCombo} onChange={setIsCombo} />
            </div>
            {isCombo && (
              <div>
                <p className="text-xs text-ink/40 mb-2">Pick what's bundled in — charged at the single price above.</p>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {allItems.filter((i) => i.id !== initial?.id).map((i) => (
                    <button
                      key={i.id}
                      onClick={() => toggleComboItem(i.id)}
                      className={`text-xs font-semibold rounded-full px-2.5 py-1 border transition-colors ${
                        comboItemIds.includes(i.id) ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink/60 border-ink/10'
                      }`}
                    >
                      {i.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Happy hour pricing */}
          <div className="border-t border-ink/5 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Happy hour pricing</span>
              <Toggle checked={isHappyHour} onChange={setIsHappyHour} />
            </div>
            {isHappyHour && (
              <div className="grid grid-cols-3 gap-2">
                <Field label="Happy price">
                  <input
                    type="number"
                    value={hhPrice}
                    onChange={(e) => setHhPrice(e.target.value)}
                    className="w-full text-sm font-ticket border border-ink/10 rounded-xl px-2.5 py-2 outline-none focus:border-ember"
                  />
                </Field>
                <Field label="From">
                  <input
                    type="time"
                    value={hhStart}
                    onChange={(e) => setHhStart(e.target.value)}
                    className="w-full text-sm border border-ink/10 rounded-xl px-2.5 py-2 outline-none focus:border-ember"
                  />
                </Field>
                <Field label="Until">
                  <input
                    type="time"
                    value={hhEnd}
                    onChange={(e) => setHhEnd(e.target.value)}
                    className="w-full text-sm border border-ink/10 rounded-xl px-2.5 py-2 outline-none focus:border-ember"
                  />
                </Field>
              </div>
            )}
          </div>

          {/* Trackable — linked to inventory */}
          <div className="border-t border-ink/5 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Trackable — linked to inventory</span>
              <Toggle checked={isTrackable} onChange={setIsTrackable} />
            </div>
            {isTrackable && (
              <div>
                <p className="text-xs text-ink/40 mb-2">
                  Selling this item decreases the linked inventory item's stock by 1 each time — buying more of it in Purchasing increases it back. For things sold directly, like beer, liquor, or cigarettes.
                </p>
                {inventoryItems.length === 0 ? (
                  <p className="text-xs text-status-cleaning">No inventory items yet — add one in Inventory first.</p>
                ) : (
                  <select
                    value={trackedInventoryItemId}
                    onChange={(e) => setTrackedInventoryItemId(e.target.value)}
                    className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember bg-surface"
                  >
                    {inventoryItems.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>

        <Button className="w-full mt-6" disabled={!canSave} onClick={handleSave}>
          {initial ? 'Save changes' : 'Add item'}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink/50 mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-ember' : 'bg-ink/15'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}
