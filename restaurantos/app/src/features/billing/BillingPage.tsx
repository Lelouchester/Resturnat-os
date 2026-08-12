import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Printer, Share2, Search, UserPlus, X, Merge } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Card } from '../../shared/ui/Card'
import { Button } from '../../shared/ui/Button'
import { ReceiptView } from './ReceiptView'
import type { BillLine } from './types'
import { useSettingsStore } from '../settings/settingsStore'
import { useOrdersStore } from '../orders/ordersStore'
import { useTablesStore } from '../tables/tablesStore'
import { useCustomersStore } from '../customers/customersStore'
import type { LiveOrder } from '../orders/types'

function ReviewQrCard({ link, onClose }: { link: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-surface border border-ink/10 rounded-2xl shadow-xl p-4 flex items-center gap-3 print:hidden">
      <div className="bg-white p-1.5 rounded-xl shrink-0">
        <QRCodeSVG value={link} size={64} />
      </div>
      <div className="pr-2">
        <div className="text-sm font-semibold">Enjoyed your visit?</div>
        <div className="text-xs text-ink/50">Scan to leave us a review</div>
      </div>
      <button onClick={onClose} className="text-ink/30 hover:text-ink shrink-0"><X size={16} /></button>
    </div>
  )
}

export function BillingPage() {
  const allPaymentMethods = useSettingsStore((s) => s.paymentMethods)
  const paymentMethods = useMemo(() => allPaymentMethods.filter((m) => !m.isInternal), [allPaymentMethods])
  const customers = useCustomersStore((s) => s.customers)
  const initCustomers = useCustomersStore((s) => s.init)
  const addCustomer = useCustomersStore((s) => s.addCustomer)
  const applyPayment = useCustomersStore((s) => s.applyPayment)

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
    initCustomers()
  }, [initOrders, initTables, initCustomers])

  // Anything open or already being closed out, and not already folded into
  // another table's bill — that's the billable list across the top.
  const billableOrders = useMemo(
    () => orders.filter((o) => (o.status === 'open' || o.status === 'billing') && !o.mergedIntoOrderId),
    [orders]
  )

  const [searchParams] = useSearchParams()
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  useEffect(() => {
    if (activeTableId) return
    const fromUrl = searchParams.get('table')
    if (fromUrl && billableOrders.some((o) => o.tableId === fromUrl)) {
      setActiveTableId(fromUrl)
    } else if (billableOrders.length > 0) {
      setActiveTableId(billableOrders[0].tableId)
    }
  }, [activeTableId, billableOrders, searchParams])

  const order = billableOrders.find((o) => o.tableId === activeTableId)

  // The customer may already be attached to this order from Orders or the
  // Floor plan (via CustomerAssignField) — without this, Billing would show
  // "no customer" and silently skip updating their spend/loyalty even
  // though the link was already made earlier.
  useEffect(() => {
    setCustomerId(order?.customerId ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.customerId])
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

  const defaultTaxPct = useSettingsStore((s) => s.defaultTaxPct)
  const defaultServiceChargePct = useSettingsStore((s) => s.defaultServiceChargePct)
  const googleReviewLink = useSettingsStore((s) => s.googleReviewLink)

  const [discountMode, setDiscountMode] = useState<'pct' | 'amount'>('pct')
  const [discountPct, setDiscountPct] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [serviceChargePct, setServiceChargePct] = useState(defaultServiceChargePct)
  const [taxPct, setTaxPct] = useState(defaultTaxPct)
  const [tip, setTip] = useState(0)
  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [splitGuests, setSplitGuests] = useState(1)
  const [toast, setToast] = useState<string | null>(null)
  const [showReviewQr, setShowReviewQr] = useState(false)
  // "Complete payment" immediately auto-advances the screen to the next
  // billable table — which means the live `order`/`discount`/etc. this
  // component was just showing no longer describe the bill that was just
  // paid. Without this snapshot, hitting Print right after completing
  // payment prints whatever the *next* table happens to show (or nothing,
  // if there's no next table) instead of the receipt just closed out —
  // this is why discounts appeared to silently vanish from printed bills.
  const [lastReceipt, setLastReceipt] = useState<{
    tableLabel: string
    customerName: string
    lines: BillLine[]
    subtotal: number
    discount: number
    discountPct?: number
    serviceCharge: number
    tax: number
    tip: number
    total: number
  } | null>(null)

  // Customer attachment — entirely optional, this is what turns a one-off
  // bill into a visit that builds someone's loyalty history.
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const subtotal = useMemo(
    () => effectiveLines.reduce((s, l) => s + (l.isComplimentary ? 0 : l.unitPrice * l.quantity), 0),
    [effectiveLines]
  )
  // Some categories (alcohol, etc.) are marked never-discounted in Menu —
  // the discount only ever applies against what's actually eligible.
  const discountEligibleSubtotal = useMemo(
    () => effectiveLines.reduce((s, l) => s + (l.isComplimentary || l.excludeFromDiscount ? 0 : l.unitPrice * l.quantity), 0),
    [effectiveLines]
  )
  const hasExemptItems = effectiveLines.some((l) => l.excludeFromDiscount)
  const discount =
    Math.max(0, Math.min(
      discountMode === 'pct' ? Math.round(discountEligibleSubtotal * (discountPct / 100)) : discountAmount,
      discountEligibleSubtotal
    ))
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

  // Typing just updates that one field — the "fill the rest into the other
  // method" only happens once you leave the field (blur/Tab), and only when
  // there are exactly two payment methods configured. With three or more,
  // there's no way to know which one you meant the remainder to go to, so
  // it's left for you to type in — guessing here previously caused money to
  // get silently recorded against a method that was never actually paid.
  function setAmount(key: string, value: number) {
    setAmounts((cur) => ({ ...cur, [key]: Math.max(0, value) }))
  }
  function handleAmountBlur(key: string) {
    if (paymentMethods.length !== 2) return
    setAmounts((cur) => {
      const stillOwed = total - paymentMethods.reduce((s, m) => s + (cur[m.key] || 0), 0)
      if (stillOwed > 0) {
        const autoTarget = paymentMethods.find((m) => m.key !== key && !cur[m.key])
        if (autoTarget) return { ...cur, [autoTarget.key]: stillOwed }
      }
      return cur
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
    setDiscountPct(0)
    setDiscountAmount(0)
    setDiscountMode('pct')
    setServiceChargePct(defaultServiceChargePct)
    setTaxPct(defaultTaxPct)
    beginBilling(tableId)
  }

  // Settings load asynchronously — if Billing mounts before that finishes,
  // the fields above start on a placeholder default. This catches the
  // moment the real saved values arrive and syncs them in.
  useEffect(() => {
    setServiceChargePct(defaultServiceChargePct)
    setTaxPct(defaultTaxPct)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultServiceChargePct, defaultTaxPct])

  async function quickAddWalkIn() {
    const id = await addCustomer(customerSearch.trim() || undefined, undefined)
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

    // Snapshot the bill exactly as it's being paid, before anything about
    // the screen changes — this is what "Print" prints from once payment
    // completes, regardless of which table becomes active next.
    setLastReceipt({
      tableLabel: order.tableLabel,
      customerName: selectedCustomer?.name ?? 'Walk-in',
      lines: effectiveLines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.isComplimentary ? 0 : l.unitPrice, excludeFromDiscount: l.excludeFromDiscount, isComplimentary: l.isComplimentary })),
      subtotal,
      discount,
      discountPct: discountMode === 'pct' && discountPct > 0 ? discountPct : undefined,
      serviceCharge,
      tax,
      tip,
      total,
    })

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
      // Lifetime spend counts the whole bill, not just what was physically
      // collected — a due is still money they've spent, just not paid yet.
      await applyPayment(customerId, total, Math.max(0, remaining))
    }

    setToast(remaining > 0 ? 'Marked as due' : remaining < 0 ? 'Payment completed — change due' : 'Payment completed')
    setTimeout(() => setToast(null), 2500)
    if (googleReviewLink) {
      setShowReviewQr(true)
      setTimeout(() => setShowReviewQr(false), 20000)
    }

    // Move on to the next table waiting to be closed out, instead of
    // sitting on a bill that's already settled.
    const paidTableId = order.tableId
    const next = billableOrders.find((o) => o.tableId !== paidTableId && !mergedInOrders.some((m) => m.id === o.id))
    setActiveTableId(next ? next.tableId : null)
    setAmounts({})
    setSplitGuests(1)
    setCustomerId(null)
    // Without this, a discount (or a changed tax/service %) applied to the
    // table just paid would silently carry over and apply to whichever
    // table gets auto-advanced to next — a real risk of over-discounting
    // someone else's bill by accident.
    setDiscountPct(0)
    setDiscountAmount(0)
    setDiscountMode('pct')
    setServiceChargePct(defaultServiceChargePct)
    setTaxPct(defaultTaxPct)
  }

  if (ordersLoading) {
    return <div className="p-6 max-w-4xl mx-auto pt-10 h-64 rounded-2xl bg-ink/5 animate-pulse" />
  }

  if (!order) {
    return (
      <>
        <div className="p-6 max-w-sm mx-auto text-center pt-20 print:hidden">
          <div className="font-ticket text-lg font-bold mb-2">No tables to bill</div>
          <p className="text-sm text-ink/50 mb-5">Once a table has an order, it'll show up here to close out.</p>
          {lastReceipt && (
            <Button variant="secondary" className="mx-auto flex items-center justify-center gap-1.5" onClick={() => window.print()}>
              <Printer size={15} /> Print last receipt ({lastReceipt.tableLabel})
            </Button>
          )}
        </div>
        {lastReceipt && (
          <ReceiptView
            tableLabel={lastReceipt.tableLabel}
            customerName={lastReceipt.customerName}
            lines={lastReceipt.lines}
            subtotal={lastReceipt.subtotal}
            discount={lastReceipt.discount}
            discountPct={lastReceipt.discountPct}
            serviceCharge={lastReceipt.serviceCharge}
            tax={lastReceipt.tax}
            tip={lastReceipt.tip}
            total={lastReceipt.total}
          />
        )}
        {showReviewQr && googleReviewLink && <ReviewQrCard link={googleReviewLink} onClose={() => setShowReviewQr(false)} />}
      </>
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
            {(() => {
              const exempt = effectiveLines.filter((l) => l.excludeFromDiscount)
              const discounted = effectiveLines.filter((l) => !l.excludeFromDiscount)
              const showGroups = discount > 0 && exempt.length > 0 && discounted.length > 0

              const row = (l: (typeof effectiveLines)[number]) => (
                <div key={l.id} className="flex justify-between text-sm">
                  <span>
                    {l.quantity}× {l.name}
                    {l.isComplimentary && <span className="ml-1.5 text-[10px] font-bold text-ember align-middle">COMP</span>}
                  </span>
                  <span className="font-ticket font-semibold">{l.isComplimentary ? 0 : l.unitPrice * l.quantity}</span>
                </div>
              )

              if (!showGroups) return effectiveLines.map(row)

              return (
                <>
                  <div className="text-[10px] font-bold uppercase text-ink/30">Discounted items</div>
                  {discounted.map(row)}
                  <div className="text-[10px] font-bold uppercase text-ink/30 pt-1">Not discounted</div>
                  {exempt.map(row)}
                </>
              )
            })()}
            {effectiveLines.length === 0 && <p className="text-xs text-ink/40">Nothing sent to the kitchen for this table yet.</p>}
          </div>

          <div className="border-t border-ink/5 pt-3 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-ink/60">Discount</span>
                <div className="flex items-center gap-2">
                  <div className="flex bg-ink/5 rounded-lg p-0.5">
                    <button
                      onClick={() => setDiscountMode('pct')}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-md ${discountMode === 'pct' ? 'bg-surface shadow-sm' : 'text-ink/40'}`}
                    >
                      %
                    </button>
                    <button
                      onClick={() => setDiscountMode('amount')}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-md ${discountMode === 'amount' ? 'bg-surface shadow-sm' : 'text-ink/40'}`}
                    >
                      Rs.
                    </button>
                  </div>
                  {discountMode === 'pct' ? (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discountPct || ''}
                      placeholder="0"
                      onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                      className="w-16 text-sm text-right border border-ink/10 rounded-lg px-2 py-1.5 outline-none focus:border-ember font-ticket"
                    />
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={discountAmount || ''}
                      placeholder="0"
                      onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                      className="w-20 text-sm text-right border border-ink/10 rounded-lg px-2 py-1.5 outline-none focus:border-ember font-ticket"
                    />
                  )}
                </div>
              </div>
              {hasExemptItems && (
                <p className="text-[11px] text-ink/40">
                  Some items here are marked never-discounted in Menu, so they're left out — this discount only applies against Rs. {discountEligibleSubtotal} of eligible items.
                </p>
              )}
            </div>
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

            {/* Rows generated from Settings' payment method list — add one there, it shows up here automatically. With exactly two methods, typing an amount auto-fills the rest into the other one; with three or more, the remaining amount just shows above and you type it in yourself. */}
            <div className="space-y-2 mb-3">
              {paymentMethods.map((m) => (
                <div key={m.key} className="flex items-center gap-2">
                  <span className="text-sm font-medium w-20 shrink-0 truncate">{m.label}</span>
                  <input
                    type="number"
                    value={amounts[m.key] || ''}
                    placeholder="0"
                    onChange={(e) => setAmount(m.key, Number(e.target.value))}
                    onBlur={() => handleAmountBlur(m.key)}
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
            disabled={remaining > 0 && !customerId}
            onClick={handleCompletePayment}
          >
            {remaining > 0 ? `Mark Rs. ${remaining} as due & close` : 'Complete payment'}
          </Button>
          {remaining > 0 && !customerId && (
            <p className="text-xs text-status-cleaning text-center mt-1.5">Attach a customer above to mark the rest as due.</p>
          )}
        </Card>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink text-paper px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg">
          {toast}
        </div>
      )}
      {showReviewQr && googleReviewLink && <ReviewQrCard link={googleReviewLink} onClose={() => setShowReviewQr(false)} />}
    </div>
    <ReceiptView
      tableLabel={order.tableLabel}
      customerName={selectedCustomer?.name ?? 'Walk-in'}
      lines={effectiveLines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.isComplimentary ? 0 : l.unitPrice, excludeFromDiscount: l.excludeFromDiscount, isComplimentary: l.isComplimentary }))}
      subtotal={subtotal}
      discount={discount}
      discountPct={discountMode === 'pct' && discountPct > 0 ? discountPct : undefined}
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
          min="0"
          value={value || ''}
          placeholder="0"
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
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
