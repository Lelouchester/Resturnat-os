type TableStatus = 'available' | 'occupied' | 'reserved' | 'billing' | 'needs_cleaning' | 'disabled'

const STYLES: Record<TableStatus, { label: string; fg: string; bg: string }> = {
  available: { label: 'Available', fg: 'var(--color-status-available)', bg: 'var(--color-status-available-bg)' },
  occupied: { label: 'Occupied', fg: 'var(--color-status-occupied)', bg: 'var(--color-status-occupied-bg)' },
  reserved: { label: 'Reserved', fg: 'var(--color-status-reserved)', bg: 'var(--color-status-reserved-bg)' },
  billing: { label: 'Billing', fg: 'var(--color-status-billing)', bg: 'var(--color-status-billing-bg)' },
  needs_cleaning: { label: 'Needs cleaning', fg: 'var(--color-status-cleaning)', bg: 'var(--color-status-cleaning-bg)' },
  disabled: { label: 'Disabled', fg: 'var(--color-status-disabled)', bg: 'var(--color-status-disabled-bg)' },
}

export function StatusPill({ status }: { status: TableStatus }) {
  const s = STYLES[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color: s.fg, background: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.fg }} />
      {s.label}
    </span>
  )
}

export type { TableStatus }
