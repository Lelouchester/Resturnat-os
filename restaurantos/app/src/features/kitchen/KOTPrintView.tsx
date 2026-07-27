import type { KitchenTicket } from './types'

export function KOTPrintView({ ticket }: { ticket: KitchenTicket | null }) {
  if (!ticket) return null

  return (
    <div data-theme="light" className="hidden print:block font-ticket text-sm p-6 max-w-xs mx-auto text-ink bg-paper">
      <div className="text-center mb-3">
        <div className="font-bold text-base">KITCHEN ORDER TICKET</div>
        <div className="text-lg font-bold mt-1">{ticket.tableLabel}</div>
        <div className="text-xs">{new Date().toLocaleString()}</div>
      </div>
      <div className="border-t border-dashed border-ink/30 my-2" />
      {ticket.items.filter((item) => item.status !== 'served').map((item) => (
        <div key={item.id} className="py-1.5">
          <div className="flex justify-between font-semibold">
            <span>{item.quantity}× {item.name}</span>
          </div>
          {item.isComplimentary && <div className="text-xs">(Complimentary)</div>}
          {item.note && <div className="text-xs">Note: {item.note}</div>}
        </div>
      ))}
      <div className="border-t border-dashed border-ink/30 my-2" />
    </div>
  )
}
