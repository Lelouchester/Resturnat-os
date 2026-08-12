import { AlertTriangle, Phone } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import type { Customer } from './types'

function daysOverdue(dueSince: string) {
  return Math.floor((Date.now() - new Date(dueSince).getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * Everyone with an outstanding due, in one place — the thing missing before
 * was a total and a way to see who to chase first, rather than opening
 * every customer one at a time. Sorted longest-overdue first, since that's
 * usually who to follow up with.
 */
export function DuesView({ customers, onSelect }: { customers: Customer[]; onSelect: (id: string) => void }) {
  const withDue = customers
    .filter((c) => c.outstandingDue > 0)
    .sort((a, b) => {
      const daysA = a.dueSince ? daysOverdue(a.dueSince) : 0
      const daysB = b.dueSince ? daysOverdue(b.dueSince) : 0
      return daysB - daysA
    })

  const total = withDue.reduce((sum, c) => sum + c.outstandingDue, 0)

  const buckets = { fresh: 0, aging: 0, old: 0 }
  for (const c of withDue) {
    const days = c.dueSince ? daysOverdue(c.dueSince) : 0
    if (days >= 30) buckets.old += c.outstandingDue
    else if (days >= 8) buckets.aging += c.outstandingDue
    else buckets.fresh += c.outstandingDue
  }

  if (withDue.length === 0) {
    return <p className="text-sm text-ink/30 italic py-16 text-center border border-dashed border-ink/10 rounded-2xl">No outstanding dues right now.</p>
  }

  return (
    <div>
      <Card className="p-4 mb-4">
        <div className="text-xs text-ink/40 mb-1">Total outstanding</div>
        <div className="font-ticket text-2xl font-bold mb-3">Rs. {total.toLocaleString()}</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="font-ticket font-bold text-sm">Rs. {buckets.fresh.toLocaleString()}</div>
            <div className="text-[10px] text-ink/40 mt-0.5">0–7 days</div>
          </div>
          <div>
            <div className="font-ticket font-bold text-sm text-status-cleaning">Rs. {buckets.aging.toLocaleString()}</div>
            <div className="text-[10px] text-ink/40 mt-0.5">8–30 days</div>
          </div>
          <div>
            <div className="font-ticket font-bold text-sm text-status-occupied">Rs. {buckets.old.toLocaleString()}</div>
            <div className="text-[10px] text-ink/40 mt-0.5">30+ days</div>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        {withDue.map((c) => {
          const days = c.dueSince ? daysOverdue(c.dueSince) : 0
          return (
            <button key={c.id} onClick={() => onSelect(c.id)} className="w-full text-left">
              <Card className="p-3.5 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{c.name || 'Walk-in customer'}</div>
                  <div className="flex items-center gap-1 text-xs text-ink/40 mt-0.5">
                    {c.phone ? (
                      <>
                        <Phone size={11} /> {c.phone}
                      </>
                    ) : (
                      <span className="italic">No phone on file</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-ticket text-sm font-bold text-status-cleaning">Rs. {c.outstandingDue}</div>
                  <div className={`text-xs mt-0.5 flex items-center gap-1 justify-end ${days >= 30 ? 'text-status-occupied font-semibold' : 'text-ink/40'}`}>
                    {days >= 30 && <AlertTriangle size={11} />} {days}d
                  </div>
                </div>
              </Card>
            </button>
          )
        })}
      </div>
    </div>
  )
}
