import { useEffect, useMemo, useState } from 'react'
import { Card } from '../../shared/ui/Card'
import { useInventoryStore } from '../inventory/inventoryStore'
import { useMenuLinksStore } from '../inventory/menuLinksStore'
import { useMenuStore } from '../menu/menuStore'
import { useItemUsageData, type UsagePeriod } from './useItemUsageData'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoISO(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function ItemUsageReport() {
  const inventoryItems = useInventoryStore((s) => s.items)
  const initInventory = useInventoryStore((s) => s.init)
  const linksByInventoryItem = useMenuLinksStore((s) => s.linksByInventoryItem)
  const initMenuLinks = useMenuLinksStore((s) => s.init)
  const menuItems = useMenuStore((s) => s.items)
  const initMenu = useMenuStore((s) => s.init)

  useEffect(() => {
    initInventory()
    initMenuLinks()
    initMenu()
  }, [initInventory, initMenuLinks, initMenu])

  const [period, setPeriod] = useState<UsagePeriod>('week')
  const [customFrom, setCustomFrom] = useState(() => daysAgoISO(6))
  const [customTo, setCustomTo] = useState(todayISO())

  // Presets are just a shortcut for picking the same from/to range a manual
  // pick would produce — the hook always gets an explicit range either way,
  // so "This week" and manually typing the same two dates give identical
  // results, which is exactly what lets you cross-check this against
  // another screen by matching the range exactly.
  const range = useMemo(() => {
    if (period === 'week') return { from: daysAgoISO(6), to: todayISO() }
    if (period === 'month') return { from: daysAgoISO(29), to: todayISO() }
    return { from: customFrom, to: customTo }
  }, [period, customFrom, customTo])

  const menuItemNames = useMemo(() => Object.fromEntries(menuItems.map((m) => [m.id, m.name])), [menuItems])

  const itemsWithLinks = useMemo(
    () =>
      inventoryItems
        .filter((i) => (linksByInventoryItem[i.id] ?? []).length > 0)
        .map((i) => ({ id: i.id, name: i.name, unit: i.unit, linkedMenuItemIds: linksByInventoryItem[i.id] ?? [] })),
    [inventoryItems, linksByInventoryItem]
  )

  const { rows, loading } = useItemUsageData(range, itemsWithLinks, menuItemNames)

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm text-ink/50">Compares what you bought against what got sold, for items you've linked to menu items.</p>
        <div className="flex gap-1 bg-surface border border-ink/10 rounded-xl p-1">
          {(['week', 'month', 'custom'] as UsagePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${period === p ? 'bg-ink text-paper' : 'text-ink/50'}`}
            >
              {p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'Custom'}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex items-center gap-2 mb-4">
          <div>
            <label className="text-[10px] font-semibold text-ink/40 block">From</label>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-xs border border-ink/10 rounded-lg px-2 py-1 outline-none focus:border-ember" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-ink/40 block">To</label>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-xs border border-ink/10 rounded-lg px-2 py-1 outline-none focus:border-ember" />
          </div>
        </div>
      )}

      {itemsWithLinks.length === 0 ? (
        <p className="text-sm text-ink/30 italic py-16 text-center border border-dashed border-ink/10 rounded-2xl">
          No items linked yet — go to Inventory, edit an item like "Milk," and check off the menu items made from it (Milk Tea, Masala Tea, etc.) to see it here.
        </p>
      ) : loading ? (
        <div className="space-y-3">
          <div className="h-24 rounded-2xl bg-ink/5 animate-pulse" />
          <div className="h-24 rounded-2xl bg-ink/5 animate-pulse" />
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.inventoryItemId} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-ticket font-bold text-sm">{r.inventoryItemName}</span>
                <span className="text-xs text-ink/40">{range.from === range.to ? range.from : `${range.from} – ${range.to}`}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="rounded-xl bg-ink/[0.03] p-3">
                  <div className="text-[11px] uppercase tracking-wider text-ink/40 mb-0.5">Bought</div>
                  <div className="font-ticket font-bold text-lg">
                    {r.purchasedQty} <span className="text-xs font-normal text-ink/50">{r.unit}</span>
                  </div>
                  <div className="text-xs text-ink/40 mt-0.5">Rs. {Math.round(r.purchasedSpend).toLocaleString()} spent</div>
                </div>
                <div className="rounded-xl bg-ink/[0.03] p-3">
                  <div className="text-[11px] uppercase tracking-wider text-ink/40 mb-0.5">Sold (linked items)</div>
                  <div className="font-ticket font-bold text-lg">
                    {r.soldTotal} <span className="text-xs font-normal text-ink/50">units</span>
                  </div>
                  <div className="text-xs text-ink/40 mt-0.5">Rs. {Math.round(r.soldRevenue).toLocaleString()} in sales</div>
                </div>
              </div>
              {r.soldBreakdown.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {r.soldBreakdown.map((b) => (
                    <span key={b.menuItemName} className="text-[11px] font-semibold bg-ink/[0.04] rounded-full px-2 py-0.5">
                      {b.menuItemName}: {b.qty} · Rs. {Math.round(b.revenue).toLocaleString()}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
