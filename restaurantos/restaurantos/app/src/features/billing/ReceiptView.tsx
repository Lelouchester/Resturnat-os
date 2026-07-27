import type { BillLine } from './types'

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
  return (
    <div data-theme="light" className="hidden print:block font-ticket text-sm p-6 max-w-xs mx-auto text-ink bg-paper">
      <div className="text-center mb-3">
        <div className="font-bold text-base">RESTAURANTOS</div>
        <div className="text-xs">{tableLabel} · {customerName}</div>
        <div className="text-xs">{new Date().toLocaleString()}</div>
      </div>
      <div className="border-t border-dashed border-black my-2" />
      {lines.map((l, i) => (
        <div key={i} className="flex justify-between text-xs mb-1">
          <span>{l.quantity}× {l.name}</span>
          <span>{l.unitPrice * l.quantity}</span>
        </div>
      ))}
      <div className="border-t border-dashed border-black my-2" />
      <div className="flex justify-between text-xs"><span>Subtotal</span><span>{subtotal}</span></div>
      {discount > 0 && <div className="flex justify-between text-xs"><span>Discount</span><span>-{discount}</span></div>}
      {serviceCharge > 0 && <div className="flex justify-between text-xs"><span>Service charge</span><span>{serviceCharge}</span></div>}
      {tax > 0 && <div className="flex justify-between text-xs"><span>Tax</span><span>{tax}</span></div>}
      {tip > 0 && <div className="flex justify-between text-xs"><span>Tip</span><span>{tip}</span></div>}
      <div className="border-t border-dashed border-black my-2" />
      <div className="flex justify-between font-bold text-base"><span>Total</span><span>Rs. {total}</span></div>
      <div className="text-center text-xs mt-4">Thank you — please visit again</div>
    </div>
  )
}
