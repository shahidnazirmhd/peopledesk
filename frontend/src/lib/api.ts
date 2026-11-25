import axios from 'axios'
import { clearToken, getToken } from '@/lib/auth'
import { toApiError } from '@/lib/errors'
import { queryClient } from '@/lib/queryClient'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const apiError = toApiError(error)
    const isLogin = axios.isAxiosError(error) && error.config?.url?.includes('/api/auth/login')

    // An expired/invalid token on any other call means the session is over:
    // drop it and let the router send the user back to the login page.
    if (apiError.status === 401 && !isLogin && getToken()) {
      queryClient.clear()
      clearToken(
        apiError.code === 'token_expired'
          ? 'Your session has expired. Please sign in again.'
          : 'You have been signed out. Please sign in again.',
      )
    }
    return Promise.reject(apiError)
  },
)
