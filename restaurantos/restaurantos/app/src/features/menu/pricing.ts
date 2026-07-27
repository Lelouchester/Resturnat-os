import type { MenuItem } from './types'

/** True right now if the current clock time falls inside the item's happy-hour window. */
export function isHappyHourActive(item: MenuItem, now = new Date()): boolean {
  if (!item.happyHour) return false
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = item.happyHour.startTime.split(':').map(Number)
  const [eh, em] = item.happyHour.endTime.split(':').map(Number)
  const start = sh * 60 + sm
  const end = eh * 60 + em
  return start <= end ? minutesNow >= start && minutesNow < end : minutesNow >= start || minutesNow < end // handles windows crossing midnight
}

/** The price to actually charge right now — happy hour if active, otherwise the listed price. */
export function effectivePrice(item: MenuItem, now = new Date()): number {
  return isHappyHourActive(item, now) ? item.happyHour!.price : item.price
}
