import { useEffect, useMemo, useState } from 'react'
import { Plus, X, CalendarClock, ArrowRightLeft, Merge } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TableCard } from './TableCard'
import { Card } from '../../shared/ui/Card'
import { Button } from '../../shared/ui/Button'
import { useTablesStore } from './tablesStore'
import { useOrdersStore } from '../orders/ordersStore'
import { useReservationsStore } from '../reservations/reservationsStore'

const FILTERS = ['All', 'Available', 'Occupied', 'Reserved', 'Billing'] as const

export function TablesPage() {
  const [view, setView] = useState<'floor' | 'reservations'>('floor')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [transferringId, setTransferringId] = useState<string | null>(null)
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [addingTable, setAddingTable] = useState(false)
  const navigate = useNavigate()

  const tables = useTablesStore((s) => s.tables)
  const loading = useTablesStore((s) => s.loading)
  const init = useTablesStore((s) => s.init)
  const addTable = useTablesStore((s) => s.addTable)
  const markCleaned = useTablesStore((s) => s.markCleaned)
  const orders = useOrdersStore((s) => s.orders)
  const initOrders = useOrdersStore((s) => s.init)
  const transferOrderTable = useOrdersStore((s) => s.transferOrderTable)
  const mergeOrders = useOrdersStore((s) => s.mergeOrders)

  const totalsByTable = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of orders) {
      const sum = o.items.filter((i) => i.status !== 'void').reduce((s, i) => s + (i.isComplimentary ? 0 : i.unitPrice * i.quantity), 0)
      map.set(o.tableId, (map.get(o.tableId) ?? 0) + sum)
    }
    return map
  }, [orders])

  useEffect(() => {
    init()
    initOrders()
  }, [init, initOrders])

  const visibleTables = useMemo(() => {
    if (filter === 'All') return tables
    const key = filter.toLowerCase().replace(' ', '_')
    return tables.filter((t) => t.status === key)
  }, [filter, tables])

  const occupiedCount = tables.filter((t) => t.status === 'occupied').length

  // Tapping a table is the primary action now — it opens Orders for that
  // table, whether that means starting a fresh order or adding to one
  // already in progress. Move / Merge live as their own small buttons on
  // the card so they don't get triggered by accident.
  function handleSelectTable(id: string) {
    const table = tables.find((t) => t.id === id)
    if (!table || table.status === 'disabled') return
    navigate(`/orders?table=${id}`)
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="font-ticket text-xl font-bold">Floor</h1>
          <p className="text-sm text-ink/50">{tables.length} tables · {occupiedCount} occupied</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-surface border border-ink/10 rounded-xl p-1">
            <button
              onClick={() => setView('floor')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'floor' ? 'bg-ink text-paper' : 'text-ink/50'}`}
            >
              Floor
            </button>
            <button
              onClick={() => setView('reservations')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'reservations' ? 'bg-ink text-paper' : 'text-ink/50'}`}
            >
              Reservations
            </button>
          </div>
          {view === 'floor' && (
            <button
              onClick={() => setAddingTable(true)}
              className="flex items-center gap-1.5 rounded-xl bg-ember text-white px-3.5 py-2.5 text-sm font-semibold hover:brightness-95 active:scale-[0.98] transition-all"
            >
              <Plus size={16} /> Add table
            </button>
          )}
        </div>
      </div>

      {view === 'floor' ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4 md:mx-0 md:px-0">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                  filter === f ? 'bg-ink text-paper border-ink' : 'bg-surface text-ink/60 border-ink/10'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-ink/5 animate-pulse" />
              ))
            ) : visibleTables.length === 0 ? (
              <p className="col-span-full text-sm text-ink/40 text-center py-10">
                No tables yet — add one, or check that Supabase is connected and seeded.
              </p>
            ) : (
              visibleTables.map((t) => (
                <TableCard
                  key={t.id}
                  table={t}
                  onSelect={handleSelectTable}
                  onMove={setTransferringId}
                  onMerge={setMergingId}
                  onMarkCleaned={markCleaned}
                  runningTotal={totalsByTable.get(t.id)}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <ReservationsView tables={tables} />
      )}

      {transferringId && (
        <TransferModal
          fromId={transferringId}
          tables={tables}
          onClose={() => setTransferringId(null)}
          onConfirm={(toId) => { transferOrderTable(transferringId, toId); setTransferringId(null) }}
        />
      )}

      {mergingId && (
        <MergeModal
          fromId={mergingId}
          tables={tables}
          onClose={() => setMergingId(null)}
          onConfirm={(intoId) => { mergeOrders(mergingId, intoId); setMergingId(null) }}
        />
      )}

      {addingTable && (
        <AddTableModal onClose={() => setAddingTable(false)} onAdd={(label, seats) => { addTable(label, seats); setAddingTable(false) }} />
      )}
    </div>
  )
}

