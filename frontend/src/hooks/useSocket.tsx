import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import type { Socket } from 'socket.io-client'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { clearToken } from '@/lib/auth'
import { activityFlashKey, employeeFlashKey, markFlash } from '@/lib/flash'
import { activityKeys, employeeKeys, meKey } from '@/lib/queryKeys'
import { applyActivityEvent, applyEmployeeEvent } from '@/lib/realtimeCache'
import { createSocket } from '@/lib/socket'
import type { Activity, Employee, User } from '@/types'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

interface SocketState {
  socket: Socket | null
  status: ConnectionStatus
  /** "websocket" or "polling" once connected. */
  transport: string | null
}

const SocketContext = createContext<SocketState>({
  socket: null,
  status: 'connecting',
  transport: null,
})

/**
 * Owns the single Socket.IO connection for the signed-in session and turns
 * server events into TanStack Query cache updates. Mounted only while
 * authenticated, so logging out closes the connection.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [state, setState] = useState<SocketState>({
    socket: null,
    status: 'connecting',
    transport: null,
  })

  useEffect(() => {
    const socket = createSocket()
    let everConnected = false
    const set = (patch: Partial<SocketState>) => setState((s) => ({ ...s, ...patch }))

    const myId = () => qc.getQueryData<User>(meKey)?.id

    socket.on('connect', () => {
      everConnected = true
      set({ status: 'connected', transport: socket.io.engine.transport.name })
      // Reflect the polling -> websocket upgrade in the UI.
      socket.io.engine.on('upgrade', (t: { name: string }) => set({ transport: t.name }))
    })

    socket.on('disconnect', (reason) => {
      // "io server disconnect" = server closed us (we do not auto-retry that case).
      const next = reason === 'io server disconnect' ? 'disconnected' : 'reconnecting'
      set({ status: navigator.onLine ? next : 'disconnected', transport: null })
    })

    socket.on('connect_error', (err) => {
      // Rejected by the server's auth check: the socket will not retry by itself.
      if (!socket.active) {
        const expired = err.message === 'token_expired'
        clearToken(
          expired
            ? 'Your session has expired. Please sign in again.'
            : 'You have been signed out. Please sign in again.',
        )
        return
      }
      // Network / server down: Socket.IO keeps retrying with backoff.
      const next = everConnected ? 'reconnecting' : 'connecting'
      set({ status: navigator.onLine ? next : 'disconnected', transport: null })
    })

    socket.io.on('reconnect_attempt', () => {
      if (navigator.onLine) set({ status: 'reconnecting' })
    })

    // The browser knows about a lost network long before Socket.IO's ping
    // timeout (up to ~45s) would notice, so reflect it in the UI immediately.
    const onOffline = () => set({ status: 'disconnected', transport: null })
    const onOnline = () =>
      set(
        socket.connected
          ? { status: 'connected', transport: socket.io.engine.transport.name }
          : { status: 'reconnecting', transport: null },
      )
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)

    socket.on('auth:expired', () => {
      clearToken('Your session has expired. Please sign in again.')
    })

    // If patching the cache ever fails, fall back to refetching so the UI can
    // never silently drift from the database.
    const safely = (fallbackKey: QueryKey, fn: () => void) => {
      try {
        fn()
      } catch (err) {
        console.error('Failed to apply real-time event; refetching instead', err)
        void qc.invalidateQueries({ queryKey: fallbackKey })
      }
    }

    socket.on('employee:created', (e: Employee) =>
      safely(employeeKeys.all, () => {
        if (applyEmployeeEvent(qc, e, 'created') && e.updated_by !== myId()) markFlash(employeeFlashKey(e.id))
      }),
    )
    socket.on('employee:updated', (e: Employee) =>
      safely(employeeKeys.all, () => {
        if (applyEmployeeEvent(qc, e, 'updated') && e.updated_by !== myId()) markFlash(employeeFlashKey(e.id))
      }),
    )
    socket.on('activity:new', (a: Activity) =>
      safely(activityKeys.all, () => {
        if (applyActivityEvent(qc, a) && a.user_id !== myId()) markFlash(activityFlashKey(a.id))
      }),
    )

    setState({ socket, status: 'connecting', transport: null })
    socket.connect()

    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      socket.removeAllListeners()
      socket.io.removeAllListeners()
      socket.disconnect()
    }
  }, [qc])

  const value = useMemo(() => state, [state])
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket(): SocketState {
  return useContext(SocketContext)
}

/**
 * Join a Socket.IO room while the calling page is mounted and leave it on
 * unmount. Rooms live on the server per connection, so the subscription is
 * re-sent after every reconnect, and the page's queries are refetched once the
 * server confirms it - that closes the gap for anything missed while offline.
 */
export function useSocketRoom(room: 'employee' | 'activity', refetchKeys: QueryKey) {
  const { socket } = useSocket()
  const qc = useQueryClient()

  useEffect(() => {
    if (!socket) return
    let joinedBefore = false

    const subscribe = () => {
      socket.emit(`${room}:subscribe`, null, (ack?: { ok: boolean }) => {
        if (!ack?.ok) return
        if (joinedBefore) void qc.invalidateQueries({ queryKey: refetchKeys })
        joinedBefore = true
      })
    }

    if (socket.connected) subscribe()
    socket.on('connect', subscribe)

    return () => {
      socket.off('connect', subscribe)
      if (socket.connected) socket.emit(`${room}:unsubscribe`)
    }
    // refetchKeys is a stable module-level constant at call sites.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, room, qc])
}
