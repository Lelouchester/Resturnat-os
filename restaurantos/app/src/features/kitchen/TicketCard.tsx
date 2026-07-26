import { useEffect, useState } from 'react'
import { Flame, Gift, Check } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import type { KitchenTicket } from './types'

function useElapsedMinutes(since: string) {
  const [minutes, setMinutes] = useState(0)
  useEffect(() => {
    const tick = () => setMinutes(Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000)))
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [since])
  return minutes
}

export function TicketCard({ ticket, onMarkServed }: { ticket: KitchenTicket; onMarkServed: (orderId: string, itemIds: string[]) => void }) {
  const minutes = useElapsedMinutes(ticket.firedAt)
  const urgent = minutes >= 12
  const warm = minutes >= 6

  return (
    <Card className={`ticket-edge p-4 pt-5 ${urgent ? 'ring-2 ring-status-cleaning' : ''}`}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="font-ticket text-lg font-bold">{ticket.tableLabel}</div>
        <div
          className={`flex items-center gap-1 font-ticket text-xs font-bold px-2 py-0.5 rounded-full ${
            urgent
              ? 'bg-status-cleaning-bg text-status-cleaning'
              : warm
              ? 'bg-status-occupied-bg text-status-occupied'
              : 'bg-status-available-bg text-status-available'
          }`}
        >
          {urgent && <Flame size={11} />}
          {minutes}m
        </div>
      </div>

      <ul className="space-y-1.5 mb-4">
        {ticket.items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-ticket font-semibold">{item.quantity}×</span>{' '}
            <span className="font-medium">{item.name}</span>
            {item.isComplimentary && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-ember align-middle">
                <Gift size={11} /> COMP
              </span>
            )}
            {item.note && <div className="text-xs text-ember pl-5">📝 {item.note}</div>}
          </li>
        ))}
      </ul>

      <button
        onClick={() => onMarkServed(ticket.orderId, ticket.items.map((i) => i.id))}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold bg-ink text-paper hover:bg-black active:scale-[0.98] transition-all"
      >
        <Check size={15} /> Mark served
      </button>
    </Card>
  )
}
