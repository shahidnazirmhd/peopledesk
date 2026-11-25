import { useSocket, type ConnectionStatus as Status } from '@/hooks/useSocket'

const CONFIG: Record<Status, { label: string; dot: string; text: string; pulse?: boolean }> = {
  connected: { label: 'Live', dot: 'bg-emerald-500', text: 'text-emerald-800 bg-emerald-50' },
  connecting: { label: 'Connecting…', dot: 'bg-amber-500', text: 'text-amber-800 bg-amber-50', pulse: true },
  reconnecting: { label: 'Reconnecting…', dot: 'bg-amber-500', text: 'text-amber-800 bg-amber-50', pulse: true },
  disconnected: { label: 'Offline', dot: 'bg-red-500', text: 'text-red-800 bg-red-50' },
}

export function ConnectionStatus() {
  const { status, transport } = useSocket()
  const c = CONFIG[status]
  return (
    <div
      role="status"
      data-testid="connection-status"
      data-status={status}
      data-transport={transport ?? ''}
      title={
        status === 'connected'
          ? `Real-time connection active (${transport})`
          : 'Real-time updates are paused until the connection is restored'
      }
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${c.text}`}
    >
      <span className={`size-2 rounded-full ${c.dot} ${c.pulse ? 'animate-pulse' : ''}`} aria-hidden />
      <span>{c.label}</span>
      {status === 'connected' && transport && (
        <span className="hidden text-[0.7rem] font-normal opacity-70 md:inline">· {transport}</span>
      )}
    </div>
  )
}
