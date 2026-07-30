import { useEffect, useMemo, useState } from 'react'
import { Plus, X, PackageCheck, Phone, Receipt, Trash2, Download } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { Button } from '../../shared/ui/Button'
import { usePurchasingStore } from './purchasingStore'
import { useInventoryStore } from '../inventory/inventoryStore'
import { useAccountsStore } from '../accounts/accountsStore'
import { useSettingsStore } from '../settings/settingsStore'
import { CATEGORY_LABELS } from './types'
import type { PurchaseLine, PurchaseCategory } from './types'

const NEW_ITEM_SENTINEL = '__new__'
const NEW_SUPPLIER_SENTINEL = '__new_supplier__'

export function PurchasingPage() {
  const suppliers = usePurchasingStore((s) => s.suppliers)
  const purchases = usePurchasingStore((s) => s.purchases)
  const purchasingLoading = usePurchasingStore((s) => s.loading)
  const initPurchasing = usePurchasingStore((s) => s.init)
  const addSupplier = usePurchasingStore((s) => s.addSupplier)
  const removeSupplier = usePurchasingStore((s) => s.removeSupplier)
  const createPurchase = usePurchasingStore((s) => s.createPurchase)
  const markReceived = usePurchasingStore((s) => s.markReceived)
  const recordSupplierPayment = usePurchasingStore((s) => s.recordSupplierPayment)

  const inventoryItems = useInventoryStore((s) => s.items)
  const initInventory = useInventoryStore((s) => s.init)
  const addInventoryItem = useInventoryStore((s) => s.addItem)

  const initAccounts = useAccountsStore((s) => s.init)
  const balances = useAccountsStore((s) => s.balances)
  const paymentMethods = useSettingsStore((s) => s.paymentMethods)

  useEffect(() => {
    initPurchasing()
    initInventory()
    initAccounts()
  }, [initPurchasing, initInventory, initAccounts])

  const [addingSupplier, setAddingSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [creatingPurchase, setCreatingPurchase] = useState(false)
  const [payingSupplier, setPayingSupplier] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [historyFrom, setHistoryFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().slice(0, 10))

  const purchasesInRange = useMemo(() => {
    const from = new Date(`${historyFrom}T00:00:00`).getTime()
    const to = new Date(`${historyTo}T23:59:59`).getTime()
    return purchases.filter((p) => {
      const t = new Date(p.createdAt).getTime()
      return t >= from && t <= to
    })
  }, [purchases, historyFrom, historyTo])

  async function handleRemoveSupplier(id: string) {
    const result = await removeSupplier(id)
    if (!result.ok) {
      setRemoveError(result.error ?? 'Could not remove this supplier.')
      setTimeout(() => setRemoveError(null), 4000)
    }
  }

  if (purchasingLoading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="font-ticket text-xl font-bold">Purchasing</h1>
        </div>
        <div className="h-40 rounded-2xl bg-ink/5 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-ticket text-xl font-bold">Purchasing</h1>
          <p className="text-sm text-ink/50">Every purchase the place makes — ingredients to a broom</p>
        </div>
        <button
          onClick={() => setCreatingPurchase(true)}
          className="flex items-center gap-1.5 rounded-xl bg-ember text-white px-3.5 py-2.5 text-sm font-semibold hover:brightness-95"
        >
          <Plus size={16} /> New purchase
        </button>
      </div>

      {/* Account balances — this is what a purchase's payment actually draws from */}
      <Card className="p-3.5 mb-4 flex gap-4 flex-wrap">
        {paymentMethods.map((m) => (
          <div key={m.key} className="text-xs">
            <span className="text-ink/40">{m.label}: </span>
            <span className="font-ticket font-bold">Rs. {balances[m.key] ?? 0}</span>
          </div>
        ))}
      </Card>

      {/* Suppliers */}
      <div className="flex items-center justify-between mb-2">
        <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">Suppliers</div>
        <button
          onClick={() => setAddingSupplier(true)}
          className="flex items-center gap-1 text-xs font-semibold text-ember bg-ember/10 rounded-full px-3 py-1.5"
        >
          <Plus size={13} /> Add supplier
        </button>
      </div>

      {addingSupplier && (
        <Card className="p-4 mb-3 flex gap-2">
          <input
            autoFocus
            value={newSupplierName}
            onChange={(e) => setNewSupplierName(e.target.value)}
            placeholder="Supplier name"
            className="flex-1 text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
          />
          <button
            onClick={() => { if (newSupplierName.trim()) { addSupplier(newSupplierName.trim()); setNewSupplierName(''); setAddingSupplier(false) } }}
            className="text-sm font-semibold text-ember"
          >
            Add
          </button>
        </Card>
      )}

      {removeError && (
        <div className="mb-3 text-xs font-semibold text-status-cleaning bg-status-cleaning-bg rounded-xl px-3 py-2">{removeError}</div>
      )}

      <div className="space-y-2 mb-6">
        {suppliers.map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold text-sm">{s.name}</div>
              <div className="flex items-center gap-2">
                <div className={`font-ticket text-sm font-bold ${s.outstandingBalance > 0 ? 'text-status-cleaning' : 'text-status-available'}`}>
                  {s.outstandingBalance > 0 ? `Rs. ${s.outstandingBalance} due` : 'Settled'}
                </div>
                <button onClick={() => handleRemoveSupplier(s.id)} className="text-ink/25 hover:text-status-cleaning" title="Remove supplier">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {s.phone && (
              <div className="flex items-center gap-1 text-xs text-ink/40 mb-2">
                <Phone size={11} /> {s.phone}
              </div>
            )}
            {s.outstandingBalance > 0 && (
              <button
                onClick={() => setPayingSupplier(s.id)}
                className="text-xs font-semibold rounded-full border border-ink/10 px-3 py-1.5 hover:bg-ink/5"
              >
                Record payment
              </button>
            )}
          </Card>
        ))}
      </div>

      {/* Purchase history */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">Purchase history</div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-[10px] font-semibold text-ink/40 block">From</label>
            <input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} className="text-xs border border-ink/10 rounded-lg px-2 py-1 outline-none focus:border-ember" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-ink/40 block">To</label>
            <input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} className="text-xs border border-ink/10 rounded-lg px-2 py-1 outline-none focus:border-ember" />
          </div>
          {purchasesInRange.length > 0 && (
            <button
              onClick={() => downloadPurchasesCsv(historyFrom, historyTo, purchasesInRange, suppliers, paymentMethods)}
              className="flex items-center gap-1 text-xs font-semibold text-ember bg-ember/10 rounded-full px-3 py-1.5"
            >
              <Download size={13} /> Export CSV
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {purchasesInRange.length === 0 && (
          <p className="text-sm text-ink/40 text-center py-8">No purchases in this range.</p>
        )}
        {[...purchasesInRange].reverse().map((p) => {
          const supplier = suppliers.find((s) => s.id === p.supplierId)
          const total = p.lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0)
          const paidEntries = Object.entries(p.paidAmounts).filter(([, amt]) => amt > 0)
          const paid = paidEntries.reduce((s, [, a]) => s + a, 0)
          return (
            <Card key={p.id} className="p-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold rounded-full bg-ink/5 px-2 py-0.5">{CATEGORY_LABELS[p.category]}</span>
                  <span className="text-xs text-ink/40">{supplier?.name ?? 'One-off'}</span>
                </div>
                <span className="font-ticket font-bold text-sm">Rs. {total}</span>
              </div>
              <div className="text-xs text-ink/50 mb-2">
                {p.lines.map((l) => `${l.quantity}× ${l.description}`).join(', ')}
              </div>
              {paidEntries.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {paidEntries.map(([key, amt]) => {
                    const label = paymentMethods.find((m) => m.key === key)?.label ?? key
                    return (
                      <span key={key} className="text-[11px] font-semibold bg-ink/[0.04] rounded-full px-2 py-0.5">
                        {label}: Rs. {amt}
                      </span>
                    )
                  })}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <span className={p.status === 'received' ? 'text-status-available font-semibold' : 'text-status-occupied font-semibold'}>
                    {p.status === 'received' ? 'Received' : 'Ordered'}
                  </span>
                  {paid < total && <span className="text-status-cleaning font-semibold">Rs. {total - paid} unpaid</span>}
                </div>
                {p.status !== 'received' && (
                  <button onClick={() => markReceived(p.id)} className="flex items-center gap-1 text-ember font-semibold text-xs">
                    <PackageCheck size={13} /> Mark received
                  </button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {creatingPurchase && (
        <NewPurchaseModal
          onClose={() => setCreatingPurchase(false)}
          suppliers={suppliers}
          inventoryItems={inventoryItems}
          paymentMethods={paymentMethods}
          addInventoryItem={addInventoryItem}
          addSupplier={addSupplier}
          onSubmit={(input) => createPurchase(input)}
        />
      )}

      {payingSupplier && (
        <PaySupplierModal
          supplier={suppliers.find((s) => s.id === payingSupplier)!}
          paymentMethods={paymentMethods}
          onClose={() => setPayingSupplier(null)}
          onSubmit={(method, amount) => { recordSupplierPayment(payingSupplier, method, amount); setPayingSupplier(null) }}
        />
      )}
    </div>
  )
}

function NewPurchaseModal({
  onClose,
  onSubmit,
  suppliers,
  inventoryItems,
  paymentMethods,
  addInventoryItem,
  addSupplier,
}: {
  onClose: () => void
  onSubmit: (input: { supplierId?: string; category: PurchaseCategory; lines: PurchaseLine[]; received: boolean; paidAmounts: Record<string, number> }) => void
  suppliers: { id: string; name: string }[]
  inventoryItems: { id: string; name: string }[]
  paymentMethods: { key: string; label: string }[]
  addInventoryItem: (name: string, unit: string, minStock: number) => Promise<string>
  addSupplier: (name: string, phone?: string) => Promise<string>
}) {
  const [supplierId, setSupplierId] = useState<string>('')
  const [newSupplierDraft, setNewSupplierDraft] = useState<string | null>(null)
  const [category, setCategory] = useState<PurchaseCategory>('ingredients')
  const [lines, setLines] = useState<PurchaseLine[]>([
    { id: `l-${Date.now()}`, kind: 'inventory', inventoryItemId: inventoryItems[0]?.id, description: inventoryItems[0]?.name ?? '', quantity: 1, unitCost: 0 },
  ])
  const [received, setReceived] = useState(true)
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [newItemDraft, setNewItemDraft] = useState<{ lineId: string; name: string; unit: string } | null>(null)

  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
  const paid = paymentMethods.reduce((s, m) => s + (amounts[m.key] || 0), 0)
  const remaining = total - paid
  const canSubmit = lines.length > 0 && total > 0 && (supplierId ? true : remaining <= 0)

  function addLine() {
    setLines((cur) => [...cur, { id: `l-${Date.now()}`, kind: 'inventory', inventoryItemId: inventoryItems[0]?.id, description: inventoryItems[0]?.name ?? '', quantity: 1, unitCost: 0 }])
  }
  function updateLine(id: string, patch: Partial<PurchaseLine>) {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  function removeLine(id: string) {
    setLines((cur) => cur.filter((l) => l.id !== id))
  }
  function setAmount(key: string, value: number) {
    setAmounts((cur) => ({ ...cur, [key]: Math.max(0, value) }))
  }
  function payFullWith(key: string) {
    const next: Record<string, number> = {}
    paymentMethods.forEach((m) => (next[m.key] = 0))
    next[key] = total
    setAmounts(next)
  }
  async function confirmNewItem() {
    if (!newItemDraft || !newItemDraft.name.trim()) return
    const id = await addInventoryItem(newItemDraft.name.trim(), newItemDraft.unit, 10)
    updateLine(newItemDraft.lineId, { inventoryItemId: id, description: newItemDraft.name.trim() })
    setNewItemDraft(null)
  }

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit({ supplierId: supplierId || undefined, category, lines, received, paidAmounts: amounts })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-lg md:rounded-3xl rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-ticket text-lg font-bold">New purchase</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Supplier</label>
            {newSupplierDraft !== null ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newSupplierDraft}
                  onChange={(e) => setNewSupplierDraft(e.target.value)}
                  placeholder="New supplier name"
                  className="flex-1 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
                />
                <button
                  onClick={async () => {
                    if (!newSupplierDraft.trim()) return
                    const id = await addSupplier(newSupplierDraft.trim())
                    setSupplierId(id)
                    setNewSupplierDraft(null)
                  }}
                  className="text-xs font-semibold text-ember px-2"
                >
                  Save
                </button>
                <button onClick={() => setNewSupplierDraft(null)} className="text-ink/40 px-1"><X size={16} /></button>
              </div>
            ) : (
              <select
                value={supplierId}
                onChange={(e) => (e.target.value === NEW_SUPPLIER_SENTINEL ? setNewSupplierDraft('') : setSupplierId(e.target.value))}
                className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember bg-surface"
              >
                <option value="">No supplier (one-off)</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value={NEW_SUPPLIER_SENTINEL}>+ Add new supplier…</option>
              </select>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PurchaseCategory)}
              className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember bg-surface"
            >
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Items</label>
        <div className="space-y-2 mb-2">
          {lines.map((line) => (
            <div key={line.id}>
              <div className="flex items-center gap-1.5 mb-1">
                <button
                  onClick={() => updateLine(line.id, { kind: 'inventory', inventoryItemId: inventoryItems[0]?.id, description: inventoryItems[0]?.name ?? '' })}
                  className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${line.kind === 'inventory' ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/50'}`}
                >
                  Stock item
                </button>
                <button
                  onClick={() => updateLine(line.id, { kind: 'expense', inventoryItemId: undefined, description: '' })}
                  className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${line.kind === 'expense' ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/50'}`}
                >
                  One-off expense
                </button>
              </div>
              <div className="flex items-center gap-2">
                {line.kind === 'inventory' ? (
                  <select
                    value={line.inventoryItemId ?? ''}
                    onChange={(e) => {
                      if (e.target.value === NEW_ITEM_SENTINEL) {
                        setNewItemDraft({ lineId: line.id, name: '', unit: 'kg' })
                      } else {
                        const item = inventoryItems.find((it) => it.id === e.target.value)
                        updateLine(line.id, { inventoryItemId: item?.id, description: item?.name ?? '' })
                      }
                    }}
                    className="flex-1 text-xs border border-ink/10 rounded-lg px-2 py-2 outline-none focus:border-ember bg-surface"
                  >
                    {inventoryItems.map((it) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                    <option value={NEW_ITEM_SENTINEL}>+ Add new item…</option>
                  </select>
                ) : (
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(line.id, { description: e.target.value })}
                    placeholder="e.g. Broom, gas cylinder refill, repair"
                    className="flex-1 text-xs border border-ink/10 rounded-lg px-2 py-2 outline-none focus:border-ember"
                  />
                )}
                <input
                  type="number"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) || 0 })}
                  placeholder="Qty"
                  className="w-14 text-xs font-ticket border border-ink/10 rounded-lg px-2 py-2 outline-none focus:border-ember"
                />
                <input
                  type="number"
                  value={line.unitCost}
                  onChange={(e) => updateLine(line.id, { unitCost: Number(e.target.value) || 0 })}
                  placeholder="Rs."
                  className="w-20 text-xs font-ticket border border-ink/10 rounded-lg px-2 py-2 outline-none focus:border-ember"
                />
                <button onClick={() => removeLine(line.id)} className="text-ink/30 hover:text-status-cleaning shrink-0">
                  <X size={15} />
                </button>
              </div>

              {newItemDraft?.lineId === line.id && (
                <div className="mt-1.5 flex items-center gap-1.5 bg-ink/[0.03] rounded-lg p-2">
                  <input
                    autoFocus
                    value={newItemDraft.name}
                    onChange={(e) => setNewItemDraft({ ...newItemDraft, name: e.target.value })}
                    placeholder="New item name"
                    className="flex-1 text-xs border border-ink/10 rounded-lg px-2 py-1.5 outline-none focus:border-ember"
                  />
                  <select
                    value={newItemDraft.unit}
                    onChange={(e) => setNewItemDraft({ ...newItemDraft, unit: e.target.value })}
                    className="text-xs border border-ink/10 rounded-lg px-1.5 py-1.5 outline-none bg-surface"
                  >
                    <option value="kg">kg</option>
                    <option value="ltr">ltr</option>
                    <option value="pcs">pcs</option>
                    <option value="g">g</option>
                  </select>
                  <button onClick={confirmNewItem} className="text-xs font-semibold text-ember px-1">Add</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button onClick={addLine} className="text-xs font-semibold text-ember mb-4 flex items-center gap-1">
          <Plus size={13} /> Add line
        </button>

        <label className="flex items-center gap-2 text-sm font-medium mb-4">
          <input type="checkbox" checked={received} onChange={(e) => setReceived(e.target.checked)} className="accent-ember" />
          Goods already received — update stock now
        </label>

        {total > 0 && (
          <div className="border-t border-ink/5 pt-3 mb-3">
            <div className="flex justify-between text-sm font-semibold mb-3">
              <span>Total</span>
              <span className="font-ticket">Rs. {total}</span>
            </div>
            <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Paid now</label>
            <div className="space-y-2 mb-2">
              {paymentMethods.map((m) => (
                <div key={m.key} className="flex items-center gap-2">
                  <span className="text-xs font-medium w-16 shrink-0 truncate">{m.label}</span>
                  <input
                    type="number"
                    value={amounts[m.key] || ''}
                    placeholder="0"
                    onChange={(e) => setAmount(m.key, Number(e.target.value))}
                    className="flex-1 text-xs border border-ink/10 rounded-lg px-2 py-1.5 outline-none focus:border-ember font-ticket"
                  />
                  <button onClick={() => payFullWith(m.key)} className="text-[11px] font-semibold text-ember shrink-0">Full</button>
                </div>
              ))}
            </div>
            <div className={`text-xs font-semibold ${remaining <= 0 ? 'text-status-available' : 'text-status-occupied'}`}>
              {remaining <= 0 ? 'Fully paid' : supplierId ? `Rs. ${remaining} added to supplier's due` : `Rs. ${remaining} unpaid — pick a supplier to buy on credit, or pay in full`}
            </div>
          </div>
        )}

        <Button className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
          Record purchase
        </Button>
      </div>
    </div>
  )
}

function PaySupplierModal({
  supplier,
  paymentMethods,
  onClose,
  onSubmit,
}: {
  supplier: { id: string; name: string; outstandingBalance: number }
  paymentMethods: { key: string; label: string }[]
  onClose: () => void
  onSubmit: (method: string, amount: number) => void
}) {
  const [method, setMethod] = useState(paymentMethods[0]?.key ?? '')
  const [amount, setAmount] = useState(String(supplier.outstandingBalance))

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-ticket text-lg font-bold flex items-center gap-2"><Receipt size={17} /> Pay {supplier.name}</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>
        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Pay from</label>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full mb-4 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember bg-surface">
          {paymentMethods.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Amount (Rs.)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full mb-4 text-lg font-ticket font-bold border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
        />
        <Button className="w-full" disabled={!method || !Number(amount)} onClick={() => onSubmit(method, Number(amount) || 0)}>
          Save payment
        </Button>
      </div>
    </div>
  )
}

function downloadPurchasesCsv(
  from: string,
  to: string,
  purchases: { id: string; supplierId?: string; category: string; status: string; createdAt: string; lines: PurchaseLine[]; paidAmounts: Record<string, number> }[],
  suppliers: { id: string; name: string }[],
  paymentMethods: { key: string; label: string }[]
) {
  const header = ['Date', 'Supplier', 'Category', 'Status', 'Items', 'Total', ...paymentMethods.map((m) => m.label)]
  const rows = purchases.map((p) => {
    const supplier = suppliers.find((s) => s.id === p.supplierId)?.name ?? 'One-off'
    const total = p.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0)
    const items = p.lines.map((l) => `${l.quantity}x ${l.description}`).join('; ')
    const methodAmounts = paymentMethods.map((m) => p.paidAmounts[m.key] || 0)
    return [
      new Date(p.createdAt).toLocaleString(),
      supplier,
      p.category,
      p.status,
      `"${items.replace(/"/g, '""')}"`,
      total,
      ...methodAmounts,
    ].join(',')
  })
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `purchases_${from}_to_${to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
