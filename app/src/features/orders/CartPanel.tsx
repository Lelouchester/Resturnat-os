import { useState } from 'react'
import { Minus, Plus, X, StickyNote, Gift, Ban, ChefHat } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import type { CartLine, OrderItemRow } from './types'

const ITEM_STATUS_LABEL: Record<OrderItemRow['status'], string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  void: 'Void',
}

export function CartPanel({
  lines,
  subtotal,
  existingItems = [],
  onAdjust,
  onNote,
  onRemove,
  onVoid,
  onVoidExisting,
  onComplimentary,
  onConfirm,
  isOpen,
  onClose,
}: {
  lines: CartLine[]
  subtotal: number
  existingItems?: OrderItemRow[]
  onAdjust: (key: string, delta: number) => void
  onNote: (key: string, note: string) => void
  onRemove: (key: string) => void
  onVoid: (key: string, reason: string) => void
  onVoidExisting?: (itemId: string, reason: string) => void
  onComplimentary: (key: string) => void
  onConfirm: () => void | Promise<void>
  isOpen: boolean
  onClose: () => void
}) {
  const [noteEditKey, setNoteEditKey] = useState<string | null>(null)
  const [voidEditKey, setVoidEditKey] = useState<string | null>(null)
  const [voidExistingKey, setVoidExistingKey] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const billableCount = lines.filter((l) => l.status !== 'void').length

  async function handleConfirm() {
    setConfirming(true)
    try {
      await onConfirm()
    } finally {
      setConfirming(false)
    }
  }

  return (
    <>
      {/* Mobile scrim */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      )}

      <div
        className={`
          bg-surface border-ink/5 flex flex-col
          fixed md:static inset-x-0 bottom-0 z-50 md:z-auto
          rounded-t-3xl md:rounded-none border-t md:border-t-0 md:border-l
          max-h-[85vh] md:max-h-none md:h-full md:w-80 shrink-0
          transition-transform duration-200
          ${isOpen ? 'translate-y-0' : 'translate-y-full'} md:translate-y-0
        `}
      >
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-ink/5">
          <div className="font-ticket font-bold text-sm">Current order</div>
          <button className="md:hidden text-ink/40" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {existingItems.length > 0 && (
            <div className="mb-2 pb-3 border-b border-ink/5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink/40 mb-2">
                <ChefHat size={12} /> Already sent to kitchen
              </div>
              {existingItems.map((it) => (
                <div key={it.id} className={it.status === 'void' ? 'opacity-40 py-1' : 'py-1'}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink/70">{it.quantity}× {it.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-ink/40">{ITEM_STATUS_LABEL[it.status]}</span>
                      {onVoidExisting && it.status !== 'void' && (
                        <button
                          onClick={() => setVoidExistingKey(voidExistingKey === it.id ? null : it.id)}
                          className="text-ink/30 hover:text-status-cleaning"
                          title="Cancel this item"
                        >
                          <Ban size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  {voidExistingKey === it.id && (
                    <input
                      autoFocus
                      placeholder="Reason (e.g. sent back, made wrong)"
                      onBlur={(e) => {
                        if (e.target.value.trim()) onVoidExisting?.(it.id, e.target.value.trim())
                        setVoidExistingKey(null)
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="mt-1 mb-1 w-full text-xs rounded-lg border border-status-cleaning/30 px-2.5 py-1.5 outline-none focus:border-status-cleaning"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {lines.length === 0 ? (
            <p className="text-sm text-ink/40 py-8 text-center">No items yet — tap something from the menu.</p>
          ) : (
            lines.map((l) => {
              const isVoid = l.status === 'void'
              const isComp = l.status === 'complimentary'
              return (
                <div key={l.key} className={`py-3 border-b border-ink/5 last:border-0 ${isVoid ? 'opacity-40' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold truncate ${isVoid ? 'line-through' : ''}`}>
                        {l.name}
                        {isComp && <span className="ml-1.5 text-[10px] font-bold text-ember bg-ember/10 rounded-full px-1.5 py-0.5">COMP</span>}
                        {isVoid && <span className="ml-1.5 text-[10px] font-bold text-status-cleaning bg-status-cleaning-bg rounded-full px-1.5 py-0.5">VOID</span>}
                      </div>
                      <div className="text-xs text-ink/40 font-ticket">Rs. {l.unitPrice} each</div>
                      {l.note && <div className="text-xs text-ember mt-0.5">📝 {l.note}</div>}
                      {isVoid && l.voidReason && <div className="text-xs text-status-cleaning mt-0.5">Reason: {l.voidReason}</div>}
                    </div>
                    <div className="font-ticket font-semibold text-sm">
                      {isComp ? 'Rs. 0' : `Rs. ${l.unitPrice * l.quantity}`}
                    </div>
                  </div>

                  {!isVoid && (
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onAdjust(l.key, -1)}
                          className="h-7 w-7 rounded-full border border-ink/10 flex items-center justify-center hover:bg-ink/5"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="font-ticket text-sm font-semibold w-5 text-center">{l.quantity}</span>
                        <button
                          onClick={() => onAdjust(l.key, 1)}
                          className="h-7 w-7 rounded-full border border-ink/10 flex items-center justify-center hover:bg-ink/5"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => setNoteEditKey(noteEditKey === l.key ? null : l.key)}
                          className="text-ink/40 hover:text-ink"
                          title="Add note"
                        >
                          <StickyNote size={14} />
                        </button>
                        <button
                          onClick={() => onComplimentary(l.key)}
                          className={isComp ? 'text-ember' : 'text-ink/40 hover:text-ember'}
                          title="Mark complimentary"
                        >
                          <Gift size={14} />
                        </button>
                        <button
                          onClick={() => setVoidEditKey(voidEditKey === l.key ? null : l.key)}
                          className="text-ink/40 hover:text-status-cleaning"
                          title="Void item"
                        >
                          <Ban size={14} />
                        </button>
                        <button onClick={() => onRemove(l.key)} className="text-ink/40 hover:text-status-cleaning">
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  )}

                  {noteEditKey === l.key && (
                    <input
                      autoFocus
                      defaultValue={l.note}
                      placeholder="e.g. no onion, extra spicy"
                      onBlur={(e) => { onNote(l.key, e.target.value); setNoteEditKey(null) }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="mt-2 w-full text-xs rounded-lg border border-ink/10 px-2.5 py-1.5 outline-none focus:border-ember"
                    />
                  )}
                  {voidEditKey === l.key && (
                    <input
                      autoFocus
                      placeholder="Reason (e.g. sent back, made wrong)"
                      onBlur={(e) => { if (e.target.value.trim()) { onVoid(l.key, e.target.value.trim()); } setVoidEditKey(null) }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="mt-2 w-full text-xs rounded-lg border border-status-cleaning/30 px-2.5 py-1.5 outline-none focus:border-status-cleaning"
                    />
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="border-t border-ink/5 px-4 py-3.5">
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-sm text-ink/50">Subtotal</span>
            <span className="font-ticket text-lg font-bold">Rs. {subtotal}</span>
          </div>
          <Button
            className="w-full text-white hover:brightness-95"
            style={{ background: 'var(--color-ember)' }}
            disabled={billableCount === 0 || confirming}
            onClick={handleConfirm}
          >
            {confirming ? 'Sending…' : 'Confirm order'}
          </Button>
        </div>
      </div>
    </>
  )
}
