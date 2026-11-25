import { createFileRoute, redirect } from '@tanstack/react-router'
import { LoginPage } from '@/components/auth/LoginPage'
import { getToken } from '@/lib/auth'

export const Route = createFileRoute('/login')({
  // Already signed in? Skip the login page.
  beforeLoad: () => {
    if (getToken()) throw redirect({ to: '/employees', replace: true })
  },
  component: LoginPage,
})
