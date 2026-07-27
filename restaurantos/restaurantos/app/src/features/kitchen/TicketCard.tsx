import { useEffect, useState } from 'react'
import { Flame, Gift, Printer } from 'lucide-react'
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

export function TicketCard({
  ticket,
  onMarkItem,
  onPrint,
}: {
  ticket: KitchenTicket
  onMarkItem: (itemId: string) => void
  onPrint: (ticket: KitchenTicket) => void
}) {
  const minutes = useElapsedMinutes(ticket.firedAt)
  const urgent = !ticket.allServed && minutes >= 12
  const warm = !ticket.allServed && minutes >= 6

  return (
    <Card className={`ticket-edge p-4 pt-5 ${urgent ? 'ring-2 ring-status-cleaning' : ''} ${ticket.allServed ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="font-ticket text-lg font-bold">{ticket.tableLabel}</div>
        <div className="flex items-center gap-2">
          <button onClick={() => onPrint(ticket)} className="text-ink/30 hover:text-ink" title="Print KOT">
            <Printer size={15} />
          </button>
          {ticket.allServed ? (
            <div className="flex items-center gap-1 font-ticket text-xs font-bold px-2 py-0.5 rounded-full bg-ink/5 text-ink/40">
              Waiting on billing
            </div>
          ) : (
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
          )}
        </div>
      </div>

      <ul className="space-y-1">
        {ticket.items.map((item) => {
          const done = item.status === 'served'
          return (
            <li key={item.id}>
              <button
                onClick={() => !done && onMarkItem(item.id)}
                disabled={done}
                className={`w-full flex items-start gap-2.5 text-left py-1.5 rounded-lg px-1 -mx-1 ${done ? '' : 'hover:bg-ink/5'}`}
              >
                <span
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                    done ? 'border-ink/15 bg-ink/10' : 'border-ink/25'
                  }`}
                >
                  {done && <span className="h-1.5 w-1.5 rounded-full bg-ink/30" />}
                </span>
                <span className={`flex-1 text-sm ${done ? 'line-through text-ink/35' : ''}`}>
                  <span className="font-ticket font-semibold">{item.quantity}×</span>{' '}
                  <span className="font-medium">{item.name}</span>
                  {item.isComplimentary && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-ember align-middle">
                      <Gift size={11} /> COMP
                    </span>
                  )}
                  {item.note && !done && <div className="text-xs text-ember mt-0.5">📝 {item.note}</div>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="mt-2.5 text-[11px] text-ink/35">Tap an item once it's plated and served.</p>
    </Card>
  )
}
