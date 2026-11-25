import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { ToastProvider } from '@/components/common/Toast'
import { getToken, subscribeToken } from '@/lib/auth'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'

/** Whenever the session ends anywhere (logout, expiry, 401, socket rejection), go to the login page. */
function useSessionRedirect() {
  useEffect(
    () =>
      subscribeToken(() => {
        if (!getToken()) {
          queryClient.clear()
          void router.navigate({ to: '/login', replace: true })
        }
      }),
    [],
  )
}

export default function App() {
  useSessionRedirect()
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
