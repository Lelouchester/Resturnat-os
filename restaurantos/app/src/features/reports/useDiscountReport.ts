import { useEffect, useState } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { currentBranchId } from '../auth/authStore'
import { previousRange, daysInRange } from './trendMath'

export interface DiscountRange {
  from: string // 'YYYY-MM-DD', Nepal day
  to: string
}

interface DiscountTotals {
  discountedOrders: number
  discountTotal: number
  grossSubtotal: number
}

const EMPTY: DiscountTotals = { discountedOrders: 0, discountTotal: 0, grossSubtotal: 0 }

function sumRows(rows: any[] | null): DiscountTotals {
  return (rows ?? []).reduce(
    (t, r) => ({
      discountedOrders: t.discountedOrders + Number(r.discounted_orders),
      discountTotal: t.discountTotal + Number(r.discount_total),
      grossSubtotal: t.grossSubtotal + Number(r.gross_subtotal),
    }),
    { discountedOrders: 0, discountTotal: 0, grossSubtotal: 0 }
  )
}

function fetchDaily(from: string, to: string) {
  return supabase.rpc('daily_discounts', { p_branch_id: currentBranchId(), p_from: from, p_to: to })
}

// Discounts given away over a range, added up on the database (never the
// raw per-order rows — see migration 022), plus the same-length period
// before it for "is this creeping up" comparison.
export function useDiscountReport(range: DiscountRange) {
  const [current, setCurrent] = useState<DiscountTotals>(EMPTY)
  const [previous, setPrevious] = useState<DiscountTotals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    const prev = previousRange(range.from, range.to)
    Promise.all([fetchDaily(range.from, range.to), prev ? fetchDaily(prev.from, prev.to) : Promise.resolve(null)]).then(
      ([cur, prv]) => {
        if (cancelled) return
        if (cur.error) {
          console.error('[useDiscountReport] query failed', cur.error)
          setCurrent(EMPTY)
          setError(true)
          setLoading(false)
          return
        }
        setCurrent(sumRows(cur.data))
        setPrevious(prv && !prv.error ? sumRows(prv.data) : null)
        setLoading(false)
      }
    )

    return () => {
      cancelled = true
    }
  }, [range.from, range.to])

  return { ...current, previous, days: daysInRange(range.from, range.to), loading, error }
}
