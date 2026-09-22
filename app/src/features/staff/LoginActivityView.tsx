import { useEffect, useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { Card } from '../../shared/ui/Card'
import { nepalToday, nepalDaysAgo, nepalDateKey, nepalDateKeyToLabel } from '../../shared/lib/nepalDate'
import { useStaffStore } from './staffStore'
import { ROLE_LABEL, ROLE_RANK } from './types'

// Administrator-only: who opened the app, and how often. The database
// refuses this data to anyone else, so this screen only ever renders for an
// administrator (StaffPage decides), and shows an error rather than partial
// data if the request is refused.

interface DayRow {
  staff_id: string
  day: string // YYYY-MM-DD, Nepal date
  visits: number
}

const RANGES = [7, 14, 30] as const
type Range = (typeof RANGES)[number]

// No visit for this many days is worth a second look.
const QUIET_DAYS = 7

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(toKey) - Date.parse(fromKey)) / 86_400_000)
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', hour12: true })
}

function describeLastSeen(iso: string | undefined, today: string): { text: string; quietDays: number | null } {
  if (!iso) return { text: 'Not seen yet', quietDays: null }
  const gap = daysBetween(nepalDateKey(iso), today)
  if (gap <= 0) return { text: `Today, ${timeLabel(iso)}`, quietDays: 0 }
  if (gap === 1) return { text: `Yesterday, ${timeLabel(iso)}`, quietDays: 1 }
  return { text: `${gap} days ago`, quietDays: gap }
}

function cellClass(visits: number): string {
  if (visits <= 0) return 'bg-ink/[0.07]'
  if (visits <= 2) return 'bg-ember/35'
  if (visits <= 5) return 'bg-ember/65'
  return 'bg-ember'
}

export function LoginActivityView() {
  const staff = useStaffStore((s) => s.staff)
  const [range, setRange] = useState<Range>(7)
  const [rows, setRows] = useState<DayRow[]>([])
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = nepalToday()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      supabase.rpc('login_activity', { p_from: nepalDaysAgo(range - 1), p_to: nepalToday() }),
      supabase.rpc('login_last_seen'),
    ]).then(([activity, seen]) => {
      if (cancelled) return
      if (activity.error || seen.error) {
        console.error('[LoginActivityView] load failed', activity.error ?? seen.error)
        setError("Couldn't load login activity — check your connection and try again.")
      } else {
        setRows((activity.data ?? []) as DayRow[])
        const map: Record<string, string> = {}
        for (const r of (seen.data ?? []) as { staff_id: string; last_seen: string }[]) map[r.staff_id] = r.last_seen
        setLastSeen(map)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [range])

  const days = useMemo(() => Array.from({ length: range }, (_, i) => nepalDaysAgo(range - 1 - i)), [range])

  const visitsByStaffDay = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const r of rows) {
      if (!m.has(r.staff_id)) m.set(r.staff_id, new Map())
      m.get(r.staff_id)!.set(r.day, r.visits)
    }
    return m
  }, [rows])

  // Highest level first, so shareholders sit together near the top.
  const people = useMemo(
    () =>
      staff
        .filter((s) => s.isActive)
        .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name)),
    [staff]
  )

  return (
    <Card className="p-5 mt-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">
          <Activity size={13} /> Login activity
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs font-semibold rounded-full px-2.5 py-1 ${range === r ? 'bg-ink text-paper' : 'bg-ink/5 text-ink/50 hover:bg-ink/10'}`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-ink/40 mb-4">
        Visible to you only. A visit is each time someone opens the app (several opens within 30 minutes count once). It shows how often people look in, not how long they stay. Counting started when this feature was installed, so earlier days show no activity.
      </p>

      {error ? (
        <p className="text-xs font-semibold text-status-cleaning bg-status-cleaning-bg rounded-xl px-3 py-2">{error}</p>
      ) : loading ? (
        <div className="h-24 rounded-xl bg-ink/5 animate-pulse" />
      ) : (
        <div className="space-y-3">
          {people.map((p) => {
            const perDay = visitsByStaffDay.get(p.id)
            const activeDays = days.filter((d) => (perDay?.get(d) ?? 0) > 0).length
            const totalVisits = days.reduce((sum, d) => sum + (perDay?.get(d) ?? 0), 0)
            const seen = describeLastSeen(lastSeen[p.id], today)
            const quiet = p.hasSignedIn && (seen.quietDays === null || seen.quietDays >= QUIET_DAYS)
            return (
              <div key={p.id} className="border-b border-ink/5 pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    <div className="text-xs text-ink/40">{ROLE_LABEL[p.role]}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-ink/70">{seen.text}</div>
                    {!p.hasSignedIn ? (
                      <div className="text-[11px] font-semibold text-status-occupied">Hasn't signed in yet</div>
                    ) : quiet ? (
                      <div className="text-[11px] font-semibold text-status-cleaning">
                        {seen.quietDays === null ? 'No visits recorded' : `Not seen for ${seen.quietDays} days`}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-[3px] flex-wrap mb-1">
                  {days.map((d) => {
                    const n = perDay?.get(d) ?? 0
                    return (
                      <div
                        key={d}
                        title={`${nepalDateKeyToLabel(d)}: ${n} visit${n === 1 ? '' : 's'}`}
                        className={`h-4 rounded-[4px] ${cellClass(n)}`}
                        style={{ width: range === 30 ? 14 : 22 }}
                      />
                    )
                  })}
                </div>
                <div className="text-[11px] text-ink/40">
                  Active {activeDays} of {range} days · {totalVisits} visit{totalVisits === 1 ? '' : 's'}
                </div>
              </div>
            )
          })}
          {people.length === 0 && <p className="text-xs text-ink/40">No active staff.</p>}
        </div>
      )}
    </Card>
  )
}
