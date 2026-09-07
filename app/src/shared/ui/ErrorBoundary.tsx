import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  hasError: boolean
}

/**
 * Catches errors React would otherwise let crash the whole app to a blank
 * screen — most commonly a lazy-loaded page (like Reports) failing to load
 * its code chunk right after a fresh deploy, when an old cached page is
 * asking the server for a file name that no longer exists. Reloading always
 * fixes that specific case, so that's the button offered.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[ErrorBoundary] caught', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-sm mx-auto text-center pt-20">
          <div className="font-ticket text-lg font-bold mb-2">Couldn't load {this.props.label ?? 'this page'}</div>
          <p className="text-sm text-ink/50 mb-5">
            This usually happens right after an update — refreshing the page fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-ink text-paper px-4 py-3 text-sm font-semibold"
          >
            Refresh
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
