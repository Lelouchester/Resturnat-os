import { useKitchenStore } from './kitchenStore'
import { TicketCard } from './TicketCard'
import type { TicketStatus } from './types'

const COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready' },
]

export function KitchenPage() {
  const tickets = useKitchenStore((s) => s.tickets)
  const advanceTicket = useKitchenStore((s) => s.advanceTicket)

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="font-ticket text-xl font-bold">Kitchen</h1>
        <p className="text-sm text-ink/50">{tickets.length} active ticket{tickets.length === 1 ? '' : 's'}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const colTickets = tickets.filter((t) => t.status === col.status)
          return (
            <div key={col.status}>
              <div className="flex items-center gap-2 mb-3">
                <span className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">{col.label}</span>
                <span className="text-xs font-ticket bg-ink/5 rounded-full px-1.5 py-0.5 font-semibold">{colTickets.length}</span>
              </div>
              <div className="space-y-3">
                {colTickets.length === 0 && (
                  <p className="text-xs text-ink/30 italic py-6 text-center border border-dashed border-ink/10 rounded-2xl">
                    Nothing here
                  </p>
                )}
                {colTickets.map((t) => (
                  <TicketCard key={t.id} ticket={t} onAdvance={advanceTicket} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
