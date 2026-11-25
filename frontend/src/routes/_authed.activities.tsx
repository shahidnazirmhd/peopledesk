import { createFileRoute, redirect } from '@tanstack/react-router'
import { ActivitiesPage } from '@/components/activities/ActivitiesPage'
import { meQuery } from '@/hooks/useAuth'

export const Route = createFileRoute('/_authed/activities')({
  // UX guard only; the backend returns 403 regardless.
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me.role !== 'admin') throw redirect({ to: '/employees', replace: true })
  },
  component: ActivitiesPage,
})