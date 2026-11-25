import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Modal } from '@/components/common/Modal'
import { useToast } from '@/components/common/Toast'
import { Alert, Button, Field, Input } from '@/components/common/ui'
import { useCreateEmployee, useUpdateEmployee } from '@/hooks/useEmployees'
import { ApiError, toApiError } from '@/lib/errors'
import { applyEmployeeEvent } from '@/lib/realtimeCache'
import { employeeSchema, type EmployeeForm } from '@/schemas'
import type { Employee } from '@/types'

interface Props {
  /** null = create a new employee. */
  employee: Employee | null
  /** Newest copy of this employee from the live cache; differs from `employee` when someone else edited it. */
  latest?: Employee
  departments: string[]
  onClose: () => void
}

const toForm = (e: Employee | null): EmployeeForm => ({
  name: e?.name ?? '',
  department: e?.department ?? '',
  title: e?.title ?? '',
})

export function EmployeeFormModal({ employee, latest, departments, onClose }: Props) {
  const toast = useToast()
  const qc = useQueryClient()
  const create = useCreateEmployee()
  const update = useUpdateEmployee()

  // The record (and version) this form is based on. It only changes when the
  // user explicitly loads a newer copy, or after a 409 conflict.
  const [base, setBase] = useState<Employee | null>(employee)
  const [conflict, setConflict] = useState<{ message: string; mine: EmployeeForm } | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const form = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: toForm(employee),
  })
  const { register, handleSubmit, reset, formState } = form
  const { errors, isDirty } = formState
  const saving = create.isPending || update.isPending
  const isEdit = base !== null

  const outdated = isEdit && !conflict && latest && base && latest.version > base.version

  const loadLatest = (record: Employee) => {
    setBase(record)
    reset(toForm(record))
  }

  const requestClose = () => {
    if (isDirty && !saving) setConfirmDiscard(true)
    else onClose()
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      if (base) {
        const saved = await update.mutateAsync({ id: base.id, ...values, version: base.version })
        toast.success(
          saved.version === base.version
            ? 'No changes to save.'
            : `Employee ${saved.employee_code} updated.`,
        )
      } else {
        const saved = await create.mutateAsync(values)
        toast.success(`Employee ${saved.employee_code} created.`)
      }
      onClose()
    } catch (err) {
      const e = toApiError(err)
      if (e.status === 409 && e.code === 'version_conflict') {
        // Someone else saved first. Show what happened and reload the latest record.
        const current = (e.details as { current?: Employee } | undefined)?.current
        if (current) {
          applyEmployeeEvent(qc, current, 'updated')
          loadLatest(current)
        }
        setConflict({ message: e.message, mine: values })
        return
      }
      if (e.status === 404) {
        toast.error('This employee no longer exists.')
        onClose()
        return
      }
      setServerError(e.message)
    }
  })

  return (
    <>
      <Modal
        open
        title={isEdit ? `Edit employee ${base?.employee_code}` : 'Add employee'}
        onClose={requestClose}
        locked={saving}
        footer={
          <>
            <Button variant="secondary" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="employee-form" loading={saving}>
              {isEdit ? 'Save changes' : 'Create employee'}
            </Button>
          </>
        }
      >
        <form id="employee-form" onSubmit={onSubmit} noValidate className="space-y-4">
          {conflict && (
            <Alert tone="warning" title="Your changes were not saved">
              <p>{conflict.message}</p>
              <p className="mt-1 text-xs">
                Your unsaved edit was: <strong>{conflict.mine.name}</strong> · {conflict.mine.department} ·{' '}
                {conflict.mine.title}
              </p>
            </Alert>
          )}
          {outdated && latest && (
            <Alert tone="warning" title="This employee was just updated">
              <p>
                {latest.updated_by_display_name ?? 'Another user'} saved a newer version (v{latest.version}) while
                you were editing.
              </p>
              <Button variant="secondary" className="mt-2" onClick={() => loadLatest(latest)}>
                Load latest version
              </Button>
            </Alert>
          )}
          {serverError && <Alert>{serverError}</Alert>}

          <Field label="Employee name" htmlFor="emp-name" error={errors.name?.message}>
            <Input id="emp-name" autoComplete="off" invalid={!!errors.name} {...register('name')} />
          </Field>
          <Field label="Department" htmlFor="emp-dept" error={errors.department?.message}>
            <Input
              id="emp-dept"
              list="emp-dept-options"
              autoComplete="off"
              invalid={!!errors.department}
              {...register('department')}
            />
            <datalist id="emp-dept-options">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
          <Field label="Job title" htmlFor="emp-title" error={errors.title?.message}>
            <Input id="emp-title" autoComplete="off" invalid={!!errors.title} {...register('title')} />
          </Field>

          {isEdit && base && (
            <p className="text-xs text-slate-500">
              Version {base.version}
              {base.updated_by_display_name ? ` · last updated by ${base.updated_by_display_name}` : ''}
            </p>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        confirmLabel="Discard"
        danger
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      >
        You have unsaved changes. Closing this form will lose them.
      </ConfirmDialog>
    </>
  )
}

export { ApiError }
