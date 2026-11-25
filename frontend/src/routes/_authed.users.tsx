import { createFileRoute, redirect } from '@tanstack/react-router'
import { UsersPage } from '@/components/users/UsersPage'
import { meQuery } from '@/hooks/useAuth'

export const Route = createFileRoute('/_authed/users')({
  // UX guard only. The real enforcement is the backend: every /api/users call
  // returns 403 for non-admins regardless of what the UI shows.
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me.role !== 'admin') throw redirect({ to: '/employees', replace: true })
  },
  component: UsersPage,
})
