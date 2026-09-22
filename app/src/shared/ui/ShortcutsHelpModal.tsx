import { X } from 'lucide-react'
import { SHORTCUT_LIST } from '../hooks/useKeyboardShortcuts'

export function ShortcutsHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] hidden md:flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface w-full max-w-xs rounded-3xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-ticket text-lg font-bold">Keyboard shortcuts</h2>
          <button onClick={onClose} className="text-ink/40"><X size={20} /></button>
        </div>
        <div className="space-y-2">
          {SHORTCUT_LIST.map((s) => (
            <div key={s.key} className="flex items-center justify-between text-sm">
              <span className="text-ink/70">{s.label}</span>
              <kbd className="font-ticket text-xs font-bold bg-ink/5 border border-ink/10 rounded-md px-2 py-1">{s.key}</kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink/40 mt-4">Only active while not typing in a field.</p>
      </div>
    </div>
  )
}
