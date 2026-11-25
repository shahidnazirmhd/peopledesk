import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { clearToken, getToken, setToken, subscribeToken } from '@/lib/auth'
import { meKey } from '@/lib/queryKeys'
import type { LoginResponse, User } from '@/types'

export const meQuery = queryOptions({
  queryKey: meKey,
  queryFn: async () => (await api.get<User>('/api/auth/me')).data,
  staleTime: 5 * 60_000,
})

/** Reactive view of the stored token (changes on login, logout, expiry, 401). */
export function useToken(): string | null {
  return useSyncExternalStore(subscribeToken, getToken, () => null)
}

export function useAuth() {
  const qc = useQueryClient()
  const token = useToken()
  const query = useQuery({ ...meQuery, enabled: !!token })

  const login = useCallback(
    async (username: string, password: string): Promise<User> => {
      const { data } = await api.post<LoginResponse>('/api/auth/login', { username, password })
      qc.clear() // never show a previous user's cached data
      qc.setQueryData(meKey, data.user)
      setToken(data.access_token)
      return data.user
    },
    [qc],
  )

  const logout = useCallback(async () => {
    try {
      // Records the logout activity. Failure (expired token, offline) must not block signing out.
      if (getToken()) await api.post('/api/auth/logout')
    } catch {
      /* ignore */
    } finally {
      clearToken()
      qc.clear()
    }
  }, [qc])

  return {
    token,
    user: query.data ?? null,
    isLoading: !!token && query.isPending,
    isAdmin: query.data?.role === 'admin',
    login,
    logout,
  }
}
