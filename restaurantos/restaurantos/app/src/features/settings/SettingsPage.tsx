import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { useSettingsStore } from './settingsStore'

export function SettingsPage() {
  const settings = useSettingsStore()
  const initProfile = useSettingsStore((s) => s.initProfile)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    initProfile()
  }, [initProfile])

  function handleChange(patch: Partial<typeof settings>) {
    settings.update(patch)
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  if (settings.profileLoading) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
        <div className="mb-4">
          <h1 className="font-ticket text-xl font-bold">Settings</h1>
        </div>
        <div className="h-40 rounded-2xl bg-ink/5 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-16">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-ticket text-xl font-bold">Settings</h1>
          <p className="text-sm text-ink/50">Restaurant profile, taxes, receipts, and defaults</p>
        </div>
        {saved && <span className="text-xs font-semibold text-status-available">Saved</span>}
      </div>

      <Section title="Restaurant profile" note="Shown across receipts and, once multiple locations are set up, used to tell them apart.">
        <Field label="Name">
          <input value={settings.name} onChange={(e) => handleChange({ name: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Address">
          <input value={settings.address} onChange={(e) => handleChange({ address: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Phone">
          <input value={settings.phone} onChange={(e) => handleChange({ phone: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Slogan">
          <input
            value={settings.slogan}
            onChange={(e) => handleChange({ slogan: e.target.value })}
            placeholder="e.g. Kathmandu's cosiest corner"
            className={inputClass}
          />
        </Field>
        <Field label="Notes">
          <textarea
            value={settings.notes}
            onChange={(e) => handleChange({ notes: e.target.value })}
            placeholder="Anything worth remembering about this location"
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </Field>
      </Section>

      <Section title="Business hours">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens">
            <input type="time" value={settings.openTime} onChange={(e) => handleChange({ openTime: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Closes">
            <input type="time" value={settings.closeTime} onChange={(e) => handleChange({ closeTime: e.target.value })} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="Tax & service charge defaults" note="Used to pre-fill Billing — still adjustable per bill.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default tax %">
            <input type="number" value={settings.defaultTaxPct} onChange={(e) => handleChange({ defaultTaxPct: Number(e.target.value) || 0 })} className={inputClass} />
          </Field>
          <Field label="Default service charge %">
            <input type="number" value={settings.defaultServiceChargePct} onChange={(e) => handleChange({ defaultServiceChargePct: Number(e.target.value) || 0 })} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="Receipt">
        <Field label="Footer message">
          <input value={settings.receiptFooter} onChange={(e) => handleChange({ receiptFooter: e.target.value })} className={inputClass} />
        </Field>
      </Section>

      <Section title="Payment methods" note="Add or remove what shows up in Billing, Shifts, and Purchasing — everywhere money is split or counted.">
        <PaymentMethodsEditor />
      </Section>

      <Section title="Customer dues" note="Used for a reminder nudge on the Customers screen — doesn't affect anything automatically, just surfaces who's overdue.">
        <Field label="Remind about dues older than (days)">
          <input type="number" value={settings.dueReminderDays} onChange={(e) => handleChange({ dueReminderDays: Number(e.target.value) || 0 })} className={inputClass} />
        </Field>
      </Section>

      <Section title="Theme" note="Applies everywhere — try switching it and watch the whole app repaint, not just this page.">
        <div className="flex rounded-xl bg-ink/5 p-1 w-fit">
          <button
            onClick={() => handleChange({ theme: 'light' })}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${settings.theme === 'light' ? 'bg-surface shadow-sm' : 'text-ink/50'}`}
          >
            Light
          </button>
          <button
            onClick={() => handleChange({ theme: 'dark' })}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${settings.theme === 'dark' ? 'bg-surface shadow-sm' : 'text-ink/50'}`}
          >
            Dark
          </button>
        </div>
      </Section>

      <Section title="Brand color" note="The one accent color used throughout the app — match it to this cafe's branding.">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={settings.brandColor}
            onChange={(e) => handleChange({ brandColor: e.target.value })}
            className="h-11 w-16 rounded-lg border border-ink/10 cursor-pointer bg-transparent"
          />
          <input
            value={settings.brandColor}
            onChange={(e) => handleChange({ brandColor: e.target.value })}
            className={`${inputClass} font-ticket`}
          />
        </div>
      </Section>
    </div>
  )
}

const inputClass = "w-full text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"

function PaymentMethodsEditor() {
  const paymentMethods = useSettingsStore((s) => s.paymentMethods)
  const addPaymentMethod = useSettingsStore((s) => s.addPaymentMethod)
  const removePaymentMethod = useSettingsStore((s) => s.removePaymentMethod)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  function handleAdd() {
    if (!name.trim()) return
    addPaymentMethod(name.trim())
    setName('')
    setAdding(false)
  }

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-3">
        {paymentMethods.map((m) => (
          <span key={m.key} className="flex items-center gap-1.5 text-xs font-semibold rounded-full bg-status-available-bg text-status-available px-3 py-1.5">
            {m.label}
            <button onClick={() => removePaymentMethod(m.key)} className="hover:text-status-cleaning">
              <X size={12} />
            </button>
          </span>
        ))}
        {paymentMethods.length === 0 && <p className="text-xs text-ink/40">No payment methods yet — billing can't take payment without at least one.</p>}
      </div>
      {!adding ? (
        <button onClick={() => setAdding(true)} className="text-xs font-semibold text-ember">+ Add payment method</button>
      ) : (
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. IME Pay, Bank transfer"
            className={inputClass}
          />
          <button onClick={handleAdd} className="text-xs font-semibold text-ember shrink-0">Add</button>
        </div>
      )}
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card className="p-4 mb-3">
      <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-1">{title}</div>
      {note && <p className="text-xs text-ink/40 mb-3">{note}</p>}
      <div className={note ? '' : 'mt-3'}>{children}</div>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-3 last:mb-0">
      <span className="text-xs font-semibold text-ink/50 mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}
