import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const GO_TO: Record<string, string> = {
  f: '/tables',
  o: '/orders',
  k: '/kitchen',
  b: '/billing',
  m: '/menu',
  r: '/reports',
  s: '/settings',
}

/**
 * Desktop-only in practice — nobody's pressing "f" on a phone with no
 * physical keyboard, so it's safe to just always attach this. Ignores
 * keystrokes while typing in any input, textarea, select, or contenteditable
 * so it never steals a letter from someone filling out a form.
 */
export function useKeyboardShortcuts(onShowHelp: () => void) {
  const navigate = useNavigate()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isTyping =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
      if (isTyping || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '?') {
        e.preventDefault()
        onShowHelp()
        return
      }
      const path = GO_TO[e.key.toLowerCase()]
      if (path) {
        e.preventDefault()
        navigate(path)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [navigate, onShowHelp])
}

export const SHORTCUT_LIST = [
  { key: 'F', label: 'Go to Floor' },
  { key: 'O', label: 'Go to Orders' },
  { key: 'K', label: 'Go to Kitchen' },
  { key: 'B', label: 'Go to Billing' },
  { key: 'M', label: 'Go to Menu' },
  { key: 'R', label: 'Go to Reports' },
  { key: 'S', label: 'Go to Settings' },
  { key: '?', label: 'Show this list' },
]
