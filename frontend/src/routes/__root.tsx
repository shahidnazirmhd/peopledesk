import type { QueryClient } from '@tanstack/react-query'
import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { ErrorFallback } from '@/components/common/ErrorBoundary'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  errorComponent: ({ error, reset }) => <ErrorFallback error={error} onRetry={reset} />,
  notFoundComponent: () => (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <p className="text-5xl font-semibold text-slate-300">404</p>
        <p className="mt-2 text-slate-600">That page does not exist.</p>
        <Link to="/employees" className="mt-4 inline-block text-sm font-medium text-teal-700 hover:underline">
          Go to Employee Master
        </Link>
      </div>
    </div>
  ),
})
