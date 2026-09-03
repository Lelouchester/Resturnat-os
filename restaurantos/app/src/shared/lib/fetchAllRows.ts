/**
 * Supabase caps how many rows a single query returns (commonly 1000).
 * That's invisible for small results, but any report that sums up rows
 * over a wide date range — a month of orders, a month of purchase lines —
 * can silently cross that cap on a busy branch, and the query just quietly
 * drops the rest. The visible symptom is a total that's too low and,
 * confusingly, sometimes a date that seems to be missing entirely (if
 * every row from that day happened to land past the cutoff).
 *
 * This pages through with .range() until a page comes back with fewer
 * rows than the page size, guaranteeing every matching row is actually
 * counted regardless of how many there are.
 *
 * Usage: await fetchAllRows((from, to) =>
 *   supabase.from('orders').select('total').eq('status', 'paid').range(from, to)
 * )
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<T[]> {
  const allRows: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) {
      console.error('[fetchAllRows] page fetch failed', error)
      break
    }
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}
