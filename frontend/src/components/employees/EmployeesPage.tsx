import { useQueryClient } from '@tanstack/react-query'
import type { SortingState, Updater } from '@tanstack/react-table'
import { Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pagination } from '@/components/common/DataTable'
import { Alert, Button, Input, PageHeader, Select } from '@/components/common/ui'
import { EmployeeFormModal } from '@/components/employees/EmployeeFormModal'
import { EmployeeTable } from '@/components/employees/EmployeeTable'
import { useDepartments, useEmployeeList } from '@/hooks/useEmployees'
import { useSocketRoom } from '@/hooks/useSocket'
import { errorMessage } from '@/lib/errors'
import { employeeKeys } from '@/lib/queryKeys'
import { findEmployee } from '@/lib/realtimeCache'
import type { Employee, EmployeeListParams, EmployeeSortField } from '@/types'

const REFETCH_ON_RECONNECT = employeeKeys.all

export function EmployeesPage() {
  const qc = useQueryClient()

  // Join the employee_master room while this page is open.
  useSocketRoom('employee', REFETCH_ON_RECONNECT)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updated_at', desc: true }])
  const [form, setForm] = useState<{ employee: Employee | null } | null>(null)

  // Debounce typing so we query PostgreSQL once the user pauses.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const params = useMemo<EmployeeListParams>(
    () => ({
      page,
      pageSize,
      search,
      department,
      sortBy: (sorting[0]?.id ?? 'updated_at') as EmployeeSortField,
      sortDir: sorting[0]?.desc ? 'desc' : 'asc',
    }),
    [page, pageSize, search, department, sorting],
  )

  const list = useEmployeeList(params)
  const departments = useDepartments()

  // If a filter/delete leaves us past the last page, step back.
  const pages = list.data?.pages ?? 0
  useEffect(() => {
    if (!list.isPlaceholderData && pages > 0 && page > pages) setPage(pages)
  }, [pages, page, list.isPlaceholderData])

  // If the selected department disappears (its last employee was edited away), drop the filter.
  useEffect(() => {
    if (department && departments.data && !departments.data.some((d) => d.toLowerCase() === department.toLowerCase())) {
      setDepartment('')
    }
  }, [department, departments.data])

  const onSortingChange = useCallback((updater: Updater<SortingState>) => {
    setSorting((prev) => (typeof updater === 'function' ? updater(prev) : updater))
    setPage(1)
  }, [])

  const openEdit = useCallback((e: Employee) => setForm({ employee: e }), [])

  const filtered = search !== '' || department !== ''
  // Live copy of the employee being edited, to warn when someone else changes it.
  const editingId = form?.employee?.id
  const latest = editingId !== undefined ? findEmployee(qc, editingId) : undefined

  return (
    <>
      <PageHeader
        title="Employee Master"
        description="Create and maintain employee records. Changes appear instantly for everyone."
        actions={
          <Button onClick={() => setForm({ employee: null })}>
            <Plus className="size-4" /> Add employee
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, title, department or ID"
            className="!pl-9"
            aria-label="Search employees"
          />
        </div>
        <Select
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value)
            setPage(1)
          }}
          className="!w-auto min-w-48"
          aria-label="Filter by department"
        >
          <option value="">All departments</option>
          {departments.data?.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchInput('')
              setSearch('')
              setDepartment('')
              setPage(1)
            }}
          >
            <X className="size-4" /> Clear filters
          </Button>
        )}
      </div>

      {list.isError && !list.data ? (
        <Alert title="Could not load employees">
          <p>{errorMessage(list.error)}</p>
          <Button variant="secondary" className="mt-2" onClick={() => list.refetch()}>
            Retry
          </Button>
        </Alert>
      ) : (
        <>
          <EmployeeTable
            data={list.data?.items}
            isLoading={list.isPending}
            isRefreshing={list.isFetching && !list.isPending}
            sorting={sorting}
            onSortingChange={onSortingChange}
            onEdit={openEdit}
            filtered={filtered}
          />
          <Pagination
            page={page}
            pages={pages}
            total={list.data?.total ?? 0}
            pageSize={pageSize}
            noun="employees"
            onPage={(p) => setPage(Math.max(1, Math.min(p, Math.max(pages, 1))))}
            onPageSize={(n) => {
              setPageSize(n)
              setPage(1)
            }}
          />
        </>
      )}

      {form && (
        <EmployeeFormModal
          key={form.employee?.id ?? 'new'}
          employee={form.employee}
          latest={latest}
          departments={departments.data ?? []}
          onClose={() => setForm(null)}
        />
      )}
    </>
  )
}
