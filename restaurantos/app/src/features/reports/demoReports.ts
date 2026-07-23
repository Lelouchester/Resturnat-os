// Demo report data — once billing/orders write real rows, these become
// actual aggregate queries (grouped by day, by item, by payment method, by
// hour) instead of hardcoded arrays. The shape stays the same.

export const REVENUE_TREND = [
  { day: 'Wed', revenue: 38200 },
  { day: 'Thu', revenue: 41500 },
  { day: 'Fri', revenue: 52800 },
  { day: 'Sat', revenue: 61200 },
  { day: 'Sun', revenue: 55400 },
  { day: 'Mon', revenue: 34600 },
  { day: 'Tue', revenue: 39800 },
]

export const TOP_ITEMS = [
  { name: 'Chicken sekuwa', qty: 86, revenue: 36120 },
  { name: 'Chicken momo (steamed)', qty: 142, revenue: 31240 },
  { name: 'Mutton curry', qty: 51, revenue: 28560 },
  { name: 'Chicken chilli', qty: 64, revenue: 24320 },
  { name: 'Veg thali', qty: 58, revenue: 18560 },
]

export const SLOW_MOVERS = [
  { name: 'Gulab jamun', qty: 6 },
  { name: 'Kheer', qty: 8 },
  { name: 'Veg spring roll', qty: 11 },
]

export const PAYMENT_SPLIT = [
  { method: 'Cash', value: 58940, color: '#1f9d55' },
  { method: 'eSewa', value: 32450, color: '#2a7fd4' },
  { method: 'Fonepay', value: 19640, color: '#e8862e' },
]

export const PEAK_HOURS = [
  { hour: '12pm', orders: 8 },
  { hour: '1pm', orders: 14 },
  { hour: '2pm', orders: 6 },
  { hour: '6pm', orders: 12 },
  { hour: '7pm', orders: 26 },
  { hour: '8pm', orders: 31 },
  { hour: '9pm', orders: 19 },
]

export const TABLE_TURNOVER = [
  { table: 'Table 1', avgMinutes: 52, turns: 3 },
  { table: 'Table 4', avgMinutes: 74, turns: 2 },
  { table: 'Table 6', avgMinutes: 41, turns: 4 },
  { table: 'Table 8', avgMinutes: 96, turns: 1 },
]

export const KITCHEN_PERFORMANCE = {
  avgPrepMinutes: 11,
  onTimePct: 87,
}
