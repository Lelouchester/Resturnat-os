import { useEffect, useState } from 'react'
import { Plus, X, ShieldCheck, Pencil, Check, Trash2 } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { Button } from '../../shared/ui/Button'
import { useStaffStore } from './staffStore'
import { FEATURES } from './types'
import type { StaffRole, StaffMember } from './types'

const ROLES: { key: StaffRole; label: string }[] = [
  { key: 'admin', label: 'Administrator' },
  { key: 'manager', label: 'Manager' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'waiter', label: 'Waiter' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'store', label: 'Store' },
]

export function StaffPage() {
  const staff = useStaffStore((s) => s.staff)
  const loading = useStaffStore((s) => s.loading)
  const init = useStaffStore((s) => s.init)
  const addStaff = useStaffStore((s) => s.addStaff)
  const updateRole = useStaffStore((s) => s.updateRole)
  const updateName = useStaffStore((s) => s.updateName)
  const toggleActive = useStaffStore((s) => s.toggleActive)
  const removeStaff = useStaffStore((s) => s.removeStaff)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [staffNotice, setStaffNotice] = useState<string | null>(null)

  async function handleRemoveStaff(id: string) {
    const result = await removeStaff(id)
    if (!result.ok) {
      setStaffNotice(result.error ?? 'Could not remove this person.')
    } else if (result.deactivatedInstead) {
      setStaffNotice('This person has order/shift history, so they were deactivated instead of deleted — their records stay intact.')
    }
    setRemovingId(null)
    setTimeout(() => setStaffNotice(null), 5000)
  }

  useEffect(() => {
    init()
  }, [init])

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('waiter')
  const [permissionsFor, setPermissionsFor] = useState<StaffMember | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  function handleAdd() {
    if (!name.trim() || !emailValid) return
    addStaff(name.trim(), email.trim(), role)
    setName('')
    setEmail('')
    setAdding(false)
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="font-ticket text-xl font-bold">Staff</h1>
        </div>
        <div className="h-40 rounded-2xl bg-ink/5 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-ticket text-xl font-bold">Staff</h1>
          <p className="text-sm text-ink/50">{staff.filter((s) => s.isActive).length} active</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-xl bg-ember text-white px-3.5 py-2.5 text-sm font-semibold hover:brightness-95"
        >
          <Plus size={16} /> Add staff
        </button>
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAdding(false)} />
          <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-ticket text-lg font-bold">Add staff</h2>
              <button onClick={() => setAdding(false)} className="text-ink/40"><X size={20} /></button>
            </div>
            <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mb-4 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
            />
            <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="w-full mb-4 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember bg-surface"
            >
              {ROLES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <p className="text-xs text-ink/40 mb-4">Starts with the usual access for that role — adjustable per person afterward from "Permissions".</p>
            <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Google account email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@gmail.com"
              className="w-full mb-1 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
            />
            <p className="text-xs text-ink/40 mb-4">They'll sign in with this Google account — nothing else to set up on their end.</p>
            <Button className="w-full" disabled={!name.trim() || !emailValid} onClick={handleAdd}>
              Add staff member
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {staff.map((s) => {
          const grantedCount = FEATURES.filter((f) => s.permissions[f.key]).length
          return (
            <Card key={s.id} className={`p-4 ${s.isActive ? '' : 'opacity-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  {renamingId === s.id ? (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && renameDraft.trim() && (updateName(s.id, renameDraft.trim()), setRenamingId(null))}
                        className="text-sm font-semibold border-b border-ember outline-none bg-transparent"
                      />
                      <button
                        onClick={() => { if (renameDraft.trim()) updateName(s.id, renameDraft.trim()); setRenamingId(null) }}
                        className="text-status-available"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">{s.name}</span>
                      <button
                        onClick={() => { setRenamingId(s.id); setRenameDraft(s.name) }}
                        className="text-ink/25 hover:text-ink"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  )}
                  <div className="text-xs text-ink/40">{s.email}</div>
                  <select
                    value={s.role}
                    onChange={(e) => updateRole(s.id, e.target.value as StaffRole)}
                    className="text-xs text-ink/50 bg-transparent outline-none -ml-0.5"
                  >
                    {ROLES.map((r) => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </select>
                  {!s.hasSignedIn && (
                    <div className="text-[11px] font-semibold text-status-occupied mt-0.5">Waiting for first sign-in</div>
                  )}
                </div>
                <button
                  onClick={() => toggleActive(s.id)}
                  className={`text-xs font-semibold rounded-full px-3 py-1.5 ${
                    s.isActive ? 'bg-status-cleaning-bg text-status-cleaning' : 'bg-status-available-bg text-status-available'
                  }`}
                >
                  {s.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
                <button onClick={() => setRemovingId(s.id)} className="text-ink/25 hover:text-status-cleaning ml-2" title="Remove">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-ink/5">
                <div className="flex gap-4 text-xs text-ink/50">
                  {s.salesGenerated > 0 && <span>Sales: <b className="font-ticket text-ink">Rs. {s.salesGenerated}</b></span>}
                  <span>Shifts: <b className="font-ticket text-ink">{s.shiftsWorked}</b></span>
                  {s.avgPrepMinutes && <span>Avg prep: <b className="font-ticket text-ink">{s.avgPrepMinutes}m</b></span>}
                </div>
                <button
                  onClick={() => setPermissionsFor(s)}
                  className="flex items-center gap-1 text-xs font-semibold rounded-full border border-ink/10 px-2.5 py-1.5 hover:bg-ink/5"
                >
                  <ShieldCheck size={12} /> Permissions ({grantedCount}/{FEATURES.length})
                </button>
              </div>
            </Card>
          )
        })}
      </div>

      {permissionsFor && (
        <PermissionsModal staff={permissionsFor} onClose={() => setPermissionsFor(null)} />
      )}

      {removingId && (() => {
        const s = staff.find((st) => st.id === removingId)
        if (!s) return null
        return (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setRemovingId(null)} />
            <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
              <h2 className="font-ticket text-lg font-bold mb-2">Remove {s.name}?</h2>
              <p className="text-sm text-ink/50 mb-4">
                If they've never taken an order or opened a shift, they're deleted outright. If they have real history, they'll be deactivated instead so nothing breaks.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setRemovingId(null)}>Cancel</Button>
                <Button variant="danger" className="flex-1" onClick={() => handleRemoveStaff(removingId)}>Remove</Button>
              </div>
            </div>
          </div>
        )
      })()}

      {staffNotice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink text-paper px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg max-w-xs text-center">
          {staffNotice}
        </div>
      )}
    </div>
  )
}

function PermissionsModal({ staff, onClose }: { staff: StaffMember; onClose: () => void }) {
  const setPermission = useStaffStore((s) => s.setPermission)
  // Re-read the live staff record so toggles reflect immediately.
  const live = useStaffStore((s) => s.staff.find((x) => x.id === staff.id)) ?? staff

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-ticket text-lg font-bold">{live.name}'s access</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>
        <p className="text-xs text-ink/40 mb-4">What this person can open in the app — independent of their role label.</p>

        <div className="space-y-1">
          {FEATURES.map((f) => (
            <div key={f.key} className="flex items-center justify-between py-2 border-b border-ink/5 last:border-0">
              <span className="text-sm font-medium">{f.label}</span>
              <Toggle
                checked={live.permissions[f.key]}
                onChange={(v) => setPermission(live.id, f.key, v)}
              />
            </div>
          ))}
        </div>

        <Button className="w-full mt-5" onClick={onClose}>Done</Button>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-ember' : 'bg-ink/15'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}
