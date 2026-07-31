import { useEffect, useState } from 'react'
import { Users, ArrowRightLeft, Merge, SprayCan, UserPlus, Trash2 } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { StatusPill } from '../../shared/ui/StatusPill'
import type { TableStatus } from '../../shared/ui/StatusPill'
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

// Full literal class strings (not built dynamically) so Tailwind's scanner
// picks them up — one glance at a floor full of tables should read status
// without needing to check the small pill text.
const CARD_TONE: Record<TableStatus, string> = {
  available: 'bg-status-available-bg/40 border-status-available/20',
  occupied: 'bg-status-occupied-bg/50 border-status-occupied/25',
  reserved: 'bg-status-reserved-bg/50 border-status-reserved/25',
  billing: 'bg-status-billing-bg/50 border-status-billing/25',
  needs_cleaning: 'bg-status-cleaning-bg/50 border-status-cleaning/25',
  disabled: 'bg-status-disabled-bg/60 border-status-disabled/20',
}

export function TableCard({
  table,
  onSelect,
  onMove,
  onMerge,
  onMarkCleaned,
  onAssignCustomer,
  onRemove,
  runningTotal,
}: {
  table: RestaurantTable
  onSelect: (id: string) => void
  onMove?: (id: string) => void
  onMerge?: (id: string) => void
  onMarkCleaned?: (id: string) => void
  onAssignCustomer?: (id: string) => void
  onRemove?: (id: string) => void
  runningTotal?: number
}) {
  const minutes = useElapsedMinutes(table.seatedAt)
  const timeTone = minutes > 90 ? 'text-status-cleaning' : minutes > 45 ? 'text-status-occupied' : 'text-status-available'
  const showQuickActions = (table.status === 'occupied' || table.status === 'billing') && (onMove || onMerge || onAssignCustomer)
  const showCleanedAction = table.status === 'needs_cleaning' && onMarkCleaned
  const showRemoveAction = (table.status === 'available' || table.status === 'needs_cleaning') && onRemove

  return (
    <Card
      as="button"
      onClick={() => onSelect(table.id)}
      disabled={table.status === 'disabled'}
      className={`ticket-edge relative w-full text-left p-4 pt-5 border transition-all duration-150 ${CARD_TONE[table.status]} ${
        table.status === 'disabled' ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_32px_-14px_rgba(0,0,0,0.18)] cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="font-ticket text-2xl font-bold tracking-tight">{table.label}</div>
        <div className="flex items-center gap-1.5">
          <StatusPill status={table.status} />
          {showRemoveAction && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onRemove!(table.id) }}
              onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), onRemove!(table.id))}
              className="text-ink/25 hover:text-status-cleaning"
              title="Remove table"
            >
              <Trash2 size={14} />
            </span>
          )}
        </div>
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
        {typeof runningTotal === 'number' && runningTotal > 0 && (
          <div className="font-ticket font-semibold">Rs. {runningTotal}</div>
        )}
      </div>

      {showQuickActions && (
        <div className="mt-3 pt-2.5 border-t border-ink/5 flex items-center gap-3">
          {onMove && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onMove(table.id) }}
              onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), onMove(table.id))}
              className="flex items-center gap-1 text-[11px] font-semibold text-ink/50 hover:text-ink"
            >
              <ArrowRightLeft size={12} /> Move
            </span>
          )}
          {onMerge && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onMerge(table.id) }}
              onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), onMerge(table.id))}
              className="flex items-center gap-1 text-[11px] font-semibold text-ink/50 hover:text-ink"
            >
              <Merge size={12} /> Merge
            </span>
          )}
          {onAssignCustomer && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onAssignCustomer(table.id) }}
              onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), onAssignCustomer(table.id))}
              className="flex items-center gap-1 text-[11px] font-semibold text-ink/50 hover:text-ink"
            >
              <UserPlus size={12} /> Customer
            </span>
          )}
        </div>
      )}

      {showCleanedAction && (
        <div className="mt-3 pt-2.5 border-t border-ink/5">
          <button
            onClick={(e) => { e.stopPropagation(); onMarkCleaned!(table.id) }}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-status-cleaning-bg text-status-cleaning py-1.5 text-xs font-semibold hover:brightness-95"
          >
            <SprayCan size={13} /> Mark cleaned
          </button>
        </div>
      )}
    </Card>
  )
}
