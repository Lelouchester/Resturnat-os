import { useEffect, useMemo, useState } from 'react'
import { PlayCircle, StopCircle, Download, History, Maximize2, X, Printer } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { Button } from '../../shared/ui/Button'
import { ReceiptView } from '../billing/ReceiptView'
import { useShiftStore } from './shiftStore'
import { useSettingsStore, type PaymentMethodConfig } from '../settings/settingsStore'
import { useAccountsStore } from '../accounts/accountsStore'
import { ArrowRightLeft, ShieldAlert, Pencil } from 'lucide-react'
import { useShiftLedger, fetchOrderHistory, type OrderHistoryRow } from './useShiftSales'
import { usePurchasingStore } from '../purchasing/purchasingStore'
import { useCustomersStore } from '../customers/customersStore'
import { useInventoryStore } from '../inventory/inventoryStore'
import { useOrdersStore } from '../orders/ordersStore'
import { useAuthStore } from '../auth/authStore'
import type { MethodBalances } from './types'

function useElapsedTime(since?: string) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (!since) return
    const tick = () => {
      const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000)
      const h = Math.floor(mins / 60)
      const m = mins % 60
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m`)
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [since])
  return label
}

// Wraps a field in quotes and escapes any internal quotes — applied to every
// field, not just the ones we expect to contain commas, so nothing can ever
// silently shift columns regardless of what ends up in item names or notes.
function csvField(value: string | number): string {
  const str = String(value)
  return `"${str.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, rows: OrderHistoryRow[]) {
  const header = ['Date/time', 'Table', 'Items', 'Subtotal', 'Discount', 'Total', 'Paid via'].map(csvField)
  const lines = rows.map((r) =>
    [
      csvField(new Date(r.closedAt).toLocaleString()),
      csvField(r.tableLabel),
      csvField(r.itemsSummary),
      csvField(r.subtotal),
      csvField(r.discountAmount),
      csvField(r.total),
      csvField(r.paymentSummary),
    ].join(',')
  )
  const csv = [header.join(','), ...lines].join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function AccountsPage() {
  const shift = useShiftStore((s) => s.shift)
  const lastClosing = useShiftStore((s) => s.lastClosing)
  const shiftLoading = useShiftStore((s) => s.loading)
  const initShift = useShiftStore((s) => s.init)
  const startShift = useShiftStore((s) => s.startShift)
  const endShift = useShiftStore((s) => s.endShift)

  useEffect(() => {
    initShift()
    useCustomersStore.getState().init()
    useInventoryStore.getState().init()
  }, [initShift])
  const allPaymentMethods = useSettingsStore((s) => s.paymentMethods)
  const paymentMethods = useMemo(() => allPaymentMethods.filter((m) => !m.isInternal), [allPaymentMethods])
  const internalPaymentMethods = useMemo(() => allPaymentMethods.filter((m) => m.isInternal), [allPaymentMethods])
  const canSeeFinancials = useAuthStore((s) => s.staff?.permissions.financials ?? false)
  const openOrdersCount = useOrdersStore((s) => s.orders.length)
  const { byMethod, orderCount, totalSalesAccrual, loading: ledgerLoading } = useShiftLedger(shift?.id, shift?.openedAt)

  const defaultOpening: MethodBalances = Object.fromEntries(paymentMethods.map((m) => [m.key, m.key === 'cash' ? 5000 : 0]))
  const [opening, setOpening] = useState<MethodBalances>(defaultOpening)
  const [closing, setClosingState] = useState(false)
  const [counted, setCounted] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (lastClosing) setOpening(lastClosing)
  }, [lastClosing])

  const elapsed = useElapsedTime(shift?.openedAt)

  function expectedFor(key: string) {
    const l = byMethod[key] ?? { revenue: 0, purchases: 0 }
    return (shift?.opening[key] ?? 0) + l.revenue - l.purchases
  }

  const [lastBackup, setLastBackup] = useState<Awaited<ReturnType<typeof buildDailyBackup>> | null>(null)
  const [backingUp, setBackingUp] = useState(false)
  const [startingDay, setStartingDay] = useState(false)

  async function handleEndShift() {
    const closingBalances: MethodBalances = {}
    paymentMethods.forEach((m) => (closingBalances[m.key] = Number(counted[m.key]) || 0))

    setBackingUp(true)
    const backup = await buildDailyBackup(shift, byMethod, closingBalances)
    downloadBackupJson(backup)
    setBackingUp(false)
    setLastBackup(backup)

    const result = await endShift(closingBalances)
    if (!result.ok) {
      setToast(result.error ?? 'Could not close the day — please try again.')
      setTimeout(() => setToast(null), 4000)
      return
    }
    setOpening(closingBalances)
    setClosingState(false)
    setCounted({})
    setToast('Day closed — backup downloaded')
    setTimeout(() => setToast(null), 3000)
  }

  function redownloadBackup() {
    if (lastBackup) downloadBackupJson(lastBackup)
  }

  const allCounted = paymentMethods.every((m) => counted[m.key] !== undefined && counted[m.key] !== '')
  const [printingOrder, setPrintingOrder] = useState<OrderHistoryRow | null>(null)

  useEffect(() => {
    if (!printingOrder) return
    const handle = () => setPrintingOrder(null)
    window.addEventListener('afterprint', handle)
    window.print()
    return () => window.removeEventListener('afterprint', handle)
  }, [printingOrder])

  if (shiftLoading) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="mb-4">
          <h1 className="font-ticket text-xl font-bold">Accounts</h1>
          <p className="text-sm text-ink/50">Start of day, end of day, sales, and order history</p>
        </div>
        <div className="h-40 rounded-2xl bg-ink/5 animate-pulse" />
      </div>
    )
  }

  return (
    <>
    <div className="p-4 md:p-6 max-w-2xl mx-auto print:hidden">
      <div className="mb-4">
        <h1 className="font-ticket text-xl font-bold">Accounts</h1>
        <p className="text-sm text-ink/50">Start of day, end of day, sales, and order history</p>
      </div>

      {lastBackup && !shift && (
        <Card className="p-4 mb-4 flex items-center justify-between bg-status-available-bg/40">
          <div className="text-sm">
            <div className="font-semibold">Today's backup downloaded</div>
            <div className="text-xs text-ink/50">{lastBackup.orders.length} orders, {lastBackup.purchases.length} purchases</div>
          </div>
          <button onClick={redownloadBackup} className="flex items-center gap-1.5 text-xs font-semibold text-ember bg-ember/10 rounded-full px-3 py-1.5">
            <Download size={13} /> Download again
          </button>
        </Card>
      )}

      {!shift ? (
        <Card className="p-5 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <PlayCircle size={18} className="text-status-available" />
            <div className="font-semibold">No shift open</div>
          </div>
          <p className="text-sm text-ink/50 mb-4">
            {lastClosing
              ? "Confirm what's actually in each — pre-filled from last night's closing count."
              : 'Count what you have in each before starting the day.'}
          </p>
          {paymentMethods.length === 0 ? (
            <p className="text-sm text-ink/40 mb-4">No payment methods configured — add one in Settings first.</p>
          ) : (
            <div className="space-y-3 mb-4">
              {paymentMethods.map((m) => (
                <div key={m.key}>
                  <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Opening {m.label} (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    value={opening[m.key] ?? 0}
                    onChange={(e) => setOpening((cur) => ({ ...cur, [m.key]: Math.max(0, Number(e.target.value) || 0) }))}
                    className="w-full text-lg font-ticket font-bold border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
                  />
                </div>
              ))}
            </div>
          )}
          <Button
            className="w-full"
            disabled={paymentMethods.length === 0 || startingDay}
            onClick={async () => {
              setStartingDay(true)
              try {
                const result = await startShift(opening)
                if (!result.ok) {
                  setToast(result.error ?? 'Could not start the day.')
                  setTimeout(() => setToast(null), 4000)
                }
              } catch (err) {
                console.error('[AccountsPage] startShift threw', err)
                setToast(err instanceof Error ? err.message : 'Something went wrong starting the day.')
                setTimeout(() => setToast(null), 5000)
              } finally {
                setStartingDay(false)
              }
            }}
          >
            {startingDay ? 'Starting…' : 'Start day'}
          </Button>
        </Card>
      ) : (
        <>
          <Card className="p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-status-available" />
                <span className="font-semibold text-sm">Shift open</span>
              </div>
              <span className="font-ticket text-xs text-ink/40">{elapsed} elapsed</span>
            </div>
            <div className="text-xs text-ink/50 mb-1">Opened by {shift.openedBy}, {new Date(shift.openedAt).toLocaleTimeString()}</div>
            <div className="flex gap-4 text-xs text-ink/50 flex-wrap">
              {paymentMethods.map((m) => (
                <span key={m.key}>{m.label}: <span className="font-ticket font-semibold text-ink">Rs. {shift.opening[m.key] ?? 0}</span></span>
              ))}
            </div>
          </Card>

          <Card className="p-5 mb-4">
            <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-1">Total sales this shift</div>
            <p className="text-xs text-ink/40 mb-3">Everything served today, including unpaid dues — this is what you actually sold.</p>
            {ledgerLoading ? (
              <div className="h-10 rounded-xl bg-ink/5 animate-pulse" />
            ) : (
              <div className="flex items-baseline justify-between">
                <span className="font-ticket text-2xl font-bold">Rs. {totalSalesAccrual}</span>
                {totalSalesAccrual > paymentMethods.reduce((s, m) => s + (byMethod[m.key]?.revenue || 0), 0) && (
                  <span className="text-xs text-status-cleaning font-semibold">
                    Rs. {totalSalesAccrual - paymentMethods.reduce((s, m) => s + (byMethod[m.key]?.revenue || 0), 0)} not yet collected
                  </span>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5 mb-4">
            <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-1">Cash collected this shift</div>
            <p className="text-xs text-ink/40 mb-3">Only money actually received — dues aren't counted until they're paid.</p>
            {ledgerLoading ? (
              <div className="h-24 rounded-xl bg-ink/5 animate-pulse" />
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-ink/40">
                      <th className="pb-2 font-semibold">Method</th>
                      <th className="pb-2 font-semibold text-right">Revenue</th>
                      <th className="pb-2 font-semibold text-right">Purchases</th>
                      <th className="pb-2 font-semibold text-right">End balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentMethods.map((m) => {
                      const l = byMethod[m.key] ?? { revenue: 0, purchases: 0 }
                      return (
                        <tr key={m.key} className="border-t border-ink/5">
                          <td className="py-2 font-medium">{m.label}</td>
                          <td className="py-2 text-right font-ticket text-status-available">Rs. {l.revenue}</td>
                          <td className="py-2 text-right font-ticket text-status-cleaning">Rs. {l.purchases}</td>
                          <td className="py-2 text-right font-ticket font-bold">Rs. {expectedFor(m.key)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-ink/10">
                      <td className="pt-2 font-semibold">Total</td>
                      <td className="pt-2 text-right font-ticket font-bold">
                        Rs. {paymentMethods.reduce((s, m) => s + (byMethod[m.key]?.revenue || 0), 0)}
                      </td>
                      <td className="pt-2 text-right font-ticket font-bold">
                        Rs. {paymentMethods.reduce((s, m) => s + (byMethod[m.key]?.purchases || 0), 0)}
                      </td>
                      <td className="pt-2 text-right font-ticket font-bold">
                        Rs. {paymentMethods.reduce((s, m) => s + expectedFor(m.key), 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                <div className="text-xs text-ink/40 mt-2">{orderCount} order{orderCount === 1 ? '' : 's'} paid this shift</div>
              </>
            )}
          </Card>

          {!closing ? (
            <>
              <Button
                variant="danger"
                className="w-full flex items-center justify-center gap-2 mb-2"
                disabled={openOrdersCount > 0}
                onClick={() => setClosingState(true)}
              >
                <StopCircle size={16} /> End day
              </Button>
              {openOrdersCount > 0 && (
                <p className="text-xs text-status-cleaning text-center mb-4">
                  {openOrdersCount} table{openOrdersCount === 1 ? '' : 's'} still {openOrdersCount === 1 ? 'has an' : 'have'} open order{openOrdersCount === 1 ? '' : 's'} — bill {openOrdersCount === 1 ? 'it' : 'them all'} out first.
                </p>
              )}
            </>
          ) : (
            <Card className="p-5 mb-4">
              <div className="font-semibold mb-1">Count everything</div>
              <p className="text-xs text-ink/50 mb-4">Enter what you actually have in each account.</p>

              <div className="space-y-4 mb-4">
                {paymentMethods.map((m) => {
                  const expected = expectedFor(m.key)
                  const countedVal = Number(counted[m.key]) || 0
                  const diff = counted[m.key] ? countedVal - expected : null
                  return (
                    <div key={m.key}>
                      <div className="flex justify-between items-baseline mb-1.5">
                        <label className="text-xs font-semibold text-ink/50">{m.label}</label>
                        <span className="text-xs text-ink/40">expected Rs. {expected}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={counted[m.key] ?? ''}
                        onChange={(e) => setCounted((cur) => ({ ...cur, [m.key]: e.target.value }))}
                        className="w-full text-lg font-ticket font-bold border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
                      />
                      {diff !== null && (
                        <div className={`text-xs font-semibold mt-1 ${diff === 0 ? 'text-status-available' : 'text-status-cleaning'}`}>
                          {diff === 0 ? 'Matches exactly' : diff > 0 ? `Rs. ${diff} over` : `Rs. ${Math.abs(diff)} short`}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => { setClosingState(false); setCounted({}) }}>Cancel</Button>
                <Button variant="danger" className="flex-1" disabled={!allCounted || backingUp} onClick={handleEndShift}>
                  {backingUp ? 'Preparing backup…' : 'Confirm & close day'}
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {canSeeFinancials && <TransfersCard paymentMethods={allPaymentMethods} internalPaymentMethods={internalPaymentMethods} />}

      <OrderHistoryCard onPrint={setPrintingOrder} />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink text-paper px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg">
          {toast}
        </div>
      )}
    </div>
    {printingOrder && (
      <ReceiptView
        tableLabel={printingOrder.tableLabel}
        customerName={printingOrder.customerName}
        lines={printingOrder.lines}
        subtotal={printingOrder.subtotal}
        discount={printingOrder.discountAmount}
        serviceCharge={printingOrder.serviceCharge}
        tax={printingOrder.taxAmount}
        tip={printingOrder.tipAmount}
        total={printingOrder.total}
      />
    )}
    </>
  )
}

// Everything from today, bundled into one file — orders, purchases, and the
// money summary — so a vendor always has an offline copy of the day even if
// something ever goes wrong with the live database.
async function buildDailyBackup(
  shift: ReturnType<typeof useShiftStore.getState>['shift'],
  byMethod: Record<string, { revenue: number; purchases: number }>,
  closingBalances: MethodBalances
) {
  const date = new Date().toISOString().slice(0, 10)
  const dayStart = `${date}T00:00:00`
  const dayEnd = `${date}T23:59:59`

  const orders = await fetchOrderHistory(dayStart, dayEnd, 500)

  const dayStartMs = new Date(dayStart).getTime()
  const dayEndMs = new Date(dayEnd).getTime()
  const purchases = usePurchasingStore.getState().purchases.filter((p) => {
    const t = new Date(p.createdAt).getTime()
    return t >= dayStartMs && t <= dayEndMs
  })

  // A snapshot of who owes what as of right now — not just "changed today",
  // since a due from last week is still real money the business is owed and
  // belongs in a complete accounting backup.
  const customersWithDues = useCustomersStore
    .getState()
    .customers.filter((c) => c.outstandingDue > 0)
    .map((c) => ({ name: c.name ?? 'Walk-in', phone: c.phone, outstandingDue: c.outstandingDue, dueSince: c.dueSince }))

  const inventoryMovementsToday = useInventoryStore
    .getState()
    .movements.filter((m) => {
      const t = new Date(m.createdAt).getTime()
      return t >= dayStartMs && t <= dayEndMs
    })
    .map((m) => {
      const item = useInventoryStore.getState().items.find((i) => i.id === m.itemId)
      return { item: item?.name ?? 'Unknown item', type: m.type, quantity: m.quantity, note: m.note, createdAt: m.createdAt }
    })

  return {
    date,
    generatedAt: new Date().toISOString(),
    shift: shift ? { openedBy: shift.openedBy, openedAt: shift.openedAt, opening: shift.opening, closing: closingBalances } : null,
    revenueByMethod: byMethod,
    orders,
    purchases,
    customersWithOutstandingDues: customersWithDues,
    inventoryMovementsToday,
  }
}

function downloadBackupJson(backup: { date: string }) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `restaurantos_backup_${backup.date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function todayISO(daysAgo = 0) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function downloadTransfersCsv(rows: ReturnType<typeof useAccountsStore.getState>['transfers']) {
  const header = ['Date/time', 'From', 'To', 'Amount', 'Note', 'By'].map(csvField)
  const lines = rows.map((t) =>
    [
      csvField(new Date(t.createdAt).toLocaleString()),
      csvField(t.fromLabel),
      csvField(t.toLabel),
      csvField(t.amount),
      csvField(t.note ?? ''),
      csvField(t.createdByName ?? 'Unknown'),
    ].join(',')
  )
  const csv = [header.join(','), ...lines].join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `transfers_${todayISO(0)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Only shown to staff with the 'financials' permission (see the toggle in
// Staff > Permissions). This is where Bank actually becomes usable — its
// balance only ever moves through transferFunds() here, logged with who
// and when in account_transfers, which the RLS policy also keeps hidden
// from anyone without that same permission.
function TransfersCard({
  paymentMethods,
  internalPaymentMethods,
}: {
  paymentMethods: PaymentMethodConfig[]
  internalPaymentMethods: PaymentMethodConfig[]
}) {
  const balances = useAccountsStore((s) => s.balances)
  const transfers = useAccountsStore((s) => s.transfers)
  const transfersLoading = useAccountsStore((s) => s.transfersLoading)
  const transferFunds = useAccountsStore((s) => s.transferFunds)
  const adjustBalance = useAccountsStore((s) => s.adjustBalance)
  const [adjusting, setAdjusting] = useState<PaymentMethodConfig | null>(null)
  const init = useAccountsStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  const [showTransfer, setShowTransfer] = useState(false)
  const [fromKey, setFromKey] = useState(paymentMethods[0]?.key ?? '')
  const [toKey, setToKey] = useState(internalPaymentMethods[0]?.key ?? paymentMethods[1]?.key ?? '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleTransfer() {
    setError(null)
    const amt = Number(amount)
    const available = balances[fromKey] ?? 0
    if (!amt || amt <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (fromKey === toKey) {
      setError('Pick two different accounts.')
      return
    }
    if (amt > available) {
      setError(`Only Rs. ${available.toLocaleString()} is actually available in that account.`)
      return
    }
    setSubmitting(true)
    const result = await transferFunds(fromKey, toKey, amt, note.trim() || undefined)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'Something went wrong with that transfer.')
      return
    }
    setShowTransfer(false)
    setAmount('')
    setNote('')
  }

  return (
    <>
      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">
            <ShieldAlert size={13} /> Accounts &amp; transfers
          </div>
          <button
            onClick={() => setShowTransfer(true)}
            className="flex items-center gap-1.5 text-xs font-semibold rounded-full border border-ink/10 px-2.5 py-1.5 hover:bg-ink/5"
          >
            <ArrowRightLeft size={12} /> Transfer funds
          </button>
        </div>

        <p className="text-xs text-ink/40 mb-3">Only visible to you and other staff with the "Bank account, transfers & full sales history" permission.</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-1">
          {paymentMethods.map((m) => (
            <div key={m.key} className="rounded-xl border border-ink/10 p-3">
              <div className="flex items-center justify-between mb-0.5">
                <div className="text-xs text-ink/50">{m.label}{m.isInternal ? ' (internal)' : ''}</div>
                <button onClick={() => setAdjusting(m)} className="text-ink/30 hover:text-ink"><Pencil size={12} /></button>
              </div>
              <div className="font-ticket text-lg font-bold">Rs. {(balances[m.key] ?? 0).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </Card>

      {adjusting && (
        <AdjustBalanceModal
          method={adjusting}
          currentBalance={balances[adjusting.key] ?? 0}
          onSave={async (newBalance, note) => {
            await adjustBalance(adjusting.key, newBalance, note)
            setAdjusting(null)
          }}
          onClose={() => setAdjusting(null)}
        />
      )}

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">
            <History size={13} /> Transfer history
          </div>
          {transfers.length > 0 && (
            <button
              onClick={() => downloadTransfersCsv(transfers)}
              className="flex items-center gap-1.5 text-xs font-semibold rounded-full border border-ink/10 px-2.5 py-1.5 hover:bg-ink/5"
            >
              <Download size={12} /> Export CSV
            </button>
          )}
        </div>
        {transfersLoading ? (
          <div className="h-16 rounded-xl bg-ink/5 animate-pulse" />
        ) : transfers.length === 0 ? (
          <p className="text-xs text-ink/30 py-6 text-center">No transfers yet.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {transfers.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm border-b border-ink/5 pb-2">
                <div>
                  <div className="font-semibold">
                    {t.fromLabel} <ArrowRightLeft size={11} className="inline mx-1 text-ink/30" /> {t.toLabel}
                  </div>
                  <div className="text-xs text-ink/40">
                    {new Date(t.createdAt).toLocaleString()} · {t.createdByName ?? 'Unknown'}
                    {t.note ? ` · ${t.note}` : ''}
                  </div>
                </div>
                <div className="font-ticket font-bold shrink-0">Rs. {t.amount.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTransfer(false)} />
          <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-ticket text-lg font-bold">Transfer funds</h2>
              <button onClick={() => setShowTransfer(false)} className="text-ink/40"><X size={20} /></button>
            </div>

            {internalPaymentMethods.length === 1 ? (
              <div className="mb-4">
                <label className="text-xs font-semibold text-ink/50 mb-1.5 block">From</label>
                <select value={fromKey} onChange={(e) => setFromKey(e.target.value)} className="w-full text-sm border border-ink/10 rounded-xl px-2 py-2.5 outline-none focus:border-ember bg-surface">
                  {paymentMethods.filter((m) => m.key !== toKey).map((m) => (
                    <option key={m.key} value={m.key}>{m.label} (Rs. {(balances[m.key] ?? 0).toLocaleString()})</option>
                  ))}
                </select>
                <p className="text-xs text-ink/40 mt-1.5">Going to {internalPaymentMethods[0].label}.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div>
                  <label className="text-xs font-semibold text-ink/50 mb-1.5 block">From</label>
                  <select value={fromKey} onChange={(e) => setFromKey(e.target.value)} className="w-full text-sm border border-ink/10 rounded-xl px-2 py-2.5 outline-none focus:border-ember bg-surface">
                    {paymentMethods.map((m) => (
                      <option key={m.key} value={m.key}>{m.label} (Rs. {(balances[m.key] ?? 0).toLocaleString()})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-ink/50 mb-1.5 block">To</label>
                  <select value={toKey} onChange={(e) => setToKey(e.target.value)} className="w-full text-sm border border-ink/10 rounded-xl px-2 py-2.5 outline-none focus:border-ember bg-surface">
                    {paymentMethods.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-ink/50 block">Amount (Rs.)</label>
              <span className="text-xs text-ink/40">Available: Rs. {(balances[fromKey] ?? 0).toLocaleString()}</span>
            </div>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              max={balances[fromKey] ?? 0}
              autoFocus
              className="w-full mb-4 text-lg font-ticket font-bold border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
            />

            <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. excess cash deposit"
              className="w-full mb-4 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
            />

            {error && <p className="text-xs text-status-cleaning mb-3">{error}</p>}

            <Button className="w-full" disabled={submitting} onClick={handleTransfer}>
              {submitting ? 'Transferring…' : 'Confirm transfer'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

function AdjustBalanceModal({
  method,
  currentBalance,
  onSave,
  onClose,
}: {
  method: PaymentMethodConfig
  currentBalance: number
  onSave: (newBalance: number, note: string) => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(String(currentBalance))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const newBalance = Number(value) || 0
  const delta = newBalance - currentBalance

  async function handleSave() {
    setSaving(true)
    await onSave(newBalance, note)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-ticket text-lg font-bold">Adjust {method.label}</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>
        <p className="text-xs text-ink/40 mb-4">
          Corrects the stored balance to match what's actually there — logged as an entry, not a silent overwrite, so the audit trail stays intact.
        </p>

        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Correct balance right now (Rs.)</label>
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-full mb-1 text-lg font-ticket font-bold border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
        />
        {delta !== 0 && (
          <p className="text-xs mb-4" style={{ color: delta > 0 ? 'var(--color-status-available)' : 'var(--color-status-cleaning)' }}>
            {delta > 0 ? '+' : ''}Rs. {delta.toLocaleString()} from what's currently stored (Rs. {currentBalance.toLocaleString()})
          </p>
        )}

        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Why (optional, but helps later)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. reconciled with physical count"
          className="w-full mb-5 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
        />

        <Button className="w-full" disabled={saving || delta === 0 || newBalance < 0} onClick={handleSave}>
          {saving ? 'Saving…' : newBalance < 0 ? 'Balance can\'t be negative' : delta === 0 ? 'No change to save' : 'Save correction'}
        </Button>
      </div>
    </div>
  )
}

function OrderHistoryCard({ onPrint }: { onPrint: (row: OrderHistoryRow) => void }) {
  const canSeeFullHistory = useAuthStore((s) => s.staff?.permissions.financials ?? false)
  const earliestSelectable = canSeeFullHistory ? undefined : todayISO(7)
  const [from, setFrom] = useState(canSeeFullHistory ? todayISO(0) : todayISO(7))
  const [to, setTo] = useState(todayISO(0))
  const [rows, setRows] = useState<OrderHistoryRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  async function search() {
    setLoading(true)
    const effectiveFrom = earliestSelectable && from < earliestSelectable ? earliestSelectable : from
    const data = await fetchOrderHistory(`${effectiveFrom}T00:00:00`, `${to}T23:59:59`)
    setRows(data)
    setLoading(false)
  }

  // Today's orders load automatically — no need to hit Search just to see
  // what happened today.
  useEffect(() => {
    search()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = useMemo(() => (rows ?? []).reduce((s, r) => s + r.total, 0), [rows])

  const listBody = (
    <>
      <div className="max-h-72 overflow-y-auto space-y-1.5 mb-2">
        {(rows ?? []).map((r) => (
          <HistoryRow key={r.id} row={r} onPrint={onPrint} />
        ))}
      </div>
      <div className="flex justify-between text-sm pt-1 border-t border-ink/10">
        <span className="font-semibold">{(rows ?? []).length} orders (latest 50 max)</span>
        <span className="font-ticket font-bold">Rs. {total}</span>
      </div>
    </>
  )

  return (
    <>
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">
            <History size={13} /> Order history
          </div>
          {rows && rows.length > 0 && (
            <button onClick={() => setExpanded(true)} className="text-ink/40 hover:text-ink" title="Maximize">
              <Maximize2 size={15} />
            </button>
          )}
        </div>

        <div className="flex items-end gap-2 flex-wrap mb-3">
          <div>
            <label className="text-xs font-semibold text-ink/50 mb-1 block">From</label>
            <input type="date" value={from} min={earliestSelectable} onChange={(e) => setFrom(e.target.value)} className="text-sm border border-ink/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-ember" />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink/50 mb-1 block">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-sm border border-ink/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-ember" />
          </div>
          <Button variant="secondary" onClick={search} disabled={loading}>{loading ? 'Loading…' : 'Search'}</Button>
          {rows && rows.length > 0 && (
            <Button
              variant="secondary"
              className="flex items-center gap-1.5"
              onClick={() => downloadCsv(`orders_${from}_to_${to}.csv`, rows)}
            >
              <Download size={14} /> Export CSV
            </Button>
          )}
        </div>

        {rows === null || rows.length === 0 ? (
          <p className="text-xs text-ink/40">No paid orders in that range.</p>
        ) : (
          listBody
        )}
      </Card>

      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setExpanded(false)} />
          <div className="relative bg-surface w-full max-w-lg max-h-[85vh] rounded-3xl p-5 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-1.5 font-ticket text-sm font-bold">
                <History size={15} /> Order history — {from === to ? from : `${from} to ${to}`}
              </div>
              <button onClick={() => setExpanded(false)} className="text-ink/40 hover:text-ink"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto flex-1">
              <div className="space-y-1.5 mb-2">
                {(rows ?? []).map((r) => (
                  <HistoryRow key={r.id} row={r} onPrint={onPrint} />
                ))}
              </div>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-ink/10 shrink-0">
              <span className="font-semibold">{(rows ?? []).length} orders</span>
              <span className="font-ticket font-bold">Rs. {total}</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function HistoryRow({ row, onPrint }: { row: OrderHistoryRow; onPrint: (row: OrderHistoryRow) => void }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-ink/5 pb-1.5">
      <div className="min-w-0">
        <div className="font-semibold">{row.tableLabel} <span className="text-ink/40 font-normal text-xs">{new Date(row.closedAt).toLocaleString()}</span></div>
        <div className="text-xs text-ink/40 truncate">{row.itemsSummary}</div>
        <div className={`text-[11px] font-semibold ${row.paymentSummary.includes('Due') ? 'text-status-cleaning' : 'text-status-available'}`}>
          {row.paymentSummary}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <span className="font-ticket font-semibold">Rs. {row.total}</span>
        <button onClick={() => onPrint(row)} className="text-ink/30 hover:text-ink" title="Print receipt">
          <Printer size={14} />
        </button>
      </div>
    </div>
  )
}


