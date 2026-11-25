import { Outlet, useRouterState } from '@tanstack/react-router'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { Spinner } from '@/components/common/ui'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { useAuth } from '@/hooks/useAuth'
import { SocketProvider } from '@/hooks/useSocket'

export function AppLayout() {
  const { isLoading } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  if (isLoading) {
    return (
      <div className="grid h-full place-items-center text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Spinner className="size-5" /> Loading your session…
        </span>
      </div>
    )
  }

  return (
    <SocketProvider>
      <div className="flex h-full flex-col">
        <Header />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-6xl">
              {/* Reset when the route changes so one broken page doesn't block navigation. */}
              <ErrorBoundary resetKey={pathname}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
    </SocketProvider>
  )
}
