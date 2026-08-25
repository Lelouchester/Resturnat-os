import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Star, Phone, Pencil, Trash2 } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { useCustomersStore, fetchCustomerVisits, fetchDueStatement, type Visit, type DueStatementEntry } from './customersStore'
import { useOrdersStore } from '../orders/ordersStore'
import { useSettingsStore } from '../settings/settingsStore'
import { useRepeatOrderStore } from '../orders/repeatOrderStore'
import { loyaltyTier } from './types'
import type { Customer } from './types'

const TIER_STYLE: Record<string, string> = {
  New: 'bg-ink/5 text-ink/50',
  Regular: 'bg-status-reserved-bg text-status-reserved',
  Loyal: 'bg-status-occupied-bg text-status-occupied',
  VIP: 'bg-ember/15 text-ember',
}

export function CustomerDetailModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const updateNotes = useCustomersStore((s) => s.updateNotes)
  const updateProfile = useCustomersStore((s) => s.updateProfile)
  const settleDue = useCustomersStore((s) => s.settleDue)
  const removeCustomer = useCustomersStore((s) => s.removeCustomer)
  const cancelPaidOrder = useOrdersStore((s) => s.cancelPaidOrder)
  const paymentMethods = useSettingsStore((s) => s.paymentMethods)
  const setPendingOrder = useRepeatOrderStore((s) => s.setPending)
  const navigate = useNavigate()
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [settling, setSettling] = useState(false)
  const [dueStatementOpen, setDueStatementOpen] = useState(false)
  const [dueStatement, setDueStatement] = useState<DueStatementEntry[]>([])
  const [dueStatementLoading, setDueStatementLoading] = useState(false)
  const [amount, setAmount] = useState(String(customer.outstandingDue))
  const [settleMethod, setSettleMethod] = useState(paymentMethods[0]?.key ?? '')
  const [editingProfile, setEditingProfile] = useState(!customer.name && !customer.phone)
  const [name, setName] = useState(customer.name ?? '')
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [cancelOrderError, setCancelOrderError] = useState<string | null>(null)

  const [visits, setVisits] = useState<Visit[] | null>(null)
  const [favoriteItem, setFavoriteItem] = useState<string | undefined>(undefined)
  useEffect(() => {
    fetchCustomerVisits(customer.id).then(({ visits, favoriteItem }) => {
      setVisits(visits)
      setFavoriteItem(favoriteItem)
    })
  }, [customer.id])

  // "2x Chicken sekuwa, 1x Masala tea" -> [{name, quantity}] — Orders looks
  // each one up against the live menu and adds whatever still exists.
  function repeatOrder(itemsSummary: string) {
    const items = itemsSummary.split(',').map((part) => {
      const match = part.trim().match(/^(\d+)x\s+(.+)$/i)
      return match ? { quantity: Number(match[1]), name: match[2].trim() } : { quantity: 1, name: part.trim() }
    })
    setPendingOrder(items)
    onClose()
    navigate('/orders')
  }

  const tier = loyaltyTier(customer.visitCount)

  function saveProfile() {
    updateProfile(customer.id, { name: name.trim() || undefined, phone: phone.trim() || undefined })
    setEditingProfile(false)
  }

  async function handleRemove() {
    if (!window.confirm(`Remove "${customer.name || 'this customer'}"? This can't be undone.`)) return
    const result = await removeCustomer(customer.id)
    if (result.ok) onClose()
    else setRemoveError(result.error ?? 'Could not remove this customer.')
  }

  async function handleCancelVisit(visitId: string) {
    if (!window.confirm("Cancel this order? This reverts the money, stock, and due it affected.")) return
    const result = await cancelPaidOrder(visitId)
    if (result.ok) setVisits(await fetchCustomerVisits(customer.id).then((r) => r.visits))
    else setCancelOrderError(result.error ?? 'Could not cancel this order.')
  }

  async function toggleDueStatement() {
    if (dueStatementOpen) {
      setDueStatementOpen(false)
      return
    }
    setDueStatementOpen(true)
    setDueStatementLoading(true)
    setDueStatement(await fetchDueStatement(customer.id))
    setDueStatementLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-md md:rounded-3xl rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h2 className="font-ticket text-lg font-bold">{customer.name || 'Walk-in customer'}</h2>
            <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${TIER_STYLE[tier]}`}>{tier}</span>
          </div>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>

        {!editingProfile ? (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1 text-sm text-ink/50">
              {customer.phone ? (
                <>
                  <Phone size={13} /> {customer.phone}
                </>
              ) : (
                <span className="italic">No details on file yet</span>
              )}
            </div>
            <button onClick={() => setEditingProfile(true)} className="flex items-center gap-1 text-xs font-semibold text-ember">
              <Pencil size={12} /> {customer.name || customer.phone ? 'Edit' : 'Add details'}
            </button>
          </div>
        ) : (
          <div className="mb-4 bg-ink/[0.03] rounded-xl p-3">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="text-sm border border-ink/10 rounded-lg px-2.5 py-2 outline-none focus:border-ember"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                className="text-sm border border-ink/10 rounded-lg px-2.5 py-2 outline-none focus:border-ember"
              />
            </div>
            <Button className="w-full py-2 text-xs" onClick={saveProfile}>Save details</Button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-4">
          <Stat label="Lifetime" value={`Rs. ${customer.lifetimeSpend}`} />
          <Stat label="Loyalty" value={`${customer.loyaltyPoints} pts`} />
          <Stat label="Visits" value={String(customer.visitCount)} />
        </div>

        {favoriteItem && (
          <div className="flex items-center gap-1.5 text-sm mb-4 bg-ember/10 text-ember rounded-xl px-3 py-2 font-medium">
            <Star size={14} className="fill-ember" /> Usually orders {favoriteItem}
          </div>
        )}

        {customer.outstandingDue > 0 && (
          <div className="mb-4">
            {!settling ? (
              <button
                onClick={() => setSettling(true)}
                className="w-full flex justify-between items-center rounded-xl bg-status-cleaning-bg text-status-cleaning px-3.5 py-2.5 text-sm font-semibold"
              >
                <span>Rs. {customer.outstandingDue} due{customer.dueSince ? ` · ${Math.floor((Date.now() - new Date(customer.dueSince).getTime()) / 86400000)}d` : ''}</span>
                <span className="underline">Settle</span>
              </button>
            ) : (
              <div className="rounded-xl border border-ink/10 p-3">
                <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Amount settled (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full mb-2 text-sm font-ticket font-bold border border-ink/10 rounded-lg px-2.5 py-2 outline-none focus:border-ember"
                />
                {paymentMethods.length > 0 && (
                  <>
                    <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Received via</label>
                    <div className="flex gap-1.5 mb-2 flex-wrap">
                      {paymentMethods.map((m) => (
                        <button
                          key={m.key}
                          onClick={() => setSettleMethod(m.key)}
                          className={`text-xs font-semibold rounded-full px-3 py-1.5 ${
                            settleMethod === m.key ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/60'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1 py-2 text-xs" onClick={() => setSettling(false)}>Cancel</Button>
                  <Button
                    className="flex-1 py-2 text-xs"
                    onClick={() => { settleDue(customer.id, Number(amount) || 0, settleMethod || undefined); setSettling(false) }}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            )}
            <button
              onClick={toggleDueStatement}
              className="mt-2 text-[11px] font-semibold text-ink/40 underline"
            >
              {dueStatementOpen ? 'Hide' : 'View'} due statement
            </button>
            {dueStatementOpen && (
              <div className="mt-2 rounded-xl border border-ink/10 p-3 space-y-2">
                {dueStatementLoading ? (
                  <div className="text-xs text-ink/30">Loading…</div>
                ) : dueStatement.length === 0 ? (
                  <div className="text-xs text-ink/30 italic">Nothing on record yet.</div>
                ) : (
                  (() => {
                    let running = 0
                    return dueStatement.map((e, i) => {
                      running += e.type === 'incurred' ? e.amount : -e.amount
                      return (
                        <div key={i} className="text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-ink/50">
                              {new Date(e.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                            <span className={`font-ticket font-semibold ${e.type === 'incurred' ? 'text-status-cleaning' : 'text-status-available'}`}>
                              {e.type === 'incurred' ? '+' : '-'}Rs. {e.amount}
                            </span>
                          </div>
                          <div className="text-ink/35 flex items-center justify-between">
                            <span>{e.type === 'incurred' ? e.description : e.description}</span>
                            <span>Balance: Rs. {running}</span>
                          </div>
                        </div>
                      )
                    })
                  })()
                )}
              </div>
            )}
          </div>
        )}

        <div className="mb-4">
          <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-2">Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => updateNotes(customer.id, notes)}
            placeholder="e.g. seating preference, allergies, regular order"
            rows={2}
            className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember resize-none"
          />
        </div>

        <div>
          <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-2">Visit history</div>
          {visits === null ? (
            <div className="h-16 rounded-xl bg-ink/5 animate-pulse" />
          ) : visits.length === 0 ? (
            <p className="text-sm text-ink/40">No visits recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {visits.map((v) => {
                const isToday = new Date(v.date).toDateString() === new Date().toDateString()
                return (
                  <div key={v.id} className="flex justify-between items-start text-sm border-b border-ink/5 pb-2 last:border-0">
                    <div className="min-w-0">
                      <div className="text-xs text-ink/40">
                        {new Date(v.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-xs text-ink/50">{v.itemsSummary}</div>
                      {v.activityNote && <div className="text-[11px] text-ink/35 italic">{v.activityNote}</div>}
                      {v.duePortion > 0 && (
                        <div className="text-[11px] font-semibold text-status-cleaning">Rs. {v.duePortion} was left as due from this order</div>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <button
                          onClick={() => repeatOrder(v.itemsSummary)}
                          className="text-[11px] font-semibold text-ember"
                        >
                          ↻ Repeat this order
                        </button>
                        {isToday && (
                          <button
                            onClick={() => handleCancelVisit(v.id)}
                            className="text-[11px] font-semibold text-status-cleaning"
                          >
                            Cancel this order
                          </button>
                        )}
                      </div>
                    </div>
                    <span className="font-ticket font-semibold shrink-0">Rs. {v.amount}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {cancelOrderError && (
          <div className="mt-3 text-xs font-semibold text-status-cleaning bg-status-cleaning-bg rounded-xl px-3 py-2">{cancelOrderError}</div>
        )}

        {removeError && (
          <div className="mt-4 text-xs font-semibold text-status-cleaning bg-status-cleaning-bg rounded-xl px-3 py-2">{removeError}</div>
        )}
        <button
          onClick={handleRemove}
          className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-ink/40 hover:text-status-cleaning py-2"
        >
          <Trash2 size={12} /> Remove customer
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink/[0.03] rounded-xl py-2.5 text-center">
      <div className="font-ticket text-sm font-bold">{value}</div>
      <div className="text-[10px] text-ink/40 mt-0.5">{label}</div>
    </div>
  )
}
