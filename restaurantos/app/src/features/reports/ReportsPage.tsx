import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { TrendingUp, AlertTriangle, Star, Users, Clock } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { useReportsData, type ReportRange } from './useReportsData'
import { useInventoryStore } from '../inventory/inventoryStore'
import { useCustomersStore } from '../customers/customersStore'

const RANGES: ReportRange[] = ['Today', '7 days', '30 days']

export function ReportsPage() {
  const [range, setRange] = useState<ReportRange>('7 days')
  const { data, loading } = useReportsData(range)

  const inventoryItems = useInventoryStore((s) => s.items)
  const initInventory = useInventoryStore((s) => s.init)
  const customers = useCustomersStore((s) => s.customers)
  const initCustomers = useCustomersStore((s) => s.init)

  useEffect(() => {
    initCustomers()
    initInventory()
  }, [initCustomers, initInventory])

  const lowStockItems = useMemo(() => inventoryItems.filter((i) => i.currentStock <= i.minStock), [inventoryItems])
  const topSpender = useMemo(
    () => [...customers].sort((a, b) => b.lifetimeSpend - a.lifetimeSpend)[0],
    [customers]
  )
  const repeatCustomerPct = useMemo(() => {
    if (customers.length === 0) return 0
    const repeat = customers.filter((c) => c.visitCount > 1).length
    return Math.round((repeat / customers.length) * 100)
  }, [customers])

  const totalPayments = data.paymentSplit.reduce((s, p) => s + p.value, 0)
  const busiestHour = data.peakHours.length > 0 ? [...data.peakHours].sort((a, b) => b.orders - a.orders)[0] : null

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="font-ticket text-xl font-bold">Reports</h1>
          <p className="text-sm text-ink/50">Sales, performance, and business insights</p>
        </div>
        <div className="flex gap-1 bg-surface border border-ink/10 rounded-xl p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                range === r ? 'bg-ink text-paper' : 'text-ink/50'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-16 rounded-2xl bg-ink/5 animate-pulse" />
          <div className="grid md:grid-cols-2 gap-4">
            <div className="h-52 rounded-2xl bg-ink/5 animate-pulse" />
            <div className="h-52 rounded-2xl bg-ink/5 animate-pulse" />
          </div>
        </div>
      ) : data.totalRevenue === 0 ? (
        <p className="text-sm text-ink/30 italic py-16 text-center border border-dashed border-ink/10 rounded-2xl">
          No paid orders in this range yet — reports fill in as the day goes.
        </p>
      ) : (
        <>
          {/* Business insights — auto-generated, cross-referencing other modules */}
          <div className="grid sm:grid-cols-2 gap-2 mb-4">
            {data.topItems[0] && (
              <InsightRow icon={<Star size={14} />} text={<>Best seller: <b>{data.topItems[0].name}</b> ({data.topItems[0].qty} sold)</>} />
            )}
            {busiestHour && (
              <InsightRow icon={<TrendingUp size={14} />} text={<>Busiest hour: <b>{busiestHour.hour}</b>, {busiestHour.orders} orders</>} />
            )}
            {topSpender && (
              <InsightRow icon={<Users size={14} />} text={<>Highest spender: <b>{topSpender.name || 'Walk-in'}</b> (Rs. {topSpender.lifetimeSpend})</>} />
            )}
            {customers.length > 0 && (
              <InsightRow icon={<Clock size={14} />} text={<>Repeat customers: <b>{repeatCustomerPct}%</b> came back more than once</>} />
            )}
            {lowStockItems.length > 0 && (
              <InsightRow
                danger
                icon={<AlertTriangle size={14} />}
                text={<>Stock risk: <b>{lowStockItems.map((i) => i.name).join(', ')}</b> at or below minimum</>}
              />
            )}
            {data.slowMovers.length > 0 && (
              <InsightRow text={<>Slowest movers: <b>{data.slowMovers.map((s) => s.name).join(', ')}</b> — consider a promo</>} />
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            {/* Revenue trend */}
            <Card className="p-4">
              <div className="flex justify-between items-baseline mb-1">
                <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">Revenue trend</div>
                <div className="font-ticket font-bold">Rs. {data.totalRevenue.toLocaleString()}</div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.revenueTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgba(20,22,26,0.4)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(20,22,26,0.4)' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }}
                    formatter={(v: any) => [`Rs. ${v}`, 'Revenue']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#e8862e" strokeWidth={2.5} dot={{ r: 3, fill: '#e8862e' }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Payment methods */}
            <Card className="p-4">
              <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-1">Payment methods</div>
              {data.paymentSplit.length === 0 ? (
                <p className="text-xs text-ink/30 py-16 text-center">No payments in this range.</p>
              ) : (
                <div className="flex items-center">
                  <ResponsiveContainer width="55%" height={180}>
                    <PieChart>
                      <Pie data={data.paymentSplit} dataKey="value" nameKey="method" innerRadius={45} outerRadius={70} paddingAngle={3}>
                        {data.paymentSplit.map((p) => (
                          <Cell key={p.method} fill={p.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => `Rs. ${v}`} contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {data.paymentSplit.map((p) => (
                      <div key={p.method} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                          {p.method}
                        </span>
                        <span className="font-ticket font-semibold text-xs">{Math.round((p.value / totalPayments) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Top selling items */}
            <Card className="p-4">
              <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Top selling items</div>
              {data.topItems.length === 0 ? (
                <p className="text-xs text-ink/30 py-16 text-center">Nothing sold in this range yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.topItems} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={110}
                      tick={{ fontSize: 11, fill: 'rgba(20,22,26,0.6)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }}
                      formatter={(v: any) => [`${v} sold`, '']}
                    />
                    <Bar dataKey="qty" fill="#e8862e" radius={[0, 6, 6, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Peak hours */}
            <Card className="p-4">
              <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Peak hours</div>
              {data.peakHours.length === 0 ? (
                <p className="text-xs text-ink/30 py-16 text-center">No orders in this range yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.peakHours} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'rgba(20,22,26,0.4)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'rgba(20,22,26,0.4)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', fontSize: 12 }} formatter={(v: any) => [`${v} orders`, '']} />
                    <Bar dataKey="orders" fill="#14161a" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Table turnover + kitchen performance */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Table turnover</div>
              {data.tableTurnover.length === 0 ? (
                <p className="text-xs text-ink/30 py-4 text-center">No completed tables in this range yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.tableTurnover.map((t) => (
                    <div key={t.table} className="flex justify-between text-sm">
                      <span className="font-medium">{t.table}</span>
                      <span className="text-ink/50">
                        <span className="font-ticket font-semibold text-ink">{t.avgMinutes}m</span> avg · {t.turns} turn{t.turns === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40 mb-3">Kitchen performance</div>
              {data.kitchenPerformance.avgPrepMinutes === 0 ? (
                <p className="text-xs text-ink/30 py-4 text-center">No served items in this range yet.</p>
              ) : (
                <>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-ink/60">Avg time to serve</span>
                    <span className="font-ticket font-semibold">{data.kitchenPerformance.avgPrepMinutes} min</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-ink/60">Served within 15 min</span>
                    <span className="font-ticket font-semibold text-status-available">{data.kitchenPerformance.onTimePct}%</span>
                  </div>
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function InsightRow({ icon, text, danger }: { icon?: ReactNode; text: ReactNode; danger?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm ${danger ? 'bg-status-cleaning-bg text-status-cleaning' : 'bg-surface border border-ink/5'}`}>
      {icon && <span className={danger ? '' : 'text-ember'}>{icon}</span>}
      <span className={danger ? '' : 'text-ink/70'}>{text}</span>
    </div>
  )
}
