import { useSettingsStore } from '../settings/settingsStore'
import type { BillLine } from './types'

// 80mm thermal paper prints roughly 72mm of usable width — this sizing and
// the @page rule below are tuned for that, not for a normal sheet printer.
export function ReceiptView({
  tableLabel,
  customerName,
  lines,
  subtotal,
  discount,
  serviceCharge,
  tax,
  tip,
  total,
}: {
  tableLabel: string
  customerName: string
  lines: BillLine[]
  subtotal: number
  discount: number
  serviceCharge: number
  tax: number
  tip: number
  total: number
}) {
  const name = useSettingsStore((s) => s.name)
  const slogan = useSettingsStore((s) => s.slogan)
  const address = useSettingsStore((s) => s.address)
  const phone = useSettingsStore((s) => s.phone)
  const receiptFooter = useSettingsStore((s) => s.receiptFooter)

  return (
    <div data-theme="light" className="hidden print:block">
      <style>{`@page { size: 80mm auto; margin: 0 }`}</style>
      <div className="font-ticket text-ink bg-paper mx-auto" style={{ width: '72mm', padding: '3mm', fontSize: '11px', lineHeight: 1.4 }}>
        <div className="text-center mb-2">
          <div className="font-bold text-sm tracking-wide uppercase">{name || 'RestaurantOS'}</div>
          {slogan && <div className="text-[10px] italic mt-0.5">{slogan}</div>}
          {address && <div className="text-[10px] mt-0.5">{address}</div>}
          {phone && <div className="text-[10px]">{phone}</div>}
        </div>

        <div className="border-t border-dashed border-black/60 my-1.5" />

        <div className="flex justify-between text-[10px] mb-0.5">
          <span>{tableLabel}</span>
          <span>{new Date().toLocaleString()}</span>
        </div>
        <div className="text-[10px] mb-1">{customerName}</div>

        <div className="border-t border-dashed border-black/60 my-1.5" />

        <div className="flex text-[10px] font-bold mb-1">
          <span className="flex-1">ITEM</span>
          <span className="w-8 text-center">QTY</span>
          <span className="w-14 text-right">AMOUNT</span>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="flex text-[11px] mb-0.5">
            <span className="flex-1 pr-1">{l.name}</span>
            <span className="w-8 text-center">{l.quantity}</span>
            <span className="w-14 text-right">{l.unitPrice * l.quantity}</span>
          </div>
        ))}

        <div className="border-t border-dashed border-black/60 my-1.5" />

        <div className="flex justify-between text-[11px]"><span>Subtotal</span><span>{subtotal}</span></div>
        {discount > 0 && <div className="flex justify-between text-[11px]"><span>Discount</span><span>-{discount}</span></div>}
        {serviceCharge > 0 && <div className="flex justify-between text-[11px]"><span>Service charge</span><span>{serviceCharge}</span></div>}
        {tax > 0 && <div className="flex justify-between text-[11px]"><span>Tax</span><span>{tax}</span></div>}
        {tip > 0 && <div className="flex justify-between text-[11px]"><span>Tip</span><span>{tip}</span></div>}

        <div className="border-t border-black my-1.5" />

        <div className="flex justify-between font-bold text-sm">
          <span>TOTAL</span>
          <span>Rs. {total}</span>
        </div>

        <div className="border-t border-dashed border-black/60 my-2" />

        <div className="text-center text-[10px]">{receiptFooter || 'Thank you — please visit again'}</div>
      </div>
    </div>
  )
}
