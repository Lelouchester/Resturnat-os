import { useMemo, useState } from 'react'
import type { CartLine } from './types'
import type { MenuItem } from '../menu/types'

/**
 * Cart state for a single table's in-progress order.
 * Kept local to the Orders screen for now — once billing/shifts are wired up,
 * this becomes the payload written to `orders` + `order_items` on submit.
 */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([])

  function addItem(item: MenuItem) {
    setLines((current) => {
      const existing = current.find((l) => l.menuItemId === item.id && !l.note && l.status === 'active')
      if (existing) {
        return current.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l))
      }
      return [...current, { key: `${item.id}-${Date.now()}`, menuItemId: item.id, name: item.name, unitPrice: item.price, quantity: 1, status: 'active' }]
    })
  }

  function addCustomItem(name: string, price: number) {
    const key = `custom-${Date.now()}`
    setLines((current) => [...current, { key, menuItemId: key, name, unitPrice: price, quantity: 1, status: 'active' }])
  }

  function adjustQuantity(key: string, delta: number) {
    setLines((current) =>
      current
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    )
  }

  function setNote(key: string, note: string) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, note } : l)))
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((l) => l.key !== key))
  }

  // Void: kitchen already made it (or it's being pulled), no revenue — kept
  // on the ticket as a record rather than silently deleted, for the void report.
  function markVoid(key: string, reason: string) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, status: 'void', voidReason: reason } : l)))
  }

  // Complimentary: still made and served, just not charged — shows on the
  // kitchen ticket and the bill, at Rs. 0.
  function markComplimentary(key: string) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, status: l.status === 'complimentary' ? 'active' : 'complimentary' } : l)))
  }

  function clear() {
    setLines([])
  }

  const billableLines = useMemo(() => lines.filter((l) => l.status !== 'void'), [lines])
  const subtotal = useMemo(
    () => billableLines.reduce((sum, l) => sum + (l.status === 'complimentary' ? 0 : l.unitPrice * l.quantity), 0),
    [billableLines]
  )
  const itemCount = useMemo(() => billableLines.reduce((sum, l) => sum + l.quantity, 0), [billableLines])

  return { lines, addItem, addCustomItem, adjustQuantity, setNote, removeLine, markVoid, markComplimentary, clear, subtotal, itemCount }
}
