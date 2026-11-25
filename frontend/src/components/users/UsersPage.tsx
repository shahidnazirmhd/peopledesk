import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataTable, Pagination } from '@/components/common/DataTable'
import { Alert, Badge, Button, PageHeader } from '@/components/common/ui'
import { UserFormModal } from '@/components/users/UserFormModal'
import { useUsers } from '@/hooks/useUsers'
import { errorMessage } from '@/lib/errors'
import type { User } from '@/types'
import { formatDateTime, roleLabel } from '@/utils/format'

const helper = createColumnHelper<User>()
const EMPTY: User[] = []

export function UsersPage() {
  const { data, isPending, isError, error, refetch } = useUsers()
  const [adding, setAdding] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }])

  const columns = useMemo(
    () => [
      helper.accessor('display_name', {
        header: 'Display name',
        cell: (c) => <span className="font-medium text-slate-900">{c.getValue()}</span>,
      }),
      helper.accessor('username', {
        header: 'Username',
        cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span>,
        sortingFn: 'text',
      }),
      helper.accessor('role', {
        header: 'Role',
        cell: (c) => (
          <Badge tone={c.getValue() === 'admin' ? 'violet' : 'slate'}>{roleLabel(c.getValue())}</Badge>
        ),
      }),
      helper.accessor('is_active', {
        header: 'Status',
        cell: (c) => (c.getValue() ? <Badge tone="teal">Active</Badge> : <Badge tone="red">Disabled</Badge>),
      }),
      helper.accessor('created_at', {
        header: 'Created',
        sortDescFirst: true,
        cell: (c) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(c.getValue())}</span>,
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: data?.items ?? EMPTY,
    columns,
    getRowId: (row) => String(row.id),
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const { pageIndex, pageSize } = table.getState().pagination

  return (
    <>
      <PageHeader
        title="User Master"
        description="Administrators can create accounts and assign roles."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add user
          </Button>
        }
      />
      {isError && !data ? (
        <Alert title="Could not load users">
          <p>{errorMessage(error)}</p>
          <Button variant="secondary" className="mt-2" onClick={() => refetch()}>
            Retry
          </Button>
        </Alert>
      ) : (
        <>
          <DataTable table={table} isLoading={isPending} emptyTitle="No users found" />
          <Pagination
            page={pageIndex + 1}
            pages={table.getPageCount()}
            total={data?.total ?? 0}
            pageSize={pageSize}
            noun="users"
            onPage={(p) => table.setPageIndex(p - 1)}
            onPageSize={(n) => table.setPageSize(n)}
          />
        </>
      )}
      {adding && <UserFormModal onClose={() => setAdding(false)} />}
    </>
  )
}