function TransferModal({
  fromId,
  tables,
  onClose,
  onConfirm,
}: {
  fromId: string
  tables: ReturnType<typeof useTablesStore.getState>['tables']
  onClose: () => void
  onConfirm: (toId: string) => void
}) {
  const from = tables.find((t) => t.id === fromId)!
  const available = tables.filter((t) => t.id !== fromId && t.status === 'available')

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-ticket text-lg font-bold flex items-center gap-2"><ArrowRightLeft size={17} /> Transfer {from.label}</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>
        <p className="text-sm text-ink/50 mb-4">{from.customerName ?? 'This order'} moves to a new table — this one becomes "needs cleaning".</p>
        {available.length === 0 ? (
          <p className="text-sm text-ink/40">No available tables to transfer into right now.</p>
        ) : (
          <div className="space-y-2">
            {available.map((t) => (
              <button
                key={t.id}
                onClick={() => onConfirm(t.id)}
                className="w-full text-left rounded-xl border border-ink/10 px-3.5 py-2.5 text-sm font-semibold hover:bg-ink/5"
              >
                {t.label} <span className="text-ink/40 font-normal">· {t.seats} seats</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MergeModal({
  fromId,
  tables,
  onClose,
  onConfirm,
}: {
  fromId: string
  tables: ReturnType<typeof useTablesStore.getState>['tables']
  onClose: () => void
  onConfirm: (intoId: string) => void
}) {
  const from = tables.find((t) => t.id === fromId)!
  // Any other table already carrying an order can receive the merge — the
  // guests physically stay where they are, only the bill combines.
  const mergeable = tables.filter((t) => t.id !== fromId && (t.status === 'occupied' || t.status === 'billing'))

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-ticket text-lg font-bold flex items-center gap-2"><Merge size={17} /> Merge {from.label}</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>
        <p className="text-sm text-ink/50 mb-4">
          {from.label}'s bill folds into whichever table you pick — both parties stay seated where they are, but pay together at Billing.
        </p>
        {mergeable.length === 0 ? (
          <p className="text-sm text-ink/40">No other occupied tables to merge with right now.</p>
        ) : (
          <div className="space-y-2">
            {mergeable.map((t) => (
              <button
                key={t.id}
                onClick={() => onConfirm(t.id)}
                className="w-full text-left rounded-xl border border-ink/10 px-3.5 py-2.5 text-sm font-semibold hover:bg-ink/5"
              >
                {t.label} <span className="text-ink/40 font-normal">· {t.customerName ?? 'occupied'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AddTableModal({ onClose, onAdd }: { onClose: () => void; onAdd: (label: string, seats: number) => void }) {
  const [label, setLabel] = useState('')
  const [seats, setSeats] = useState('4')

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-ticket text-lg font-bold">Add table</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>
        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Label</label>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Table 9, Patio 1"
          className="w-full mb-4 text-sm border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
        />
        <label className="text-xs font-semibold text-ink/50 mb-1.5 block">Seats</label>
        <input
          type="number"
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
          className="w-full mb-4 text-sm font-ticket border border-ink/10 rounded-xl px-3 py-2.5 outline-none focus:border-ember"
        />
        <Button className="w-full" disabled={!label.trim()} onClick={() => onAdd(label.trim(), Number(seats) || 2)}>
          Add table
        </Button>
      </div>
    </div>
  )
}

function ReservationsView({ tables }: { tables: ReturnType<typeof useTablesStore.getState>['tables'] }) {
  const reservations = useReservationsStore((s) => s.reservations)
  const addReservation = useReservationsStore((s) => s.addReservation)
  const assignTable = useReservationsStore((s) => s.assignTable)
  const markNoShow = useReservationsStore((s) => s.markNoShow)
  const cancel = useReservationsStore((s) => s.cancel)
  const seatReservation = useTablesStore((s) => s.seatReservation)
  const markArrived = useTablesStore((s) => s.markArrived)

  const [adding, setAdding] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [phone, setPhone] = useState('')
  const [partySize, setPartySize] = useState('2')
  const [arrivalTime, setArrivalTime] = useState('19:00')
  const [requests, setRequests] = useState('')
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const upcoming = reservations.filter((r) => r.status === 'upcoming')
  const availableTables = tables.filter((t) => t.status === 'available')

  function handleAdd() {
    if (!guestName.trim()) return
    const [h, m] = arrivalTime.split(':').map(Number)
    const time = new Date()
    time.setHours(h, m, 0, 0)
    addReservation({ guestName: guestName.trim(), phone: phone.trim(), partySize: Number(partySize) || 1, arrivalTime: time.toISOString(), specialRequests: requests.trim() || undefined })
    setGuestName(''); setPhone(''); setPartySize('2'); setRequests('')
    setAdding(false)
  }

  function handleAssign(reservationId: string, tableId: string) {
    const res = reservations.find((r) => r.id === reservationId)!
    assignTable(reservationId, tableId)
    seatReservation(tableId, res.guestName, res.partySize)
    setAssigningId(null)
  }

  function handleArrived(reservationId: string, tableId: string) {
    markArrived(tableId)
    // Reservation stays visible under "upcoming" filter only until table state flips —
    // in the real app this would move to a "seated" list. Kept simple here.
    cancel(reservationId) // removes from upcoming list; table is now occupied, which is what matters
  }

  return (
    <div className="max-w-2xl">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-1.5 text-sm text-ink/50">
          <CalendarClock size={15} /> {upcoming.length} upcoming today
        </div>
        <button onClick={() => setAdding(true)} className="text-sm font-semibold text-ember">+ New reservation</button>
      </div>

      {adding && (
        <Card className="p-4 mb-3">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Guest name" className="text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember" />
            <input type="number" value={partySize} onChange={(e) => setPartySize(e.target.value)} placeholder="Party size" className="text-sm font-ticket border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember" />
            <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} className="text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember" />
          </div>
          <input value={requests} onChange={(e) => setRequests(e.target.value)} placeholder="Special requests (optional)" className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember mb-3" />
          <Button className="w-full" disabled={!guestName.trim()} onClick={handleAdd}>Add reservation</Button>
        </Card>
      )}

      <div className="space-y-2">
        {upcoming.length === 0 && <p className="text-sm text-ink/40 text-center py-8">No upcoming reservations.</p>}
        {upcoming.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex justify-between items-start mb-1">
              <div>
                <div className="font-semibold text-sm">{r.guestName}</div>
                <div className="text-xs text-ink/40">{r.phone} · {r.partySize} guests · {new Date(r.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <button onClick={() => markNoShow(r.id)} className="text-xs font-semibold text-ink/40 hover:text-status-cleaning">No-show</button>
            </div>
            {r.specialRequests && <p className="text-xs text-ink/50 mb-2">📝 {r.specialRequests}</p>}

            {r.tableId ? (
              <button onClick={() => handleArrived(r.id, r.tableId!)} className="text-xs font-semibold rounded-full bg-status-available-bg text-status-available px-3 py-1.5">
                Mark arrived — seat at {tables.find((t) => t.id === r.tableId)?.label}
              </button>
            ) : assigningId === r.id ? (
              <div className="flex gap-1.5 flex-wrap">
                {availableTables.length === 0 && <span className="text-xs text-ink/40">No available tables right now.</span>}
                {availableTables.map((t) => (
                  <button key={t.id} onClick={() => handleAssign(r.id, t.id)} className="text-xs font-semibold rounded-full border border-ink/10 px-2.5 py-1 hover:bg-ink/5">
                    {t.label}
                  </button>
                ))}
              </div>
            ) : (
              <button onClick={() => setAssigningId(r.id)} className="text-xs font-semibold rounded-full border border-ink/10 px-3 py-1.5 hover:bg-ink/5">
                Assign a table
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
