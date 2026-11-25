import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert, Button, Field, Input } from '@/components/common/ui'
import { useAuth } from '@/hooks/useAuth'
import { clearSessionNotice, peekSessionNotice } from '@/lib/auth'
import { toApiError } from '@/lib/errors'
import { loginSchema, type LoginForm } from '@/schemas'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<string | null>(() => peekSessionNotice())
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Show the "session expired" notice once, then forget it.
  useEffect(() => {
    if (notice) clearSessionNotice()
  }, [notice])

  const { register, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  })
  const { errors } = formState

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      await login(username, password)
      await navigate({ to: '/employees', replace: true })
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <div className="grid min-h-full place-items-center bg-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-teal-700 text-white shadow">
            <UsersRound className="size-6" aria-hidden />
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">PeopleDesk</h1>
          <p className="text-sm text-slate-500">Sign in to manage your people in real time</p>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {notice && (
            <Alert tone="warning">
              <p>{notice}</p>
            </Alert>
          )}
          {error && (
            <Alert>
              <p data-testid="login-error">{error}</p>
            </Alert>
          )}
          <Field label="Username" htmlFor="login-username" error={errors.username?.message}>
            <Input
              id="login-username"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              invalid={!!errors.username}
              {...register('username')}
            />
          </Field>
          <Field label="Password" htmlFor="login-password" error={errors.password?.message}>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              invalid={!!errors.password}
              {...register('password')}
            />
          </Field>
          <Button type="submit" className="w-full" loading={submitting}>
            Sign in
          </Button>
        </form>

        {import.meta.env.DEV && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Demo account (development only): <code className="font-mono">admin</code> /{' '}
            <code className="font-mono">Admin@123</code>
          </p>
        )}
      </div>
    </div>
  )
}
