import { useState } from 'react'
import { Delete } from 'lucide-react'

const STAFF = [
  { id: '1', name: 'Anjali', role: 'Manager', color: '#e8862e' },
  { id: '2', name: 'Bikash', role: 'Waiter', color: '#2a7fd4' },
  { id: '3', name: 'Sarita', role: 'Cashier', color: '#6d4fd6' },
  { id: '4', name: 'Prakash', role: 'Kitchen', color: '#1f9d55' },
]

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']

export function LoginPage() {
  const [selected, setSelected] = useState<string | null>(null)
  const [pin, setPin] = useState('')

  const staff = STAFF.find((s) => s.id === selected)

  function press(key: string) {
    if (key === 'back') return setPin((p) => p.slice(0, -1))
    if (key === '') return
    if (pin.length >= 4) return
    const next = pin + key
    setPin(next)
    if (next.length === 4) {
      // TODO: call the pin-verify Edge Function here — never verify client-side.
      setTimeout(() => setPin(''), 250)
    }
  }

  return (
    <div data-theme="dark" className="min-h-screen bg-ink text-paper flex flex-col items-center justify-center px-6">
      <div className="font-ticket text-sm tracking-[0.3em] text-ember mb-1">RESTAURANTOS</div>

      {!staff ? (
        <>
          <h1 className="text-xl font-bold mb-6">Who's working?</h1>
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            {STAFF.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 border border-white/10 py-5 hover:bg-white/10 active:scale-[0.97] transition-all"
              >
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg"
                  style={{ background: s.color }}
                >
                  {s.name[0]}
                </div>
                <div className="text-sm font-semibold">{s.name}</div>
                <div className="text-xs text-paper/50">{s.role}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div
            className="h-14 w-14 rounded-full flex items-center justify-center font-bold text-xl mb-3"
            style={{ background: staff.color }}
          >
            {staff.name[0]}
          </div>
          <h1 className="text-lg font-bold mb-1">{staff.name}</h1>
          <p className="text-sm text-paper/50 mb-6">Enter your PIN</p>

          <div className="flex gap-3 mb-8">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-3 w-3 rounded-full border border-white/30 ${i < pin.length ? 'bg-ember border-ember' : ''}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
            {KEYS.map((k, i) =>
              k === '' ? (
                <div key={i} />
              ) : (
                <button
                  key={i}
                  onClick={() => press(k)}
                  className="h-16 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center text-xl font-ticket font-semibold"
                >
                  {k === 'back' ? <Delete size={20} /> : k}
                </button>
              )
            )}
          </div>

          <button onClick={() => { setSelected(null); setPin('') }} className="mt-6 text-sm text-paper/50 hover:text-paper">
            Not {staff.name}?
          </button>
        </>
      )}
    </div>
  )
}
