// Rounds to the nearest whole rupee for display — this app never shows
// paisa. This also quietly erases the tiny binary floating-point residue
// that repeated JS arithmetic can leave behind (the classic
// 0.1 + 0.2 === 0.30000000000000004 problem): summing a cart's lines,
// splitting a bill by guest count, a running balance built up entry by
// entry, or a purchase's quantity × unit-cost lines can all produce a
// number like 16.000000000000004 that would otherwise render as
// "Rs. 16.000000000000004" instead of "Rs. 16".
//
// A value read straight from the database (an order's stored total, a
// customer's due balance) is already exact and doesn't need this, but
// rounding it anyway is harmless — so this is used everywhere a rupee
// amount is displayed, computed or not, rather than trying to track which
// values are "at risk" and which aren't.
export function money(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n)
}
