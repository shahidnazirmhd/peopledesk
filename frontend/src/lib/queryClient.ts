import { QueryClient } from '@tanstack/react-query'
import { isHttpError } from '@/lib/errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Live lists are kept fresh by Socket.IO events; there is no polling and
      // no refetch on window focus. Pages refetch when they mount (staleTime 0).
      staleTime: 0,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => !isHttpError(error) && failureCount < 2,
    },
    mutations: { retry: false },
  },
})
