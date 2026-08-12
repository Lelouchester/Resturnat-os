import type { KitchenTicket } from './types'

export function KOTPrintView({ ticket }: { ticket: KitchenTicket | null }) {
  if (!ticket) return null

  const activeItems = ticket.items.filter((item) => item.status !== 'served')
  const newItems = activeItems.filter((item) => !item.kotPrintedAt)
  const alreadySentItems = activeItems.filter((item) => item.kotPrintedAt)
  // Only split into two sections when there's actually a mix — a ticket
  // that's entirely new (first print) or entirely already-sent (nothing new
  // since last print) doesn't need the "NEW ITEMS" divider cluttering it up.
  const showSplit = newItems.length > 0 && alreadySentItems.length > 0

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
        {showSplit && <div className="text-center font-bold text-[11px] mb-1">— NEW ITEMS —</div>}
        {newItems.map((item) => (
          <div key={item.id} className="py-1">
            <div className="flex justify-between font-semibold text-[11px]">
              <span>{item.quantity}× {item.name}</span>
            </div>
            {item.isComplimentary && <div className="text-[10px]">(Complimentary)</div>}
            {item.note && <div className="text-[10px]">Note: {item.note}</div>}
          </div>
        ))}
        {showSplit && (
          <>
            <div className="border-t border-dashed border-black/60 my-1.5" />
            <div className="text-center font-bold text-[11px] mb-1">— ALREADY SENT —</div>
          </>
        )}
        {alreadySentItems.map((item) => (
          <div key={item.id} className="py-1 opacity-70">
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
