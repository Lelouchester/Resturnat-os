import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { Card } from '../../shared/ui/Card'
import { useRevenueVsPurchasesTrend, type GlanceRange } from './useRevenueVsPurchasesTrend'

const RANGES: GlanceRange[] = ['7 days', '30 days', '90 days']

export function RevenueVsPurchasesCard() {
  const [range, setRange] = useState<GlanceRange>('7 days')
  const { points, totalRevenue, totalPurchases, loading } = useRevenueVsPurchasesTrend(range)
  const net = totalRevenue - totalPurchases

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">Where we're headed</div>
        <div className="flex gap-1 bg-ink/5 rounded-xl p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${range === r ? 'bg-paper shadow-sm' : 'text-ink/50'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 mb-3">
        <div>
          <div className="text-[10px] text-ink/40 uppercase tracking-wide">Revenue</div>
          <div className="font-ticket text-lg font-bold text-status-available">Rs. {Math.round(totalRevenue).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] text-ink/40 uppercase tracking-wide">Purchases</div>
          <div className="font-ticket text-lg font-bold text-status-cleaning">Rs. {Math.round(totalPurchases).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] text-ink/40 uppercase tracking-wide">Net</div>
          <div className={`font-ticket text-lg font-bold ${net >= 0 ? 'text-status-available' : 'text-status-occupied'}`}>
            {net >= 0 ? '' : '-'}Rs. {Math.abs(Math.round(net)).toLocaleString()}
          </div>
        </div>
      </div>

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
            <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1f9d55" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="purchases" name="Purchases" stroke="#e8862e" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
