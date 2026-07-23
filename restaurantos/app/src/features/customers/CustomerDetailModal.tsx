import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Star, Phone, Pencil } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { useCustomersStore } from './customersStore'
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
  const setPendingOrder = useRepeatOrderStore((s) => s.setPending)
  const navigate = useNavigate()
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [settling, setSettling] = useState(false)
  const [amount, setAmount] = useState(String(customer.outstandingDue))
  const [editingProfile, setEditingProfile] = useState(!customer.name && !customer.phone)
  const [name, setName] = useState(customer.name ?? '')
  const [phone, setPhone] = useState(customer.phone ?? '')

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

  const tier = loyaltyTier(customer.visits.length)

  function saveProfile() {
    updateProfile(customer.id, { name: name.trim() || undefined, phone: phone.trim() || undefined })
    setEditingProfile(false)
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
          <Stat label="Visits" value={String(customer.visits.length)} />
        </div>

        {customer.favoriteItem && (
          <div className="flex items-center gap-1.5 text-sm mb-4 bg-ember/10 text-ember rounded-xl px-3 py-2 font-medium">
            <Star size={14} className="fill-ember" /> Usually orders {customer.favoriteItem}
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
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full mb-2 text-sm font-ticket font-bold border border-ink/10 rounded-lg px-2.5 py-2 outline-none focus:border-ember"
                />
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1 py-2 text-xs" onClick={() => setSettling(false)}>Cancel</Button>
                  <Button className="flex-1 py-2 text-xs" onClick={() => { settleDue(customer.id, Number(amount) || 0); setSettling(false) }}>Confirm</Button>
                </div>
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
          {customer.visits.length === 0 ? (
            <p className="text-sm text-ink/40">No visits recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {customer.visits.map((v, i) => (
                <div key={i} className="flex justify-between items-start text-sm border-b border-ink/5 pb-2 last:border-0">
                  <div className="min-w-0">
                    <div className="text-xs text-ink/40">{new Date(v.date).toLocaleDateString()}</div>
                    <div className="text-xs text-ink/50">{v.itemsSummary}</div>
                    <button
                      onClick={() => repeatOrder(v.itemsSummary)}
                      className="text-[11px] font-semibold text-ember mt-1"
                    >
                      ↻ Repeat this order
                    </button>
                  </div>
                  <span className="font-ticket font-semibold shrink-0">Rs. {v.amount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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
