import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { Card } from '../../shared/ui/Card'
import { useRevenueVsPurchasesTrend, type GlanceRange } from './useRevenueVsPurchasesTrend'
import { nepalToday, nepalDaysAgo, nepalDateKeyToLabel, nepalDateKeyToWeekdayLabel } from '../../shared/lib/nepalDate'
import { percentChange } from './trendMath'

const RANGES: GlanceRange[] = ['7 days', '30 days', '90 days', 'custom']

// Up to this many days, the day-by-day table is open by default (a week is
// the whole point — no hovering); longer ranges start collapsed so a 90-day
// view isn't a wall of rows, but it's one tap away.
const TABLE_OPEN_BY_DEFAULT_UP_TO = 14

function money(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString()}`
}

// "▲ 12% vs previous 7 days" — `tone` only decides the colour: sales
// rising is good news, purchases rising is neither good nor bad, so it
// stays neutral.
function Delta({ current, previous, days, tone }: { current: number; previous: number | null; days: number; tone: 'sales' | 'neutral' }) {
  if (previous === null) return null
  const label = `previous ${days} day${days === 1 ? '' : 's'}`
  const pct = percentChange(current, previous)
  if (pct === null) {
    if (current === 0) return null
    return <div className="text-[11px] text-ink/40 mt-0.5">Nothing recorded in the {label}</div>
  }
  const rounded = Math.round(pct)
  if (rounded === 0) return <div className="text-[11px] text-ink/40 mt-0.5">Same as the {label}</div>
  const up = rounded > 0
  const color = tone === 'neutral' ? 'text-ink/50' : up ? 'text-status-available' : 'text-status-occupied'
  return (
    <div className={`text-[11px] font-semibold mt-0.5 ${color}`}>
      {up ? '▲' : '▼'} {Math.abs(rounded)}% <span className="font-normal text-ink/40">vs {label} ({money(previous)})</span>
    </div>
  )
}

export function RevenueVsPurchasesCard() {
  const [preset, setPreset] = useState<GlanceRange>('7 days')
  const [customFrom, setCustomFrom] = useState(() => nepalDaysAgo(6))
  const [customTo, setCustomTo] = useState(nepalToday())
  const [tableOpen, setTableOpen] = useState<boolean | null>(null) // null = use the default for this range

  const range = useMemo(() => {
    if (preset === '7 days') return { from: nepalDaysAgo(6), to: nepalToday() }
    if (preset === '30 days') return { from: nepalDaysAgo(29), to: nepalToday() }
    if (preset === '90 days') return { from: nepalDaysAgo(89), to: nepalToday() }
    return { from: customFrom, to: customTo }
  }, [preset, customFrom, customTo])

  useEffect(() => {
    setTableOpen(null)
  }, [preset])

  const { points, totalRevenue, totalPurchases, previous, days, loading, error } = useRevenueVsPurchasesTrend(range)
  const net = totalRevenue - totalPurchases
  const previousNet = previous ? previous.revenue - previous.purchases : null
  const showTable = tableOpen ?? points.length <= TABLE_OPEN_BY_DEFAULT_UP_TO
  const rangeLabel = days > 0 ? `${nepalDateKeyToLabel(range.from)} – ${nepalDateKeyToLabel(range.to)}` : ''

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">Sales vs purchases</div>
        <div className="flex gap-1 bg-ink/5 rounded-xl p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setPreset(r)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${preset === r ? 'bg-paper shadow-sm' : 'text-ink/50'}`}
            >
              {r === 'custom' ? 'Custom' : r}
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2 mb-3">
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

      {error ? (
        <p className="text-xs font-semibold text-status-cleaning bg-status-cleaning-bg rounded-xl px-3 py-2">
          Couldn't load these numbers — check your connection and try again.
        </p>
      ) : preset === 'custom' && days === 0 ? (
        <p className="text-xs text-ink/40">Pick a "From" date that's on or before the "To" date.</p>
      ) : (
        <>
          {rangeLabel && (
            <div className="text-xs text-ink/40 mb-2">
              {preset === 'custom' ? 'Selected range' : `Last ${days} days`} · {rangeLabel}
            </div>
          )}

          {/* Always-visible totals — the numbers you'd otherwise have to hover a chart to find. */}
          {loading ? (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="h-24 rounded-xl bg-ink/5 animate-pulse" />
              <div className="h-24 rounded-xl bg-ink/5 animate-pulse" />
              <div className="h-20 rounded-xl bg-ink/5 animate-pulse col-span-2" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="rounded-xl bg-status-available-bg/60 p-3">
                <div className="text-[10px] font-semibold text-ink/50 uppercase tracking-wide">Sales</div>
                <div className="font-ticket text-xl font-bold text-status-available leading-tight">{money(totalRevenue)}</div>
                <div className="text-[11px] text-ink/40">about {money(totalRevenue / Math.max(days, 1))} a day</div>
                <Delta current={totalRevenue} previous={previous?.revenue ?? null} days={days} tone="sales" />
              </div>
              <div className="rounded-xl bg-status-cleaning-bg/60 p-3">
                <div className="text-[10px] font-semibold text-ink/50 uppercase tracking-wide">Purchases</div>
                <div className="font-ticket text-xl font-bold text-status-cleaning leading-tight">{money(totalPurchases)}</div>
                <div className="text-[11px] text-ink/40">about {money(totalPurchases / Math.max(days, 1))} a day</div>
                <Delta current={totalPurchases} previous={previous?.purchases ?? null} days={days} tone="neutral" />
              </div>
              <div className="rounded-xl bg-ink/[0.04] p-3 col-span-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold text-ink/50 uppercase tracking-wide">Sales minus purchases</div>
                  <div className={`font-ticket text-xl font-bold leading-tight ${net >= 0 ? 'text-status-available' : 'text-status-occupied'}`}>
                    {net >= 0 ? '' : '-'}
                    {money(Math.abs(net))}
                  </div>
                </div>
                <div className="text-right text-[11px] text-ink/40 max-w-[11rem]">
                  {previousNet !== null && (
                    <div>
                      Previous {days} day{days === 1 ? '' : 's'}: {previousNet < 0 ? '-' : ''}
                      {money(Math.abs(previousNet))}
                    </div>
                  )}
                  <div>Not profit — rent, salaries and other costs aren't included.</div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="h-40 rounded-xl bg-ink/5 animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={points} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'rgba(20,22,26,0.4)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(20,22,26,0.4)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }} formatter={(v: any) => `Rs. ${Math.round(v).toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="revenue" name="Sales" stroke="#1f9d55" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="purchases" name="Purchases" stroke="#e8862e" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Day by day, written out — every number the chart shows on hover. */}
          {!loading && points.length > 0 && (
            <div className="mt-3">
              <button onClick={() => setTableOpen(!showTable)} className="text-xs font-semibold text-ember">
                {showTable ? 'Hide day by day' : `Show day by day (${points.length} days)`}
              </button>
              {showTable && (
                <div className="mt-2 max-h-96 overflow-y-auto rounded-xl border border-ink/5">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wide text-ink/40">
                      <tr>
                        <th className="text-left font-semibold px-3 py-2">Day</th>
                        <th className="text-right font-semibold px-2 py-2">Sales</th>
                        <th className="text-right font-semibold px-2 py-2">Purchases</th>
                        <th className="text-right font-semibold px-3 py-2">Left</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...points].reverse().map((p) => {
                        const left = p.revenue - p.purchases
                        return (
                          <tr key={p.dateKey} className="border-t border-ink/5">
                            <td className="px-3 py-1.5 font-medium">{nepalDateKeyToWeekdayLabel(p.dateKey)}</td>
                            <td className="px-2 py-1.5 text-right font-ticket">{p.revenue > 0 ? Math.round(p.revenue).toLocaleString() : '—'}</td>
                            <td className="px-2 py-1.5 text-right font-ticket">{p.purchases > 0 ? Math.round(p.purchases).toLocaleString() : '—'}</td>
                            <td className={`px-3 py-1.5 text-right font-ticket ${left < 0 ? 'text-status-occupied' : 'text-ink/70'}`}>
                              {left === 0 ? '—' : `${left < 0 ? '-' : ''}${Math.abs(Math.round(left)).toLocaleString()}`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-ink/10 font-bold bg-ink/[0.03]">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-2 py-2 text-right font-ticket">{Math.round(totalRevenue).toLocaleString()}</td>
                        <td className="px-2 py-2 text-right font-ticket">{Math.round(totalPurchases).toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right font-ticket ${net < 0 ? 'text-status-occupied' : ''}`}>
                          {net < 0 ? '-' : ''}
                          {Math.abs(Math.round(net)).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
