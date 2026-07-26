import { useMemo } from 'react'
import { useInventoryStore } from '../inventory/inventoryStore'
import { useCustomersStore } from '../customers/customersStore'
import { useReservationsStore } from '../reservations/reservationsStore'
import { useOrdersStore } from '../orders/ordersStore'
import { buildKitchenTickets } from '../kitchen/selectors'
import { usePurchasingStore } from '../purchasing/purchasingStore'
import { useSettingsStore } from '../settings/settingsStore'
import { useDismissedStore } from './dismissedStore'
import type { AppNotification } from './types'

const READY_TICKET_STALE_MINUTES = 5
const RESERVATION_SOON_MINUTES = 60

/**
 * Every notification here is computed from data that already exists
 * elsewhere in the app — nothing is duplicated or can drift out of sync.
 * Add a low-stock item, log an overdue customer, or let a kitchen ticket
 * sit too long, and it shows up here automatically.
 */
export function useNotifications(): AppNotification[] {
  const inventoryItems = useInventoryStore((s) => s.items)
  const customers = useCustomersStore((s) => s.customers)
  const reservations = useReservationsStore((s) => s.reservations)
  const orders = useOrdersStore((s) => s.orders)
  const tickets = useMemo(() => buildKitchenTickets(orders), [orders])
  const purchases = usePurchasingStore((s) => s.purchases)
  const dueReminderDays = useSettingsStore((s) => s.dueReminderDays)
  const dismissedIds = useDismissedStore((s) => s.dismissedIds)

  return useMemo(() => {
    const list: AppNotification[] = []

    inventoryItems
      .filter((i) => i.currentStock <= i.minStock)
      .forEach((i) =>
        list.push({ id: `low-stock-${i.id}`, tone: 'warning', message: `${i.name} is at or below minimum stock`, linkTo: '/inventory' })
      )

    customers
      .filter((c) => c.outstandingDue > 0 && c.dueSince && daysSince(c.dueSince) >= dueReminderDays)
      .forEach((c) =>
        list.push({
          id: `due-${c.id}`,
          tone: 'warning',
          message: `${c.name ?? 'Walk-in customer'} has Rs. ${c.outstandingDue} due (${daysSince(c.dueSince!)}d)`,
          linkTo: '/customers',
        })
      )

    reservations
      .filter((r) => r.status === 'upcoming' && minutesUntil(r.arrivalTime) <= RESERVATION_SOON_MINUTES && minutesUntil(r.arrivalTime) >= 0)
      .forEach((r) =>
        list.push({
          id: `reservation-${r.id}`,
          tone: 'info',
          message: `${r.guestName} (${r.partySize}) arriving around ${new Date(r.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          linkTo: '/tables',
        })
      )

    tickets
      .filter((t) => t.status === 'ready' && minutesSince(t.firedAt) >= READY_TICKET_STALE_MINUTES)
      .forEach((t) =>
        list.push({ id: `ticket-ready-${t.id}`, tone: 'warning', message: `${t.tableLabel}'s order has been ready to serve for a while`, linkTo: '/kitchen' })
      )

    purchases
      .filter((p) => p.status === 'received' && minutesSince(p.createdAt) <= 60)
      .forEach((p) =>
        list.push({ id: `purchase-received-${p.id}`, tone: 'success', message: `New purchase received — Inventory updated`, linkTo: '/purchasing' })
      )

    return list.filter((n) => !dismissedIds.has(n.id))
  }, [inventoryItems, customers, reservations, tickets, purchases, dueReminderDays, dismissedIds])
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function minutesSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}
function minutesUntil(iso: string) {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 60000)
}
