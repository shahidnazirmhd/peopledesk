import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
  type OnChangeFn,
  type SortingState,
} from '@tanstack/react-table'
import { Pencil } from 'lucide-react'
import { useMemo } from 'react'
import { DataTable } from '@/components/common/DataTable'
import { Button } from '@/components/common/ui'
import { employeeFlashKey, useFlashing } from '@/lib/flash'
import type { Employee } from '@/types'
import { formatDate, formatDateTime } from '@/utils/format'

const helper = createColumnHelper<Employee>()
const EMPTY: Employee[] = []

interface Props {
  data: Employee[] | undefined
  isLoading: boolean
  isRefreshing: boolean
  sorting: SortingState
  onSortingChange: OnChangeFn<SortingState>
  onEdit: (employee: Employee) => void
  filtered: boolean
}

export function EmployeeTable({
  data,
  isLoading,
  isRefreshing,
  sorting,
  onSortingChange,
  onEdit,
  filtered,
}: Props) {
  const isFlashing = useFlashing()

  // Column ids are the backend's sort keys, so a header click maps straight to ?sort_by=.
  const columns = useMemo(
    () => [
      helper.accessor('employee_code', {
        id: 'id',
        header: 'Employee ID',
        cell: (c) => <span className="font-mono text-xs text-slate-600">{c.getValue()}</span>,
      }),
      helper.accessor('name', {
        id: 'name',
        header: 'Name',
        cell: (c) => <span className="font-medium text-slate-900">{c.getValue()}</span>,
      }),
      helper.accessor('department', { id: 'department', header: 'Department' }),
      helper.accessor('title', { id: 'title', header: 'Job title' }),
      helper.accessor('created_at', {
        id: 'created_at',
        header: 'Created',
        sortDescFirst: true,
        cell: (c) => <span className="whitespace-nowrap text-slate-600">{formatDate(c.getValue())}</span>,
      }),
      helper.accessor('updated_at', {
        id: 'updated_at',
        header: 'Last updated',
        sortDescFirst: true,
        cell: (c) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(c.getValue())}</span>,
      }),
      helper.accessor((r) => r.updated_by_display_name ?? r.updated_by_username ?? '—', {
        id: 'updated_by',
        header: 'Updated by',
      }),
      helper.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: (c) => (
          <Button
            variant="ghost"
            className="!px-2 !py-1"
            onClick={() => onEdit(c.row.original)}
            aria-label={`Edit ${c.row.original.name}`}
          >
            <Pencil className="size-4" />
            Edit
          </Button>
        ),
      }),
    ],
    [onEdit],
  )

  const table = useReactTable({
    data: data ?? EMPTY,
    columns,
    getRowId: (row) => String(row.id),
    state: { sorting },
    onSortingChange,
    manualSorting: true, // sorting and paging happen in PostgreSQL
    manualPagination: true,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <DataTable
      table={table}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      emptyTitle={filtered ? 'No employees match your filters' : 'No employees yet'}
      emptyHint={
        filtered ? 'Try a different search term or clear the department filter.' : 'Use “Add employee” to create the first one.'
      }
      rowClassName={(row) => (isFlashing(employeeFlashKey(row.original.id)) ? 'row-flash' : '')}
    />
  )
}
