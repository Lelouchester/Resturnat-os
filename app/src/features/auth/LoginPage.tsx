import { useEffect, useState } from 'react'
import { useAuthStore, getSavedCafeCode, lookupCafeByCode } from './authStore'

export function LoginPage() {
  const status = useAuthStore((s) => s.status)
  const session = useAuthStore((s) => s.session)
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle)
  const signOut = useAuthStore((s) => s.signOut)

  const [code, setCode] = useState(() => getSavedCafeCode())
  const [cafe, setCafe] = useState<{ id: string; name: string } | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkedEmpty, setCheckedEmpty] = useState(false) // true once a lookup for the current code has come back with nothing

  useEffect(() => {
    const trimmed = code.trim()
    if (!trimmed) {
      setCafe(null)
      setCheckedEmpty(false)
      return
    }
    setChecking(true)
    setCheckedEmpty(false)
    const timeout = setTimeout(async () => {
      const result = await lookupCafeByCode(trimmed)
      setCafe(result)
      setCheckedEmpty(!result)
      setChecking(false)
    }, 350) // small debounce so it's not firing a query on every keystroke
    return () => clearTimeout(timeout)
  }, [code])

  return (
    <div data-theme="dark" className="min-h-screen bg-ink text-paper flex flex-col items-center justify-center px-6 text-center">
      <div className="font-ticket text-sm tracking-[0.3em] text-ember mb-8">RESTAURANTOS</div>

      {status === 'unauthorized' ? (
        <>
          <div className="h-14 w-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-2xl">
            🔒
          </div>
          <h1 className="text-lg font-bold mb-1">Not set up yet</h1>
          <p className="text-sm text-paper/50 mb-1 max-w-xs">
            Signed in as <span className="text-paper/80">{session?.user.email}</span>, but this email isn't on the staff list for this cafe yet.
          </p>
          <p className="text-sm text-paper/50 mb-6 max-w-xs">Double-check the cafe code was right, or ask a manager to add you in Staff, then sign in again.</p>
          <button onClick={signOut} className="text-sm font-semibold text-paper/60 hover:text-paper underline">
            Sign out
          </button>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold mb-2">Welcome back</h1>
          <p className="text-sm text-paper/50 mb-6">Enter your cafe's code, then sign in with the Google account your manager set up for you.</p>

          <div className="w-full max-w-xs mb-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Cafe code — e.g. myhapa"
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full text-center text-sm bg-white/5 border border-white/10 rounded-2xl px-4 py-3 outline-none focus:border-ember placeholder:text-paper/30"
            />
          </div>
          <div className="h-5 mb-6 text-xs">
            {checking && <span className="text-paper/30">Checking…</span>}
            {!checking && cafe && <span className="text-status-available">→ {cafe.name}</span>}
            {!checking && checkedEmpty && <span className="text-status-cleaning">Cafe not found — check the code</span>}
          </div>

          <button
            onClick={() => signInWithGoogle(code)}
            disabled={!cafe}
            className="flex items-center gap-3 rounded-2xl bg-white text-ink px-6 py-3.5 font-semibold hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <GoogleIcon />
            Sign in with Google
          </button>
        </>
      )}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59A8.62 8.62 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}
