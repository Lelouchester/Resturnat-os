import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import type { InventoryItem, MovementType } from './types'

const REASONS: { key: MovementType; label: string }[] = [
  { key: 'adjustment', label: 'Correction' },
  { key: 'waste', label: 'Waste / spoilage' },
  { key: 'physical_count', label: 'Physical count' },
]

export function AdjustStockModal({
  item,
  onSave,
  onClose,
}: {
  item: InventoryItem
  onSave: (delta: number, type: MovementType, note?: string) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [qty, setQty] = useState('')
  const [type, setType] = useState<MovementType>('adjustment')
  const [note, setNote] = useState('')

  const safeQty = Math.max(0, Number(qty) || 0)
  const delta = mode === 'add' ? safeQty : -safeQty
  const resulting = item.currentStock + delta

  function handleSave() {
    if (!qty) return
    onSave(delta, type, note.trim() || undefined)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-ticket text-lg font-bold">Adjust stock</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>
        <p className="text-sm text-ink/50 mb-4">
          {item.name} — currently <span className="font-ticket font-semibold text-ink">{item.currentStock} {item.unit}</span>
        </p>

        <div className="flex rounded-xl bg-ink/5 p-1 mb-4">
          <button
            onClick={() => setMode('add')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === 'add' ? 'bg-surface shadow-sm' : 'text-ink/50'}`}
          >
            Add
          </button>
          <button
            onClick={() => setMode('remove')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${mode === 'remove' ? 'bg-surface shadow-sm' : 'text-ink/50'}`}
          >
            Remove
          </button>
        </div>

        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Quantity ({item.unit})</label>
        <input
          type="number"
          min="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          autoFocus
          className="w-full mb-4 text-lg font-ticket font-bold border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
        />

        {mode === 'remove' && (
          <>
            <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Reason</label>
            <div className="flex gap-2 mb-4">
              {REASONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setType(r.key)}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold border transition-colors ${
                    type === r.key ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink/60 border-ink/10'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Note (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. spilled during prep"
          className="w-full mb-4 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
        />

        {qty && (
          <p className="text-xs text-ink/50 mb-4">
            New stock: <span className="font-ticket font-semibold text-ink">{Math.max(0, resulting)} {item.unit}</span>
          </p>
        )}

        <Button className="w-full" disabled={!qty} onClick={handleSave}>
          Save adjustment
        </Button>
      </div>
    </div>
  )
}
