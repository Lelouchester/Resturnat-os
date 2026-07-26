import { useEffect, useMemo, useState } from 'react'
import { Printer, Share2, Search, UserPlus, X, Merge } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { Button } from '../../shared/ui/Button'
import { ReceiptView } from './ReceiptView'
import { useSettingsStore } from '../settings/settingsStore'
import { useOrdersStore } from '../orders/ordersStore'
import { useTablesStore } from '../tables/tablesStore'
import { useCustomersStore } from '../customers/customersStore'
import type { LiveOrder } from '../orders/types'

export function BillingPage() {
  const paymentMethods = useSettingsStore((s) => s.paymentMethods)
  const customers = useCustomersStore((s) => s.customers)
  const addCustomer = useCustomersStore((s) => s.addCustomer)
  const recordVisit = useCustomersStore((s) => s.recordVisit)

  const orders = useOrdersStore((s) => s.orders)
  const ordersLoading = useOrdersStore((s) => s.loading)
  const initOrders = useOrdersStore((s) => s.init)
  const beginBilling = useOrdersStore((s) => s.beginBilling)
  const mergeOrders = useOrdersStore((s) => s.mergeOrders)
  const unmergeOrder = useOrdersStore((s) => s.unmergeOrder)
  const completePayment = useOrdersStore((s) => s.completePayment)
  const initTables = useTablesStore((s) => s.init)

  useEffect(() => {
    initOrders()
    initTables()
  }, [initOrders, initTables])

  // Anything open or already being closed out, and not already folded into
  // another table's bill — that's the billable list across the top.
  const billableOrders = useMemo(
    () => orders.filter((o) => (o.status === 'open' || o.status === 'billing') && !o.mergedIntoOrderId),
    [orders]
  )

  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  useEffect(() => {
    if (!activeTableId && billableOrders.length > 0) setActiveTableId(billableOrders[0].tableId)
  }, [activeTableId, billableOrders])

  const order = billableOrders.find((o) => o.tableId === activeTableId)
  // Other tables whose bills have been merged into this one (via the Floor
  // plan's Merge action, or right here) — their items fold into the total.
  const mergedInOrders = useMemo(
    () => (order ? orders.filter((o) => o.mergedIntoOrderId === order.id) : []),
    [orders, order]
  )
  const effectiveLines = useMemo(() => {
    if (!order) return []
    return [...order.items, ...mergedInOrders.flatMap((o) => o.items)].filter((i) => i.status !== 'void')
  }, [order, mergedInOrders])

  const [discountPct, setDiscountPct] = useState(0)
  const [serviceChargePct, setServiceChargePct] = useState(10)
  const [taxPct, setTaxPct] = useState(13)
  const [tip, setTip] = useState(0)
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [splitGuests, setSplitGuests] = useState(1)
  const [toast, setToast] = useState<string | null>(null)

  // Customer attachment — entirely optional, this is what turns a one-off
  // bill into a visit that builds someone's loyalty history.
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const subtotal = useMemo(
    () => effectiveLines.reduce((s, l) => s + (l.isComplimentary ? 0 : l.unitPrice * l.quantity), 0),
    [effectiveLines]
  )
  const discount = Math.round(subtotal * (discountPct / 100))
  const afterDiscount = subtotal - discount
  const serviceCharge = Math.round(afterDiscount * (serviceChargePct / 100))
  const tax = Math.round(afterDiscount * (taxPct / 100))
  const total = afterDiscount + serviceCharge + tax + tip

  const splitShares = useMemo(() => {
    if (splitGuests <= 1) return []
    const base = Math.floor(total / splitGuests)
    const shares = Array(splitGuests).fill(base)
    shares[shares.length - 1] += total - base * splitGuests // remainder goes to the last guest
    return shares
  }, [total, splitGuests])

  const paid = paymentMethods.reduce((s, m) => s + (amounts[m.key] || 0), 0)
  const remaining = total - paid // can go negative (change due)

  // Auto-balance: typing an amount into one method fills whatever's left
  // into the next empty method automatically, so splitting a bill across
  // two payment types doesn't need mental math.
  function setAmount(key: string, value: number) {
    setAmounts((cur) => {
      const next = { ...cur, [key]: Math.max(0, value) }
      const stillOwed = total - paymentMethods.reduce((s, m) => s + (next[m.key] || 0), 0)
      if (stillOwed > 0) {
        const autoTarget = paymentMethods.find((m) => m.key !== key && !next[m.key])
        if (autoTarget) next[autoTarget.key] = stillOwed
      }
      return next
    })
  }
  function payFullWith(key: string) {
    const next: Record<string, number> = {}
    paymentMethods.forEach((m) => (next[m.key] = 0))
    next[key] = total
    setAmounts(next)
  }

  function switchTable(tableId: string) {
    setActiveTableId(tableId)
    setAmounts({})
    setSplitGuests(1)
    setCustomerId(null)
    beginBilling(tableId)
  }

  function quickAddWalkIn() {
    const id = addCustomer(customerSearch.trim() || undefined, undefined)
    setCustomerId(id)
    setPickerOpen(false)
  }

  const matchingCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers
    const q = customerSearch.toLowerCase()
    return customers.filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q))
  }, [customers, customerSearch])
  const selectedCustomer = customers.find((c) => c.id === customerId)

  async function handleCompletePayment() {
    if (!order) return
    await completePayment({
      orderId: order.id,
      payments: paymentMethods.map((m) => ({ methodKey: m.key, amount: amounts[m.key] || 0 })),
      subtotal,
      discountAmount: discount,
      serviceCharge,
      taxAmount: tax,
      tipAmount: tip,
      total,
      splitGuestCount: splitGuests,
      customerId: customerId ?? undefined,
      mergedOrderIds: mergedInOrders.map((o) => o.id),
    })

    if (customerId) {
      const itemsSummary = effectiveLines.map((l) => `${l.quantity}x ${l.name}`).join(', ')
      recordVisit(customerId, paid, itemsSummary, Math.max(0, remaining))
    }

    setToast(remaining > 0 ? 'Marked as due' : remaining < 0 ? 'Payment completed — change due' : 'Payment completed')
    setTimeout(() => setToast(null), 2500)

    // Move on to the next table waiting to be closed out, instead of
    // sitting on a bill that's already settled.
    const paidTableId = order.tableId
    const next = billableOrders.find((o) => o.tableId !== paidTableId && !mergedInOrders.some((m) => m.id === o.id))
    setActiveTableId(next ? next.tableId : null)
    setAmounts({})
    setSplitGuests(1)
    setCustomerId(null)
  }

  if (ordersLoading) {
    return <div className="p-6 max-w-4xl mx-auto pt-10 h-64 rounded-2xl bg-ink/5 animate-pulse" />
  }

  if (!order) {
    return (
      <div className="p-6 max-w-sm mx-auto text-center pt-20">
        <div className="font-ticket text-lg font-bold mb-2">No tables to bill</div>
        <p className="text-sm text-ink/50">Once a table has an order, it'll show up here to close out.</p>
      </div>
    )
  }

  return (
    <>
    <div className="p-4 md:p-6 max-w-4xl mx-auto print:hidden">
      <div className="mb-4">
        <h1 className="font-ticket text-xl font-bold">Billing</h1>
        <p className="text-sm text-ink/50">Close out a table's order</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-4">
        {billableOrders.map((o) => (
          <button
            key={o.tableId}
            onClick={() => switchTable(o.tableId)}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-left border transition-colors ${
              activeTableId === o.tableId ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink border-ink/10'
            }`}
          >
            <div className="font-ticket text-sm font-bold leading-none">{o.tableLabel}</div>
            <div className={`text-[11px] mt-0.5 ${activeTableId === o.tableId ? 'text-paper/60' : 'text-ink/40'}`}>
              {o.items.filter((i) => i.status !== 'void').length} item{o.items.length === 1 ? '' : 's'}
            </div>
          </button>
        ))}
      </div>

      {/* Customer attachment */}
      <Card className="p-3 mb-4">
        {selectedCustomer ? (
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-semibold">{selectedCustomer.name || 'Walk-in customer'}</span>
              {selectedCustomer.phone && <span className="text-ink/40 ml-1.5">{selectedCustomer.phone}</span>}
            </div>
            <button onClick={() => setCustomerId(null)} className="text-ink/40 hover:text-status-cleaning"><X size={16} /></button>
          </div>
        ) : !pickerOpen ? (
          <button onClick={() => setPickerOpen(true)} className="flex items-center gap-2 text-sm text-ink/50">
            <UserPlus size={15} /> Attach a customer (optional)
          </button>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Search size={14} className="text-ink/40" />
              <input
                autoFocus
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search name or phone…"
                className="flex-1 text-sm outline-none"
              />
              <button onClick={() => setPickerOpen(false)} className="text-ink/40"><X size={15} /></button>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {matchingCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setCustomerId(c.id); setPickerOpen(false) }}
                  className="w-full text-left text-sm rounded-lg px-2 py-1.5 hover:bg-ink/5"
                >
                  {c.name || 'Walk-in customer'} {c.phone && <span className="text-ink/40">— {c.phone}</span>}
                </button>
              ))}
              <button onClick={quickAddWalkIn} className="w-full text-left text-sm rounded-lg px-2 py-1.5 text-ember font-semibold hover:bg-ink/5">
                + New customer {customerSearch.trim() && `"${customerSearch.trim()}"`}
              </button>
            </div>
          </div>
        )}
      </Card>

      <MergeTablesCard
        order={order}
        mergedInOrders={mergedInOrders}
        billableOrders={billableOrders}
        onMerge={(fromTableId) => mergeOrders(fromTableId, order.tableId)}
        onUnmerge={(orderId) => unmergeOrder(orderId)}
      />

      <div className="grid md:grid-cols-2 gap-4">
        {/* Line items + adjustments */}
        <Card className="p-4">
          <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Items</div>
          <div className="space-y-2 mb-4">
            {effectiveLines.map((l) => (
              <div key={l.id} className="flex justify-between text-sm">
                <span>
                  {l.quantity}× {l.name}
                  {l.isComplimentary && <span className="ml-1.5 text-[10px] font-bold text-ember align-middle">COMP</span>}
                </span>
                <span className="font-ticket font-semibold">{l.isComplimentary ? 0 : l.unitPrice * l.quantity}</span>
              </div>
            ))}
            {effectiveLines.length === 0 && <p className="text-xs text-ink/40">Nothing sent to the kitchen for this table yet.</p>}
          </div>

          <div className="border-t border-ink/5 pt-3 space-y-3">
            <AdjustRow label="Discount %" value={discountPct} onChange={setDiscountPct} />
            <AdjustRow label="Service charge %" value={serviceChargePct} onChange={setServiceChargePct} />
            <AdjustRow label="Tax %" value={taxPct} onChange={setTaxPct} />
            <AdjustRow label="Tip (Rs.)" value={tip} onChange={setTip} isAmount />
          </div>
        </Card>

        {/* Totals + payment */}
        <Card className="p-4 flex flex-col">
          <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Summary</div>
          <SummaryRow label="Subtotal" value={subtotal} />
          {discount > 0 && <SummaryRow label="Discount" value={-discount} />}
          {serviceCharge > 0 && <SummaryRow label="Service charge" value={serviceCharge} />}
          {tax > 0 && <SummaryRow label="Tax" value={tax} />}
          {tip > 0 && <SummaryRow label="Tip" value={tip} />}
          <div className="border-t border-ink/10 mt-2 pt-2 flex justify-between items-baseline">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-ticket text-xl font-bold">Rs. {total}</span>
          </div>

          <div className="mt-3 pt-3 border-t border-ink/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink/50">Split the bill between guests</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setSplitGuests((n) => Math.max(1, n - 1))}
                  className="h-6 w-6 rounded-full border border-ink/10 flex items-center justify-center text-xs hover:bg-ink/5"
                >
                  −
                </button>
                <span className="font-ticket text-sm font-bold w-4 text-center">{splitGuests}</span>
                <button
                  onClick={() => setSplitGuests((n) => Math.min(12, n + 1))}
                  className="h-6 w-6 rounded-full border border-ink/10 flex items-center justify-center text-xs hover:bg-ink/5"
                >
                  +
                </button>
              </div>
            </div>
            {splitGuests > 1 && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {splitShares.map((share, i) => (
                  <div key={i} className="text-xs bg-ink/[0.03] rounded-lg px-2.5 py-1.5 flex justify-between">
                    <span className="text-ink/50">Guest {i + 1}</span>
                    <span className="font-ticket font-semibold">Rs. {share}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-ink/5 flex-1">
            <div className="flex items-center justify-between mb-3">
              <span className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">Split payment</span>
              <span className={`text-xs font-ticket font-bold ${remaining === 0 ? 'text-status-available' : remaining < 0 ? 'text-status-reserved' : 'text-status-occupied'}`}>
                {remaining === 0 ? 'Fully covered' : remaining < 0 ? `Rs. ${-remaining} change due` : `Rs. ${remaining} remaining`}
              </span>
            </div>

            {/* Rows generated from Settings' payment method list — add one there, it shows up here automatically. Typing an amount auto-fills the rest into the next empty method. */}
            <div className="space-y-2 mb-3">
              {paymentMethods.map((m) => (
                <div key={m.key} className="flex items-center gap-2">
                  <span className="text-sm font-medium w-20 shrink-0 truncate">{m.label}</span>
                  <input
                    type="number"
                    value={amounts[m.key] || ''}
                    placeholder="0"
                    onChange={(e) => setAmount(m.key, Number(e.target.value))}
                    className="flex-1 min-w-0 text-sm border border-ink/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-ember font-ticket"
                  />
                  <button onClick={() => payFullWith(m.key)} className="shrink-0 text-xs font-semibold text-ember px-1.5">
                    Full
                  </button>
                </div>
              ))}
              {paymentMethods.length === 0 && (
                <p className="text-xs text-ink/40">No payment methods configured — add one in Settings.</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="secondary" className="flex-1 flex items-center justify-center gap-1.5" onClick={() => window.print()}>
              <Printer size={15} /> Print
            </Button>
            <Button
              variant="secondary"
              className="flex-1 flex items-center justify-center gap-1.5"
              onClick={() => { navigator.clipboard?.writeText(`${order.tableLabel} — Rs. ${total} total`); setToast('Receipt summary copied') ; setTimeout(() => setToast(null), 2000)}}
            >
              <Share2 size={15} /> Share
            </Button>
          </div>
          <Button
            className="mt-2"
            disabled={paid === 0}
            onClick={handleCompletePayment}
          >
            {remaining > 0 ? `Mark Rs. ${remaining} as due & close` : 'Complete payment'}
          </Button>
        </Card>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink text-paper px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg">
          {toast}
        </div>
      )}
    </div>
    <ReceiptView
      tableLabel={order.tableLabel}
      customerName={selectedCustomer?.name ?? 'Walk-in'}
      lines={effectiveLines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.isComplimentary ? 0 : l.unitPrice }))}
      subtotal={subtotal}
      discount={discount}
      serviceCharge={serviceCharge}
      tax={tax}
      tip={tip}
      total={total}
    />
    </>
  )

}

function MergeTablesCard({
  order,
  mergedInOrders,
  billableOrders,
  onMerge,
  onUnmerge,
}: {
  order: LiveOrder
  mergedInOrders: LiveOrder[]
  billableOrders: LiveOrder[]
  onMerge: (fromTableId: string) => void
  onUnmerge: (orderId: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const mergeable = billableOrders.filter((o) => o.id !== order.id && !mergedInOrders.some((m) => m.id === o.id))

  return (
    <Card className="p-3 mb-4">
      {mergedInOrders.length === 0 && !picking ? (
        <button onClick={() => setPicking(true)} className="flex items-center gap-2 text-sm text-ink/50">
          <Merge size={15} /> Merge with another table (optional)
        </button>
      ) : (
        <div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {mergedInOrders.map((o) => (
              <span key={o.id} className="flex items-center gap-1.5 text-xs font-semibold bg-status-reserved-bg text-status-reserved rounded-full px-2.5 py-1">
                {o.tableLabel}
                <button onClick={() => onUnmerge(o.id)} className="hover:text-status-cleaning"><X size={11} /></button>
              </span>
            ))}
          </div>
          {picking ? (
            mergeable.length === 0 ? (
              <p className="text-xs text-ink/40">No other billable tables to merge in.</p>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                {mergeable.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { onMerge(o.tableId); setPicking(false) }}
                    className="text-xs font-semibold rounded-full border border-ink/10 px-2.5 py-1 hover:bg-ink/5"
                  >
                    + {o.tableLabel}
                  </button>
                ))}
              </div>
            )
          ) : (
            <button onClick={() => setPicking(true)} className="text-xs font-semibold text-ember">+ Merge another table</button>
          )}
        </div>
      )}
    </Card>
  )
}

function AdjustRow({ label, value, onChange, isAmount }: { label: string; value: number; onChange: (v: number) => void; isAmount?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink/60">{label}</span>
      <div className="flex items-center gap-1">
        {isAmount && <span className="text-xs text-ink/40 font-ticket">Rs.</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 text-sm text-right border border-ink/10 rounded-lg px-2 py-1.5 outline-none focus:border-ember font-ticket"
        />
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-ink/60">{label}</span>
      <span className="font-ticket font-semibold">{value < 0 ? '-' : ''}Rs. {Math.abs(value)}</span>
    </div>
  )
}
