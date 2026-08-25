import { useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Card } from '../../shared/ui/Card'
import { usePurchaseTrendsData, type TrendRange } from './usePurchaseTrendsData'

const RANGES: TrendRange[] = ['7 days', '30 days', '90 days', 'custom']

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoISO(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function PurchaseTrendsView() {
  const [preset, setPreset] = useState<TrendRange>('30 days')
  const [customFrom, setCustomFrom] = useState(() => daysAgoISO(29))
  const [customTo, setCustomTo] = useState(todayISO())

  const range = useMemo(() => {
    if (preset === '7 days') return { from: daysAgoISO(6), to: todayISO() }
    if (preset === '30 days') return { from: daysAgoISO(29), to: todayISO() }
    if (preset === '90 days') return { from: daysAgoISO(89), to: todayISO() }
    return { from: customFrom, to: customTo }
  }, [preset, customFrom, customTo])

  const { data, loading } = usePurchaseTrendsData(range)

  return (
    <div>
      <div className="flex justify-end mb-3">
        <div className="flex gap-1 bg-surface border border-ink/10 rounded-xl p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setPreset(r)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${preset === r ? 'bg-ink text-paper' : 'text-ink/50'}`}
            >
              {r === 'custom' ? 'Custom' : r}
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2 mb-4 justify-end">
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

      {loading ? (
        <div className="space-y-3">
          <div className="h-52 rounded-2xl bg-ink/5 animate-pulse" />
          <div className="h-40 rounded-2xl bg-ink/5 animate-pulse" />
        </div>
      ) : data.purchaseCount === 0 ? (
        <p className="text-sm text-ink/30 italic py-16 text-center border border-dashed border-ink/10 rounded-2xl">No purchases in this range.</p>
      ) : (
        <>
          <Card className="p-4 mb-4">
            <div className="flex justify-between items-baseline mb-1">
              <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">Spend trend</div>
              <div className="font-ticket font-bold">Rs. {data.totalSpend.toLocaleString()}</div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.spendTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'rgba(20,22,26,0.4)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(20,22,26,0.4)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }}
                  formatter={(v: any) => [`Rs. ${v}`, 'Spend']}
                />
                <Line type="monotone" dataKey="spend" stroke="#e8862e" strokeWidth={2.5} dot={{ r: 3, fill: '#e8862e' }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Most purchased</div>
              <div className="space-y-2.5">
                {data.topItems.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-ink/30 font-ticket text-xs w-4 shrink-0">{i + 1}</span>
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="font-ticket font-semibold text-xs shrink-0 ml-2">
                      {item.qty}{item.unit ? ` ${item.unit}` : 'x'} · Rs. {Math.round(item.spend).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">By supplier</div>
              <div className="space-y-2.5">
                {data.bySupplier.map((s) => {
                  const pct = data.totalSpend > 0 ? Math.round((s.spend / data.totalSpend) * 100) : 0
                  return (
                    <div key={s.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="truncate">{s.name}</span>
                        <span className="font-ticket font-semibold text-xs shrink-0 ml-2">Rs. {Math.round(s.spend).toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-ink/5 overflow-hidden">
                        <div className="h-full bg-ember rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
