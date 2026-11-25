import { createFileRoute, redirect } from '@tanstack/react-router'
import { AppLayout } from '@/components/layout/AppLayout'
import { meQuery } from '@/hooks/useAuth'
import { getToken } from '@/lib/auth'

// Pathless layout route: everything under it requires a valid session.
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) => {
    if (!getToken()) throw redirect({ to: '/login', replace: true })
    try {
      // Loads (or reuses) the current user. A 401 here means the token is bad/expired:
      // the API client has already cleared it and queued the "session expired" notice.
      await context.queryClient.ensureQueryData(meQuery)
    } catch {
      throw redirect({ to: '/login', replace: true })
    }
  },
  component: AppLayout,
})
