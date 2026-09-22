import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertTriangle, Info, CheckCircle2, X } from 'lucide-react'
import { useNotifications } from '../../features/notifications/useNotifications'
import { useDismissedStore } from '../../features/notifications/dismissedStore'
import type { AppNotification } from '../../features/notifications/types'

const TONE_ICON: Record<AppNotification['tone'], typeof AlertTriangle> = {
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
}
const TONE_COLOR: Record<AppNotification['tone'], string> = {
  warning: 'text-status-cleaning',
  info: 'text-status-reserved',
  success: 'text-status-available',
}

export function NotificationBell({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false)
  const notifications = useNotifications()
  const dismiss = useDismissedStore((s) => s.dismiss)
  const navigate = useNavigate()

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-full p-2 transition-colors ${dark ? 'hover:bg-white/10 text-paper' : 'hover:bg-ink/5 text-ink'}`}
      >
        <Bell size={18} />
        {notifications.length > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-status-cleaning" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 md:right-auto md:left-0 mt-2 w-80 max-w-[85vw] bg-surface rounded-2xl shadow-xl border border-ink/5 z-50 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink/5">
              <span className="font-ticket text-xs font-bold uppercase tracking-wider text-ink/40">Notifications</span>
              <span className="text-xs text-ink/40">{notifications.length}</span>
            </div>
            {notifications.length === 0 ? (
              <p className="text-sm text-ink/40 text-center py-8">Nothing needs your attention right now.</p>
            ) : (
              notifications.map((n) => {
                const Icon = TONE_ICON[n.tone]
                return (
                  <div key={n.id} className="flex items-start gap-2.5 px-4 py-3 border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]">
                    <Icon size={15} className={`shrink-0 mt-0.5 ${TONE_COLOR[n.tone]}`} />
                    <button
                      className="flex-1 text-left text-sm text-ink/80"
                      onClick={() => { if (n.linkTo) navigate(n.linkTo); setOpen(false) }}
                    >
                      {n.message}
                    </button>
                    <button onClick={() => dismiss(n.id)} className="shrink-0 text-ink/30 hover:text-ink">
                      <X size={13} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
