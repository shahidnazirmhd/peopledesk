import { io, type Socket } from 'socket.io-client'
import { getToken } from '@/lib/auth'

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:8000'

export type TransportName = 'polling' | 'websocket'
const TRANSPORT_KEY = 'pd_socket_transports'
const DEFAULT_TRANSPORTS: TransportName[] = ['polling', 'websocket']

function parseTransports(value: string | null | undefined): TransportName[] | null {
  if (!value) return null
  const list = value
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v): v is TransportName => v === 'polling' || v === 'websocket')
  return list.length ? list : null
}

/**
 * Transport order. Default is polling -> websocket: connect over HTTP long-polling
 * (works through any proxy) and upgrade to WebSocket when the network allows it.
 * Polling is never disabled unless you explicitly ask for websocket-only.
 */
export function getConfiguredTransports(): TransportName[] {
  let stored: string | null = null
  try {
    stored = sessionStorage.getItem(TRANSPORT_KEY)
  } catch {
    /* ignore */
  }
  return (
    parseTransports(stored) ??
    parseTransports(import.meta.env.VITE_SOCKET_TRANSPORTS) ??
    DEFAULT_TRANSPORTS
  )
}

/** `?transports=polling` forces a mode for this tab; `?transports=reset` clears it. */
export function applyTransportOverrideFromUrl(): void {
  try {
    const value = new URLSearchParams(window.location.search).get('transports')
    if (value === null) return
    if (value === 'reset') sessionStorage.removeItem(TRANSPORT_KEY)
    else if (parseTransports(value)) sessionStorage.setItem(TRANSPORT_KEY, value)
  } catch {
    /* ignore */
  }
}

export function createSocket(): Socket {
  return io(SOCKET_URL, {
    path: '/socket.io',
    autoConnect: false,
    transports: getConfiguredTransports(),
    upgrade: true, // polling -> websocket upgrade
    rememberUpgrade: false, // always re-probe from polling, so a blocked WebSocket can't brick reconnects
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.5,
    timeout: 10_000,
    // A function, so every (re)connect attempt sends the *current* token.
    auth: (cb) => cb({ token: getToken() }),
  })
}
