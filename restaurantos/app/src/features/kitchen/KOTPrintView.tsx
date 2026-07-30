import type { KitchenTicket } from './types'

export function KOTPrintView({ ticket }: { ticket: KitchenTicket | null }) {
  if (!ticket) return null

  return (
    <div data-theme="light" className="hidden print:block">
      <style>{`@page { size: 80mm auto; margin: 0 }`}</style>
      <div className="font-ticket text-ink bg-paper mx-auto" style={{ width: '72mm', padding: '3mm', fontSize: '11px', lineHeight: 1.4 }}>
        <div className="text-center mb-2">
          <div className="font-bold text-sm">KITCHEN ORDER TICKET</div>
          <div className="text-base font-bold mt-1">{ticket.tableLabel}</div>
          <div className="text-[10px]">{new Date().toLocaleString()}</div>
        </div>
        <div className="border-t border-dashed border-black/60 my-1.5" />
        {ticket.items.filter((item) => item.status !== 'served').map((item) => (
          <div key={item.id} className="py-1">
            <div className="flex justify-between font-semibold text-[11px]">
              <span>{item.quantity}× {item.name}</span>
            </div>
            {item.isComplimentary && <div className="text-[10px]">(Complimentary)</div>}
            {item.note && <div className="text-[10px]">Note: {item.note}</div>}
          </div>
        ))}
        <div className="border-t border-dashed border-black/60 my-1.5" />
      </div>
    </div>
  )
}
