import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Phone, AlertTriangle, Trash2 } from 'lucide-react'
import { useCustomersStore } from './customersStore'
import { useContactsStore } from './contactsStore'
import { useSettingsStore } from '../settings/settingsStore'
import { CustomerDetailModal } from './CustomerDetailModal'
import { DuesView } from './DuesView'
import { loyaltyTier } from './types'

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
  const loading = useCustomersStore((s) => s.loading)
  const init = useCustomersStore((s) => s.init)
  const addCustomer = useCustomersStore((s) => s.addCustomer)
  const dueReminderDays = useSettingsStore((s) => s.dueReminderDays)

  useEffect(() => {
    init()
  }, [init])

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'customers' | 'contacts' | 'dues'>('customers')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newOpeningDue, setNewOpeningDue] = useState('')

  const overdue = useMemo(
    () => customers.filter((c) => c.outstandingDue > 0 && c.dueSince && daysOverdue(c.dueSince) >= dueReminderDays),
    [customers, dueReminderDays]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q))
  }, [customers, search])

  const selected = customers.find((c) => c.id === selectedId) ?? null

  // Name and phone are both optional — a visit can be logged as "Walk-in"
  // and a manager can fill the details in later once they get to know someone.
  async function handleAdd() {
    const due = Math.max(0, Number(newOpeningDue) || 0)
    await addCustomer(newName.trim() || undefined, newPhone.trim() || undefined, due > 0 ? due : undefined)
    setNewName('')
    setNewPhone('')
    setNewOpeningDue('')
    setAdding(false)
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="font-ticket text-xl font-bold">Customers</h1>
        </div>
        <div className="h-40 rounded-2xl bg-ink/5 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="font-ticket text-xl font-bold">Customers</h1>
          <p className="text-sm text-ink/50">{tab === 'customers' ? `${customers.length} in your database` : 'Contacts you rely on — vendors, repairs, and more'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-ink/5 rounded-xl p-1">
            <button
              onClick={() => setTab('customers')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === 'customers' ? 'bg-surface shadow-sm' : 'text-ink/50'}`}
            >
              Customers
            </button>
            <button
              onClick={() => setTab('contacts')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === 'contacts' ? 'bg-surface shadow-sm' : 'text-ink/50'}`}
            >
              Contacts
            </button>
            <button
              onClick={() => setTab('dues')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === 'dues' ? 'bg-surface shadow-sm' : 'text-ink/50'}`}
            >
              Dues{overdue.length > 0 ? ` (${overdue.length})` : ''}
            </button>
          </div>
          {tab === 'customers' && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-xl bg-ember text-white px-3.5 py-2.5 text-sm font-semibold hover:brightness-95"
            >
              <Plus size={16} /> Add customer
            </button>
          )}
        </div>
      </div>

      {tab === 'contacts' ? (
        <ContactsView />
      ) : tab === 'dues' ? (
        <>
          <DuesView customers={customers} onSelect={setSelectedId} />
          {selected && <CustomerDetailModal customer={selected} onClose={() => setSelectedId(null)} />}
        </>
      ) : (
        <>

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
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              min="0"
              value={newOpeningDue}
              onChange={(e) => setNewOpeningDue(e.target.value)}
              placeholder="Already owes Rs. (optional)"
              className="flex-1 text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
            />
            <button onClick={handleAdd} className="text-sm font-semibold text-ember px-2">Save</button>
          </div>
          <p className="text-xs text-ink/40 mt-1.5">Only for a customer who already owed you money before this software — it's saved as a normal due starting today, settle it the same way as any other.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((c) => {
          const tier = loyaltyTier(c.visitCount)
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
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

      {selected && <CustomerDetailModal customer={selected} onClose={() => setSelectedId(null)} />}
        </>
      )}
    </div>
  )
}

function ContactsView() {
  const contacts = useContactsStore((s) => s.contacts)
  const loading = useContactsStore((s) => s.loading)
  const init = useContactsStore((s) => s.init)
  const addContact = useContactsStore((s) => s.addContact)
  const updateContact = useContactsStore((s) => s.updateContact)
  const removeContact = useContactsStore((s) => s.removeContact)

  useEffect(() => {
    init()
  }, [init])

  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNotes, setEditNotes] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts
    const q = search.toLowerCase()
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.role?.toLowerCase().includes(q))
  }, [contacts, search])

  async function handleAdd() {
    if (!name.trim()) return
    await addContact({ name: name.trim(), phone: phone.trim() || undefined, role: role.trim() || undefined })
    setName('')
    setPhone('')
    setRole('')
    setAdding(false)
  }

  if (loading) {
    return <div className="h-40 rounded-2xl bg-ink/5 animate-pulse" />
  }

  return (
    <div>
      <div className="flex items-center gap-2 bg-surface border border-ink/10 rounded-xl px-3 py-2.5 mb-4">
        <Search size={16} className="text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or role"
          className="flex-1 text-sm outline-none bg-transparent"
        />
        <button onClick={() => setAdding(true)} className="text-xs font-semibold text-ember shrink-0">+ Add contact</button>
      </div>

      {adding && (
        <div className="bg-surface border border-ink/5 rounded-2xl p-4 mb-3">
          <p className="text-xs text-ink/40 mb-2">e.g. electrician, dairy supplier, gas delivery, repair technician.</p>
          <div className="grid sm:grid-cols-3 gap-2 mb-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="text-sm border border-ink/10 rounded-lg px-3 py-2 outline-none focus:border-ember" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="text-sm border border-ink/10 rounded-lg px-3 py-2 outline-none focus:border-ember" />
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. Electrician)" className="text-sm border border-ink/10 rounded-lg px-3 py-2 outline-none focus:border-ember" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="text-xs font-semibold text-ink/40 px-3 py-2">Cancel</button>
            <button onClick={handleAdd} disabled={!name.trim()} className="text-xs font-semibold text-white bg-ember rounded-lg px-3 py-2 disabled:opacity-40">Save</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-ink/40 text-center py-10">No contacts yet.</p>}
        {filtered.map((c) => (
          <div key={c.id} className="bg-surface border border-ink/5 rounded-2xl p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{c.name}</span>
                  {c.role && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-ink/5 text-ink/50">{c.role}</span>}
                </div>
                {c.phone && (
                  <div className="flex items-center gap-1 text-xs text-ink/40 mt-0.5">
                    <Phone size={11} /> {c.phone}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setEditingId(editingId === c.id ? null : c.id); setEditNotes(c.notes ?? '') }}
                  className="text-xs font-semibold text-ink/40 hover:text-ink"
                >
                  Notes
                </button>
                <button onClick={() => removeContact(c.id)} className="text-ink/25 hover:text-status-cleaning"><Trash2 size={14} /></button>
              </div>
            </div>
            {editingId === c.id && (
              <div className="mt-2 pt-2 border-t border-ink/5">
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  onBlur={() => updateContact(c.id, { notes: editNotes })}
                  placeholder="Notes — rates, availability, anything worth remembering"
                  rows={2}
                  className="w-full text-sm outline-none resize-none bg-transparent text-ink/70"
                />
              </div>
            )}
            {!editingId && c.notes && <div className="mt-1.5 text-xs text-ink/40 truncate">{c.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
