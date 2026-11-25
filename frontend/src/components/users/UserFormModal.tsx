import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Modal } from '@/components/common/Modal'
import { Alert, Badge, Button, Field, Input, Select } from '@/components/common/ui'
import { useCreateUser } from '@/hooks/useUsers'
import { toApiError } from '@/lib/errors'
import { userSchema, type UserForm } from '@/schemas'
import type { User } from '@/types'
import { formatDateTime, roleLabel } from '@/utils/format'

const EMPTY: UserForm = { display_name: '', username: '', password: '', role: 'user' }

export function UserFormModal({ onClose }: { onClose: () => void }) {
  const create = useCreateUser()
  const [created, setCreated] = useState<User | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [pendingAdmin, setPendingAdmin] = useState<UserForm | null>(null)

  const { register, handleSubmit, reset, setError, formState } = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: EMPTY,
  })
  const { errors } = formState

  const submit = async (values: UserForm) => {
    setServerError(null)
    setPendingAdmin(null)
    try {
      setCreated(await create.mutateAsync(values))
    } catch (err) {
      const e = toApiError(err)
      if (e.code === 'username_taken') setError('username', { message: 'That username is already taken.' })
      else if (e.status === 403) setServerError('You do not have permission to create users.')
      else setServerError(e.message)
    }
  }

  // Creating an administrator is a privileged action: ask for confirmation first.
  const onValid = (values: UserForm) => (values.role === 'admin' ? setPendingAdmin(values) : submit(values))

  if (created) {
    return (
      <Modal
        open
        title="User created"
        onClose={onClose}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreated(null)
                reset(EMPTY)
              }}
            >
              Add another
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        }
      >
        <div className="flex items-center gap-2 text-emerald-700">
          <CircleCheck className="size-5" aria-hidden />
          <p className="font-medium">The account is ready to use.</p>
        </div>
        <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-y-2 text-sm" data-testid="created-user-details">
          <dt className="text-slate-500">Display name</dt>
          <dd className="font-medium">{created.display_name}</dd>
          <dt className="text-slate-500">Username</dt>
          <dd className="font-mono">{created.username}</dd>
          <dt className="text-slate-500">Role</dt>
          <dd>
            <Badge tone={created.role === 'admin' ? 'violet' : 'slate'}>{roleLabel(created.role)}</Badge>
          </dd>
          <dt className="text-slate-500">Created</dt>
          <dd>{formatDateTime(created.created_at)}</dd>
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          Share the password with the user through a secure channel. It cannot be viewed again.
        </p>
      </Modal>
    )
  }

  return (
    <>
      <Modal
        open
        title="Add user"
        onClose={onClose}
        locked={create.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" form="user-form" loading={create.isPending}>
              Create user
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
          {serverError && <Alert>{serverError}</Alert>}
          <Field label="Display name" htmlFor="user-display" error={errors.display_name?.message}>
            <Input id="user-display" autoComplete="off" invalid={!!errors.display_name} {...register('display_name')} />
          </Field>
          <Field
            label="Username"
            htmlFor="user-username"
            error={errors.username?.message}
            hint="Used to sign in. Not case-sensitive."
          >
            <Input
              id="user-username"
              autoComplete="off"
              autoCapitalize="none"
              invalid={!!errors.username}
              {...register('username')}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="user-password"
            error={errors.password?.message}
            hint="At least 8 characters with upper-case, lower-case and a digit."
          >
            <Input
              id="user-password"
              type="password"
              autoComplete="new-password"
              invalid={!!errors.password}
              {...register('password')}
            />
          </Field>
          <Field label="Role" htmlFor="user-role" error={errors.role?.message}>
            <Select id="user-role" {...register('role')}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingAdmin !== null}
        title="Create an administrator?"
        confirmLabel="Create admin"
        loading={create.isPending}
        onConfirm={() => pendingAdmin && submit(pendingAdmin)}
        onCancel={() => setPendingAdmin(null)}
      >
        <strong>{pendingAdmin?.username}</strong> will be able to create users and manage all data. Only continue if
        this person needs administrator access.
      </ConfirmDialog>
    </>
  )
}
