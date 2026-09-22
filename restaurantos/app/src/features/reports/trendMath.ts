import { nepalDaysAgo } from '../../shared/lib/nepalDate'

// Pure date/number helpers for the Trends summary — kept separate from the
// component so they can be tested on their own.

// How many calendar days a range covers, counting both ends. 0 if the range
// is backwards or either date is missing/invalid (a half-typed custom range).
export function daysInRange(from: string, to: string): number {
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000
  if (!Number.isFinite(span) || span < 0) return 0
  return Math.round(span) + 1
}

// The stretch of the same length that ends the day before `from` — what a
// range is compared against ("this week vs the week before").
export function previousRange(from: string, to: string): { from: string; to: string } | null {
  const days = daysInRange(from, to)
  if (days === 0) return null
  return { from: nepalDaysAgo(days, from), to: nepalDaysAgo(1, from) }
}

// Percent change from `previous` to `current`, or null when there's nothing
// to compare against (previous was zero) — never Infinity or NaN.
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / previous) * 100
}
