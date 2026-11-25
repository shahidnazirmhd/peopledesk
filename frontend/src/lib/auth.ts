/**
 * Token storage.
 *
 * The JWT lives in sessionStorage: it is scoped to one browser tab, so every
 * tab (or incognito window) has its own independent session, and it disappears
 * when the tab closes. Trade-offs vs httpOnly cookies are documented in the README.
 */

const TOKEN_KEY = 'pd_token'
const NOTICE_KEY = 'pd_session_notice'

type Listener = () => void
const listeners = new Set<Listener>()
let expiryTimer: ReturnType<typeof setTimeout> | undefined

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode quirks) - session simply won't persist */
  }
}

function notify(): void {
  listeners.forEach((l) => l())
}

/** `exp` (unix seconds) from the JWT payload. Used for UX only - the server is the authority. */
export function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = (JSON.parse(json) as { exp?: number }).exp
    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}

function scheduleExpiry(token: string | null): void {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = undefined
  if (!token) return
  const exp = tokenExpiry(token)
  if (exp === null) return
  // setTimeout cannot exceed ~24.8 days; tokens here live hours, but clamp anyway.
  const ms = Math.min(Math.max(exp * 1000 - Date.now(), 0), 2 ** 31 - 1)
  expiryTimer = setTimeout(() => clearToken('Your session has expired. Please sign in again.'), ms)
}

export function getToken(): string | null {
  const token = read(TOKEN_KEY)
  if (token) {
    const exp = tokenExpiry(token)
    if (exp !== null && exp * 1000 <= Date.now()) {
      write(TOKEN_KEY, null)
      write(NOTICE_KEY, 'Your session has expired. Please sign in again.')
      return null
    }
  }
  return token
}

export function setToken(token: string): void {
  write(TOKEN_KEY, token)
  write(NOTICE_KEY, null)
  scheduleExpiry(token)
  notify()
}

/** Forget the session. `notice` is shown on the login page (e.g. "session expired"). */
export function clearToken(notice?: string): void {
  write(TOKEN_KEY, null)
  if (notice) write(NOTICE_KEY, notice)
  scheduleExpiry(null)
  notify()
}

export function subscribeToken(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function peekSessionNotice(): string | null {
  return read(NOTICE_KEY)
}

export function clearSessionNotice(): void {
  write(NOTICE_KEY, null)
}

// Resume the expiry timer after a page reload.
scheduleExpiry(read(TOKEN_KEY))
