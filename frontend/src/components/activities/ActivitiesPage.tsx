import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useMemo } from 'react'
import { DataTable } from '@/components/common/DataTable'
import { Alert, Badge, Button, PageHeader } from '@/components/common/ui'
import { useActivities } from '@/hooks/useActivities'
import { useSocketRoom } from '@/hooks/useSocket'
import { errorMessage } from '@/lib/errors'
import { activityKeys } from '@/lib/queryKeys'
import { activityFlashKey, useFlashing } from '@/lib/flash'
import type { Activity } from '@/types'
import { activityLabel, formatDateTime } from '@/utils/format'

const helper = createColumnHelper<Activity>()
const EMPTY: Activity[] = []
const REFETCH_ON_RECONNECT = activityKeys.all

const TONES: Record<string, 'teal' | 'slate' | 'blue' | 'amber' | 'violet'> = {
  user_login: 'slate',
  user_logout: 'slate',
  user_created: 'violet',
  employee_created: 'teal',
  employee_updated: 'amber',
}

export function ActivitiesPage() {
  // Join the activity_viewers room while this page is open.
  useSocketRoom('activity', REFETCH_ON_RECONNECT)

  const { data, isPending, isError, error, refetch } = useActivities()
  const isFlashing = useFlashing()

  const columns = useMemo(
    () => [
      helper.accessor('id', {
        header: 'Activity ID',
        cell: (c) => <span className="font-mono text-xs text-slate-600">#{c.getValue()}</span>,
      }),
      helper.accessor('username', {
        header: 'Username',
        cell: (c) => <span className="font-medium text-slate-900">{c.getValue()}</span>,
      }),
      helper.accessor('action', {
        header: 'Activity type',
        cell: (c) => <Badge tone={TONES[c.getValue()] ?? 'slate'}>{activityLabel(c.getValue())}</Badge>,
      }),
      helper.accessor('details', {
        header: 'Description',
        cell: (c) => <span className="text-slate-700">{c.getValue()}</span>,
      }),
      helper.accessor('created_at', {
        header: 'Date and time',
        cell: (c) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(c.getValue())}</span>,
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: data ?? EMPTY,
    columns,
    getRowId: (row) => String(row.id),
    enableSorting: false, // always newest first, as delivered by the server
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <>
      <PageHeader
        title="User Activity"
        description="The latest 100 actions across the system, newest first. New entries appear live."
      />
      {isError && !data ? (
        <Alert title="Could not load activity">
          <p>{errorMessage(error)}</p>
          <Button variant="secondary" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </Alert>
      ) : (
        <DataTable
          table={table}
          isLoading={isPending}
          emptyTitle="No activity recorded yet"
          emptyHint="Actions such as sign-ins and employee changes will show up here."
          rowClassName={(row) => (isFlashing(activityFlashKey(row.original.id)) ? 'row-flash' : '')}
        />
      )}
    </>
  )
}
