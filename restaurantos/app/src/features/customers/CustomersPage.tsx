import { useMemo, useState } from 'react'
import { Search, Plus, Star, Phone, AlertTriangle } from 'lucide-react'
import { useCustomersStore } from './customersStore'
import { useSettingsStore } from '../settings/settingsStore'
import { CustomerDetailModal } from './CustomerDetailModal'
import { loyaltyTier } from './types'
import type { Customer } from './types'

const TIER_STYLE: Record<string, string> = {
  New: 'bg-ink/5 text-ink/50',
  Regular: 'bg-status-reserved-bg text-status-reserved',
  Loyal: 'bg-status-occupied-bg text-status-occupied',
  VIP: 'bg-ember/15 text-ember',
}

function daysOverdue(dueSince: string) {
  return Math.floor((Date.now() - new Date(dueSince).getTime()) / (24 * 60 * 60 * 1000))
}

export function CustomersPage() {
  const customers = useCustomersStore((s) => s.customers)
  const addCustomer = useCustomersStore((s) => s.addCustomer)
  const dueReminderDays = useSettingsStore((s) => s.dueReminderDays)

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const overdue = useMemo(
    () => customers.filter((c) => c.outstandingDue > 0 && c.dueSince && daysOverdue(c.dueSince) >= dueReminderDays),
    [customers, dueReminderDays]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q))
  }, [customers, search])

  // Name and phone are both optional — a visit can be logged as "Walk-in"
  // and a manager can fill the details in later once they get to know someone.
  function handleAdd() {
    addCustomer(newName.trim() || undefined, newPhone.trim() || undefined)
    setNewName('')
    setNewPhone('')
    setAdding(false)
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-ticket text-xl font-bold">Customers</h1>
          <p className="text-sm text-ink/50">{customers.length} in your database</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-xl bg-ember text-white px-3.5 py-2.5 text-sm font-semibold hover:brightness-95"
        >
          <Plus size={16} /> Add customer
        </button>
      </div>

      {overdue.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-status-cleaning-bg text-status-cleaning px-3.5 py-2.5 text-sm font-semibold mb-4">
          <AlertTriangle size={15} />
          {overdue.length} customer{overdue.length > 1 ? 's have' : ' has'} dues older than {dueReminderDays} days
        </div>
      )}

      <div className="flex items-center gap-2 bg-surface border border-ink/10 rounded-xl px-3 py-2.5 mb-4">
        <Search size={16} className="text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone"
          className="flex-1 text-sm outline-none bg-transparent"
        />
      </div>

      {adding && (
        <div className="bg-surface border border-ink/5 rounded-2xl p-4 mb-3">
          <p className="text-xs text-ink/40 mb-2">Both optional — you can save with nothing and fill it in later.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (optional)"
              className="flex-1 text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
            />
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="flex-1 text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
            />
            <button onClick={handleAdd} className="text-sm font-semibold text-ember px-2">Save</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((c) => {
          const tier = loyaltyTier(c.visits.length)
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="w-full text-left flex items-center gap-3 bg-surface border border-ink/5 rounded-2xl p-3.5 hover:border-ink/15 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{c.name || 'Walk-in customer'}</span>
                  <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${TIER_STYLE[tier]}`}>{tier}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-ink/40 mt-0.5">
                  {c.phone ? (
                    <>
                      <Phone size={11} /> {c.phone}
                    </>
                  ) : (
                    <span className="italic">No phone on file</span>
                  )}
                  {c.favoriteItem && (
                    <span className="flex items-center gap-0.5 ml-2 text-ember">
                      <Star size={11} className="fill-ember" /> {c.favoriteItem}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-ticket text-sm font-bold">Rs. {c.lifetimeSpend}</div>
                {c.outstandingDue > 0 && (
                  <div className="text-xs text-status-cleaning font-semibold">
                    Rs. {c.outstandingDue} due{c.dueSince && daysOverdue(c.dueSince) >= dueReminderDays ? ' ⚠' : ''}
                  </div>
                )}
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-ink/40 text-center py-10">No customers match "{search}".</p>
        )}
      </div>

      {selected && <CustomerDetailModal customer={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
