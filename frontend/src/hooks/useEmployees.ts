import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { employeeKeys } from '@/lib/queryKeys'
import { applyEmployeeEvent } from '@/lib/realtimeCache'
import type { Employee, EmployeeInput, EmployeeListParams, ItemList, Page } from '@/types'

export function useEmployeeList(params: EmployeeListParams) {
  return useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: async ({ signal }) =>
      (
        await api.get<Page<Employee>>('/api/employees', {
          signal,
          params: {
            page: params.page,
            page_size: params.pageSize,
            search: params.search || undefined,
            department: params.department || undefined,
            sort_by: params.sortBy,
            sort_dir: params.sortDir,
          },
        })
      ).data,
    // Keep showing the previous page while the next one loads.
    placeholderData: keepPreviousData,
  })
}

export function useDepartments() {
  return useQuery({
    queryKey: employeeKeys.departments(),
    queryFn: async () => (await api.get<ItemList<string>>('/api/employees/departments')).data,
    // The cache keeps the server's {items: [...]} envelope (the real-time code patches that shape).
    select: (d) => d.items,
  })
}

export function useCreateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EmployeeInput) => (await api.post<Employee>('/api/employees', input)).data,
    // The server also broadcasts this change to us; applyEmployeeEvent is
    // idempotent (version-based), so whichever arrives second is a no-op.
    onSuccess: (employee) => {
      applyEmployeeEvent(qc, employee, 'created')
    },
  })
}

export function useUpdateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: EmployeeInput & { id: number; version: number }) =>
      (await api.put<Employee>(`/api/employees/${id}`, body)).data,
    onSuccess: (employee) => {
      applyEmployeeEvent(qc, employee, 'updated')
    },
  })
}
