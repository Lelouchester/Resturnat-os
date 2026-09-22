import { useMemo, useState } from 'react'
import { useCustomersStore } from './customersStore'

/**
 * Type a name (or phone), get live suggestions from the real customer list
 * — pick one to link them immediately, or type a brand-new name/phone and
 * it becomes a real CRM record the moment it's saved (not just free text on
 * the table). An exact name+phone match reuses the existing record instead
 * of creating a duplicate.
 */
export function CustomerAssignField({
  currentName,
  currentPhone,
  autoEdit,
  onAssign,
}: {
  currentName?: string
  currentPhone?: string
  autoEdit?: boolean
  onAssign: (customer: { id: string; name: string; phone?: string }) => void
}) {
  const customers = useCustomersStore((s) => s.customers)
  const addCustomer = useCustomersStore((s) => s.addCustomer)
  const [editing, setEditing] = useState(Boolean(autoEdit))
  const [name, setName] = useState(currentName ?? '')
  const [phone, setPhone] = useState(currentPhone ?? '')

  const matches = useMemo(() => {
    if (!name.trim()) return []
    const q = name.trim().toLowerCase()
    return customers.filter((c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q)).slice(0, 5)
  }, [customers, name])

  function pick(c: { id: string; name?: string; phone?: string }) {
    onAssign({ id: c.id, name: c.name ?? '', phone: c.phone })
    setEditing(false)
  }

  async function saveNew() {
    if (!name.trim()) {
      setEditing(false)
      return
    }
    const exact = customers.find(
      (c) => c.name?.toLowerCase() === name.trim().toLowerCase() && (!phone.trim() || c.phone === phone.trim())
    )
    if (exact) {
      onAssign({ id: exact.id, name: exact.name ?? '', phone: exact.phone })
    } else {
      const id = await addCustomer(name.trim(), phone.trim() || undefined)
      onAssign({ id, name: name.trim(), phone: phone.trim() || undefined })
    }
    setEditing(false)
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-sm text-ink/50 hover:text-ink font-medium text-left">
        {currentName ? `${currentName}${currentPhone ? ' · ' + currentPhone : ''}` : '+ Add customer name'}
      </button>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Customer name"
          className="text-sm rounded-lg border border-ink/10 px-2.5 py-1.5 outline-none focus:border-ember w-36"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional)"
          className="text-sm rounded-lg border border-ink/10 px-2.5 py-1.5 outline-none focus:border-ember w-32"
        />
        <button onClick={saveNew} className="text-xs font-semibold text-ember">Save</button>
        <button onClick={() => setEditing(false)} className="text-xs text-ink/40">Cancel</button>
      </div>
      {matches.length > 0 && (
        <div className="absolute z-10 mt-1 bg-surface border border-ink/10 rounded-xl shadow-lg overflow-hidden w-full max-w-xs">
          {matches.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-ink/5 flex items-center justify-between"
            >
              <span>{c.name || 'Walk-in'}</span>
              {c.phone && <span className="text-xs text-ink/40">{c.phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
