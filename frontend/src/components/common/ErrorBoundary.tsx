import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, Button } from '@/components/common/ui'

interface Props {
  children: ReactNode
  /** Changing this value resets the boundary (e.g. pass the current route path). */
  resetKey?: string
}
interface State {
  error: Error | null
  resetKey?: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI error caught by boundary', error, info.componentStack)
  }

  render() {
    if (this.state.error) return <ErrorFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}

export function ErrorFallback({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  return (
    <div className="mx-auto max-w-xl p-6">
      <Alert title="Something went wrong on this page">
        <p className="mt-1 break-words">{message}</p>
        <div className="mt-3 flex gap-2">
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </Alert>
    </div>
  )
}
