import { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, Plus, Pencil, Trash2, History } from 'lucide-react'
import { Card } from '../../shared/ui/Card'
import { Button } from '../../shared/ui/Button'
import { useAuthStore } from '../auth/authStore'
import { useBankLedgerStore, type BankLedgerHistoryEntry } from './bankLedgerStore'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function BankPage() {
  const canSeeFinancials = useAuthStore((s) => s.staff?.permissions.financials ?? false)
  const entries = useBankLedgerStore((s) => s.entries)
  const loading = useBankLedgerStore((s) => s.loading)
  const init = useBankLedgerStore((s) => s.init)
  const addEntry = useBankLedgerStore((s) => s.addEntry)
  const editEntry = useBankLedgerStore((s) => s.editEntry)
  const deleteEntry = useBankLedgerStore((s) => s.deleteEntry)
  const fetchHistory = useBankLedgerStore((s) => s.fetchHistory)

  useEffect(() => {
    if (canSeeFinancials) init()
  }, [canSeeFinancials, init])

  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(todayISO())

  const [adding, setAdding] = useState(false)
  const [entryDate, setEntryDate] = useState(todayISO())
  const [kind, setKind] = useState<'credit' | 'debit'>('credit')
  const [amount, setAmount] = useState('')
  const [remark, setRemark] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState(todayISO())
  const [editKind, setEditKind] = useState<'credit' | 'debit'>('credit')
  const [editAmount, setEditAmount] = useState('')
  const [editRemark, setEditRemark] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null)
  const [historyData, setHistoryData] = useState<BankLedgerHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // If this is truly the first entry ever (nothing exists yet at all,
  // ignoring the date filter), nudge toward "Opening balance" as the remark
  // — but it's still just a normal entry underneath, nothing special stored.
  const isFirstEntryEver = entries.length === 0

  async function handleAdd() {
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (!remark.trim()) {
      setError('A remark is required — this is the audit trail, so every entry needs to say what it was for.')
      return
    }
    const signedAmount = kind === 'credit' ? amt : -amt
    const result = await addEntry(entryDate, signedAmount, remark.trim())
    if (!result.ok) {
      setError(result.error ?? 'Could not save that entry.')
      return
    }
    setAmount('')
    setRemark('')
    setKind('credit')
    setEntryDate(todayISO())
    setAdding(false)
    setError(null)
  }

  function startEdit(entryId: string, currentDate: string, currentAmount: number, currentRemark: string) {
    setEditingId(entryId)
    setEditDate(currentDate)
    setEditKind(currentAmount >= 0 ? 'credit' : 'debit')
    setEditAmount(String(Math.abs(currentAmount)))
    setEditRemark(currentRemark)
    setEditError(null)
    setHistoryOpenId(null)
  }

  async function handleSaveEdit() {
    if (!editingId) return
    const amt = Number(editAmount)
    if (!amt || amt <= 0) {
      setEditError('Enter an amount greater than zero.')
      return
    }
    if (!editRemark.trim()) {
      setEditError('A remark is required.')
      return
    }
    const signedAmount = editKind === 'credit' ? amt : -amt
    const result = await editEntry(editingId, editDate, signedAmount, editRemark.trim())
    if (!result.ok) {
      setEditError(result.error ?? 'Could not save that change.')
      return
    }
    setEditingId(null)
    setEditError(null)
  }

  async function handleDelete(entryId: string, remark: string) {
    if (!window.confirm(`Remove "${remark}"? It stays visible with a "Deleted" mark and its full history — this isn't a silent delete.`)) return
    const result = await deleteEntry(entryId)
    if (!result.ok) window.alert(result.error ?? 'Could not remove that entry.')
  }

  async function toggleHistory(entryId: string) {
    if (historyOpenId === entryId) {
      setHistoryOpenId(null)
      return
    }
    setHistoryOpenId(entryId)
    setEditingId(null)
    setHistoryLoading(true)
    setHistoryData(await fetchHistory(entryId))
    setHistoryLoading(false)
  }

  // Running balance skips deleted entries entirely — they don't count
  // toward the balance anymore, but the row itself still shows in the list
  // (struck through, with who deleted it and when) rather than vanishing.
  const withRunningBalance = useMemo(() => {
    let running = 0
    return entries.map((e) => {
      if (!e.deletedAt) running += e.amount
      return { ...e, runningBalance: running }
    })
  }, [entries])

  const filtered = withRunningBalance.filter((e) => e.entryDate >= from && e.entryDate <= to)
  const currentBalance = withRunningBalance.length > 0 ? withRunningBalance[withRunningBalance.length - 1].runningBalance : 0

  if (!canSeeFinancials) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center py-24">
        <ShieldAlert size={28} className="mx-auto mb-3 text-ink/20" />
        <p className="text-sm text-ink/40">This page is only visible to staff with the "Bank account, transfers & full sales history" permission.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert size={16} className="text-ink/40" />
        <h1 className="font-ticket text-lg font-bold">Bank</h1>
      </div>
      <p className="text-xs text-ink/40 mb-5">
        The real bank balance, kept by hand — separate from the app's own internal Bank account, which only tracks money moved through Accounts &amp; transfers. Fonepay settles once a day rather than per-transaction, so each morning you'll see that day's Fonepay revenue and Fonepay purchases already posted automatically, tagged "Auto." Entries can be edited or removed if something needs correcting, but nothing is ever silently rewritten — every change keeps the original values permanently in that entry's history, visible to anyone with access to this page.
      </p>

      <Card className="p-4 mb-4">
        <div className="text-xs text-ink/40 mb-1">Current balance</div>
        <div className="font-ticket text-3xl font-bold">Rs. {currentBalance.toLocaleString()}</div>
      </Card>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-ember bg-ember/10 rounded-xl py-2.5 mb-4"
        >
          <Plus size={15} /> {isFirstEntryEver ? 'Set opening balance' : 'Add entry'}
        </button>
      ) : (
        <Card className="p-4 mb-4">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setKind('credit')}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold ${kind === 'credit' ? 'bg-status-available/15 text-status-available' : 'bg-ink/5 text-ink/40'}`}
            >
              Credit (money in)
            </button>
            <button
              onClick={() => setKind('debit')}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold ${kind === 'debit' ? 'bg-status-cleaning/15 text-status-cleaning' : 'bg-ink/5 text-ink/40'}`}
            >
              Debit (money out)
            </button>
          </div>
          <div className="flex gap-2 mb-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-ink/50 block mb-1">Date</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-ink/50 block mb-1">Amount</label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
              />
            </div>
          </div>
          <label className="text-xs font-semibold text-ink/50 block mb-1">Remark</label>
          <input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder={isFirstEntryEver ? 'Opening balance' : 'What was this for?'}
            className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember mb-3"
          />
          {error && <div className="mb-3 text-xs font-semibold text-status-cleaning bg-status-cleaning-bg rounded-xl px-3 py-2">{error}</div>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleAdd}>
              Save entry
            </Button>
            <button
              onClick={() => {
                setAdding(false)
                setError(null)
              }}
              className="text-sm font-semibold text-ink/40 px-3"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div>
          <label className="text-[10px] font-semibold text-ink/40 block">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-xs border border-ink/10 rounded-lg px-2 py-1 outline-none focus:border-ember" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-ink/40 block">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-xs border border-ink/10 rounded-lg px-2 py-1 outline-none focus:border-ember" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-14 rounded-2xl bg-ink/5 animate-pulse" />
          <div className="h-14 rounded-2xl bg-ink/5 animate-pulse" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-ink/30 italic py-16 text-center border border-dashed border-ink/10 rounded-2xl">No entries in this range.</p>
      ) : (
        <div className="space-y-2">
          {[...filtered].reverse().map((e) =>
            editingId === e.id ? (
              <Card key={e.id} className="p-4">
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setEditKind('credit')}
                    className={`flex-1 rounded-xl py-2 text-sm font-semibold ${editKind === 'credit' ? 'bg-status-available/15 text-status-available' : 'bg-ink/5 text-ink/40'}`}
                  >
                    Credit (money in)
                  </button>
                  <button
                    onClick={() => setEditKind('debit')}
                    className={`flex-1 rounded-xl py-2 text-sm font-semibold ${editKind === 'debit' ? 'bg-status-cleaning/15 text-status-cleaning' : 'bg-ink/5 text-ink/40'}`}
                  >
                    Debit (money out)
                  </button>
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-ink/50 block mb-1">Date</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(ev) => setEditDate(ev.target.value)}
                      className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-ink/50 block mb-1">Amount</label>
                    <input
                      type="number"
                      min="0"
                      value={editAmount}
                      onChange={(ev) => setEditAmount(ev.target.value)}
                      className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember"
                    />
                  </div>
                </div>
                <label className="text-xs font-semibold text-ink/50 block mb-1">Remark</label>
                <input
                  value={editRemark}
                  onChange={(ev) => setEditRemark(ev.target.value)}
                  className="w-full text-sm border border-ink/10 rounded-xl px-3 py-2 outline-none focus:border-ember mb-3"
                />
                {editError && <div className="mb-3 text-xs font-semibold text-status-cleaning bg-status-cleaning-bg rounded-xl px-3 py-2">{editError}</div>}
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={handleSaveEdit}>
                    Save change
                  </Button>
                  <button onClick={() => setEditingId(null)} className="text-sm font-semibold text-ink/40 px-3">
                    Cancel
                  </button>
                </div>
              </Card>
            ) : (
              <Card key={e.id} className={`p-3.5 ${e.deletedAt ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-sm font-semibold flex items-center gap-1.5 ${e.deletedAt ? 'line-through' : ''}`}>
                    {e.remark}
                    {e.source && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-ember bg-ember/10 rounded-full px-1.5 py-0.5">Auto</span>
                    )}
                    {e.editedAt && !e.deletedAt && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-ink/40 bg-ink/5 rounded-full px-1.5 py-0.5">Edited</span>
                    )}
                  </span>
                  <span className={`font-ticket font-bold text-sm ${e.deletedAt ? 'text-ink/40' : e.amount >= 0 ? 'text-status-available' : 'text-status-cleaning'}`}>
                    {e.amount >= 0 ? '+' : ''}Rs. {e.amount.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-ink/40 mb-1.5">
                  <span>
                    {e.deletedAt ? `Deleted by ${e.deletedByName}` : `${new Date(e.entryDate).toLocaleDateString()} · ${e.createdByName}`}
                  </span>
                  {!e.deletedAt && <span>Balance: Rs. {e.runningBalance.toLocaleString()}</span>}
                </div>
                <div className="flex items-center gap-3">
                  {!e.deletedAt && (
                    <button
                      onClick={() => startEdit(e.id, e.entryDate, e.amount, e.remark)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-ink/40 hover:text-ember"
                    >
                      <Pencil size={11} /> Edit
                    </button>
                  )}
                  {!e.deletedAt && (
                    <button
                      onClick={() => handleDelete(e.id, e.remark)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-ink/40 hover:text-status-cleaning"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  )}
                  {(e.editedAt || e.deletedAt) && (
                    <button
                      onClick={() => toggleHistory(e.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-ink/40 hover:text-ink"
                    >
                      <History size={11} /> History
                    </button>
                  )}
                </div>
                {historyOpenId === e.id && (
                  <div className="mt-2.5 pt-2.5 border-t border-ink/5 space-y-1.5">
                    {historyLoading ? (
                      <div className="text-xs text-ink/30">Loading…</div>
                    ) : (
                      historyData.map((h, i) => (
                        <div key={i} className="text-xs text-ink/50">
                          <span className="font-semibold">{h.changeType === 'delete' ? 'Removed' : 'Was'}</span> by {h.changedByName} on {new Date(h.changedAt).toLocaleString()} — was{' '}
                          <span className="font-semibold">{h.previousAmount >= 0 ? '+' : ''}Rs. {h.previousAmount.toLocaleString()}</span>, "{h.previousRemark}"
                        </div>
                      ))
                    )}
                  </div>
                )}
              </Card>
            )
          )}
        </div>
      )}
    </div>
  )
}
