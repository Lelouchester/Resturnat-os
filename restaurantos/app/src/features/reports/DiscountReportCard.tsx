import { useMemo, useState } from 'react'
import { Percent } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { useDiscountReport } from './useDiscountReport'
import { nepalToday, nepalDaysAgo } from '../../shared/lib/nepalDate'
import { percentChange } from './trendMath'

type Range = 'today' | '7 days' | '30 days'
const RANGES: Range[] = ['today', '7 days', '30 days']

function money(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString()}`
}

// A rough, visible-at-a-glance sense of scale: discounts as a share of the
// gross bill total before those discounts. Not a target or a policy — just
// enough for "does this look normal" at a glance.
function rateLabel(discountTotal: number, grossSubtotal: number): string | null {
  if (grossSubtotal <= 0) return null
  const pct = (discountTotal / grossSubtotal) * 100
  return `${pct < 1 && pct > 0 ? '<1' : Math.round(pct)}% of gross sales`
}

export function DiscountReportCard() {
  const [preset, setPreset] = useState<Range>('today')

  const range = useMemo(() => {
    if (preset === 'today') return { from: nepalToday(), to: nepalToday() }
    if (preset === '7 days') return { from: nepalDaysAgo(6), to: nepalToday() }
    return { from: nepalDaysAgo(29), to: nepalToday() }
  }, [preset])

  const { discountedOrders, discountTotal, grossSubtotal, previous, days, loading, error } = useDiscountReport(range)
  const rate = rateLabel(discountTotal, grossSubtotal)
  const pctChange = previous ? percentChange(discountTotal, previous.discountTotal) : null

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">
          <Percent size={13} /> Discounts given
        </div>
        <div className="flex gap-1 bg-ink/5 rounded-xl p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setPreset(r)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${preset === r ? 'bg-paper shadow-sm' : 'text-ink/50'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-xs font-semibold text-status-cleaning bg-status-cleaning-bg rounded-xl px-3 py-2">
          Couldn't load this — check your connection and try again.
        </p>
      ) : loading ? (
        <div className="h-16 rounded-xl bg-ink/5 animate-pulse" />
      ) : (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-ticket text-2xl font-bold text-status-occupied">{money(discountTotal)}</span>
            <span className="text-xs text-ink/40">
              across {discountedOrders} order{discountedOrders === 1 ? '' : 's'}
              {preset !== 'today' ? ` in ${days} days` : ''}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-ink/40">
            {rate && <span>{rate}</span>}
            {pctChange !== null && Math.round(pctChange) !== 0 && (
              <span className={pctChange > 0 ? 'text-status-cleaning font-semibold' : 'text-status-available font-semibold'}>
                {pctChange > 0 ? '▲' : '▼'} {Math.abs(Math.round(pctChange))}% vs previous {days} day{days === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {preset === 'today' && discountTotal === 0 && (
            <p className="text-xs text-ink/40 mt-1">No discounts given today yet.</p>
          )}
        </div>
      )}
    </Card>
  )
}
