import { useSettingsStore } from '../settings/settingsStore'

// Same 80mm thermal-receipt sizing as ReceiptView/KOTPrintView — this is
// meant to come off the same printer, not be a full A4 sheet. A long item
// list just means a longer strip of paper, which is fine for a roll
// printer (unlike a page-size printer, which would need pagination).
export function DailyItemSalesPrintView({
  items,
  totalRevenue,
  orderCount,
  rangeLabel,
}: {
  items: { name: string; qty: number; revenue: number }[]
  totalRevenue: number
  orderCount: number
  rangeLabel: string
}) {
  const name = useSettingsStore((s) => s.name)

  return (
    <div data-theme="light" className="hidden print:block">
      <style>{`@page { size: 80mm auto; margin: 0 }`}</style>
      <div className="font-ticket text-ink bg-paper mx-auto" style={{ width: '72mm', padding: '3mm', fontSize: '11px', lineHeight: 1.4 }}>
        <div className="text-center mb-2">
          <div className="font-bold text-sm tracking-wide uppercase">{name || 'RestaurantOS'}</div>
          <div className="text-[10px] mt-0.5">Item sales — {rangeLabel}</div>
          <div className="text-[10px]">Printed {new Date().toLocaleString()}</div>
        </div>

        <div className="border-t border-dashed border-black/60 my-1.5" />

        <div className="flex text-[10px] font-bold mb-1">
          <span className="flex-1">ITEM</span>
          <span className="w-8 text-center">QTY</span>
          <span className="w-14 text-right">AMOUNT</span>
        </div>

        {items.length === 0 ? (
          <div className="text-[11px] text-center py-2">Nothing sold in this range.</div>
        ) : (
          items.map((i) => (
            <div key={i.name} className="flex text-[11px] mb-0.5">
              <span className="flex-1 pr-1">{i.name}</span>
              <span className="w-8 text-center">{i.qty}</span>
              <span className="w-14 text-right">{i.revenue}</span>
            </div>
          ))
        )}

        <div className="border-t border-black my-1.5" />

        <div className="flex justify-between text-[11px]">
          <span>Total items sold</span>
          <span>{items.reduce((s, i) => s + i.qty, 0)}</span>
        </div>
        <div className="flex justify-between text-[11px]"><span>Orders</span><span>{orderCount}</span></div>
        <div className="flex justify-between font-bold text-sm mt-1">
          <span>TOTAL SALES</span>
          <span>Rs. {totalRevenue}</span>
        </div>

        <div className="border-t border-dashed border-black/60 my-3" />

        {/* Blank space for a physical count/verification, signed at close. */}
        <div className="text-[10px] mb-4">Counted &amp; verified against stock by:</div>
        <div className="border-b border-black/60 mb-1" style={{ height: '10mm' }} />
        <div className="flex justify-between text-[10px]">
          <span>Name / Signature</span>
          <span>Time: ________</span>
        </div>
      </div>
    </div>
  )
}
