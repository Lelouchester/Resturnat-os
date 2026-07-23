import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { StatusPill } from '../../shared/ui/StatusPill'
import type { RestaurantTable } from './types'

function useElapsedMinutes(since?: string) {
  const [minutes, setMinutes] = useState(0)
  useEffect(() => {
    if (!since) return
    const tick = () => setMinutes(Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000)))
    tick()
    const id = setInterval(tick, 15000)
    return () => clearInterval(id)
  }, [since])
  return minutes
}

export function TableCard({ table, onSelect }: { table: RestaurantTable; onSelect: (id: string) => void }) {
  const minutes = useElapsedMinutes(table.seatedAt)
  const timeTone = minutes > 90 ? 'text-status-cleaning' : minutes > 45 ? 'text-status-occupied' : 'text-status-available'

  return (
    <Card
      as="button"
      onClick={() => onSelect(table.id)}
      className="ticket-edge relative w-full text-left p-4 pt-5 hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_32px_-14px_rgba(0,0,0,0.18)] transition-all duration-150 cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className="font-ticket text-2xl font-bold tracking-tight">{table.label}</div>
        <StatusPill status={table.status} />
      </div>

      {table.customerName && (
        <div className="mt-2 text-sm font-medium text-ink/80 truncate">{table.customerName}</div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-ink/50">
        <div className="flex items-center gap-1">
          <Users size={13} />
          <span className="font-ticket">{table.guestCount ?? table.seats}</span>
        </div>
        {table.seatedAt && (
          <div className={`font-ticket font-semibold ${timeTone}`}>{minutes}m</div>
        )}
        {typeof table.runningTotal === 'number' && (
          <div className="font-ticket font-semibold">Rs. {table.runningTotal}</div>
        )}
      </div>
    </Card>
  )
}
