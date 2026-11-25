import type { EmployeeListParams } from '@/types'

export const meKey = ['me'] as const

export const employeeKeys = {
  all: ['employees'] as const,
  lists: () => ['employees', 'list'] as const,
  list: (params: EmployeeListParams) => ['employees', 'list', params] as const,
  detail: (id: number) => ['employees', 'detail', id] as const,
  departments: () => ['employees', 'departments'] as const,
}

export const activityKeys = {
  all: ['activities'] as const,
  list: () => ['activities', 'list'] as const,
}

export const userKeys = {
  all: ['users'] as const,
  list: () => ['users', 'list'] as const,
}
