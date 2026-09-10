/**
 * Every place in this app that groups things "by day" (revenue trends,
 * purchase patterns, shift boundaries) needs to agree on which calendar
 * day a given moment falls on. The naive way — new Date(x).toLocaleDateString()
 * or .getFullYear()/.getMonth()/.getDate() — silently uses whatever
 * timezone the viewing device happens to be set to. Most of the time
 * that's fine, since staff are physically in Nepal. But a transaction in
 * the first ~6 hours after midnight Nepal time (00:00–05:45) falls on the
 * *previous* UTC calendar day — so any device whose clock/timezone isn't
 * exactly Nepal (a phone with a wrong region setting, a stale PWA cache,
 * anyone checking reports while travelling) buckets that transaction into
 * the wrong day, and two people looking at the same data can disagree
 * about which day something happened on. This is what caused the
 * recurring "trend line is broken" reports — sorting was fixed before,
 * but the day-grouping itself was still implicitly device-dependent.
 *
 * Fix: always compute the calendar day explicitly in Asia/Kathmandu,
 * never relying on the device's local timezone. Use these two functions
 * anywhere a timestamp needs to become "which day is this."
 */

const NEPAL_TZ = 'Asia/Kathmandu'

// 'YYYY-MM-DD' in Nepal time — safe to sort as a plain string, and stable
// no matter which device generates or reads it.
export function nepalDateKey(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input
  // en-CA formats as YYYY-MM-DD directly, which is both what we want to
  // store/sort AND avoids hand-rolling padding/format logic ourselves.
  return new Intl.DateTimeFormat('en-CA', { timeZone: NEPAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

// Pretty display label ("Sep 5") for a raw timestamp — always resolved in
// Nepal time, so the label always matches whatever nepalDateKey() would
// produce for the same instant.
export function nepalDateLabel(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input
  return new Intl.DateTimeFormat(undefined, { timeZone: NEPAL_TZ, month: 'short', day: 'numeric' }).format(date)
}

// Same label, but starting from a 'YYYY-MM-DD' key (e.g. one produced by
// nepalDateKey()) rather than a raw timestamp — anchored to noon Nepal
// time so it can't accidentally round to the wrong side of a day boundary
// when re-parsed.
export function nepalDateKeyToLabel(key: string): string {
  return nepalDateLabel(new Date(`${key}T12:00:00+05:45`))
}

// "Today," in Nepal time — never new Date() interpreted through the
// device's own timezone. This matters most in the few hours after
// midnight Nepal time: a device set to UTC (or anywhere west of Nepal)
// would otherwise compute "today" as still being yesterday until as late
// as 5:45am Nepal time, silently shifting every default report range by
// a day for that whole window, every single day.
export function nepalToday(): string {
  return nepalDateKey(new Date())
}

// N days before a given (or today's) nepalDateKey, still as a
// 'YYYY-MM-DD' key — pure calendar arithmetic, done on the Y-M-D triplet
// itself rather than by subtracting milliseconds from an instant, so it
// can't be thrown off by any timezone conversion at all.
export function nepalDaysAgo(days: number, fromKey: string = nepalToday()): string {
  const [y, m, d] = fromKey.split('-').map(Number)
  const asUTC = new Date(Date.UTC(y, m - 1, d))
  asUTC.setUTCDate(asUTC.getUTCDate() - days)
  return `${asUTC.getUTCFullYear()}-${String(asUTC.getUTCMonth() + 1).padStart(2, '0')}-${String(asUTC.getUTCDate()).padStart(2, '0')}`
}

// The Sunday that starts the week containing a given Nepal date key — for
// weekly-bucketed trends over long ranges. Same pure Y-M-D arithmetic as
// nepalDaysAgo, for the same reason: no timezone conversion involved at
// all, so there's nothing for a device's clock/region to get wrong.
export function nepalWeekStartKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const asUTC = new Date(Date.UTC(y, m - 1, d))
  asUTC.setUTCDate(asUTC.getUTCDate() - asUTC.getUTCDay())
  return `${asUTC.getUTCFullYear()}-${String(asUTC.getUTCMonth() + 1).padStart(2, '0')}-${String(asUTC.getUTCDate()).padStart(2, '0')}`
}

// Absolute UTC instants for the very start and very end of a Nepal
// calendar day — this is what should actually go into a .gte()/.lte()
// query against a timestamptz column. Passing a bare "2026-08-11T00:00:00"
// string to Supabase without an offset gets interpreted using the
// database session's timezone (UTC), not Nepal's — silently shifting
// every range boundary by 5 hours 45 minutes. Always build query bounds
// through these, never by hand.
export function nepalDayStartUTC(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00+05:45`).toISOString()
}
export function nepalDayEndUTC(dateKey: string): string {
  return new Date(`${dateKey}T23:59:59.999+05:45`).toISOString()
}
