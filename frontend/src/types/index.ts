export type Role = 'admin' | 'user'

export interface User {
  id: number
  username: string
  display_name: string
  role: Role
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface Employee {
  id: number
  employee_code: string
  name: string
  department: string
  title: string
  version: number
  created_at: string
  updated_at: string
  updated_by: number | null
  updated_by_username: string | null
  updated_by_display_name: string | null
}

export interface Activity {
  id: number
  user_id: number | null
  username: string
  action: string
  details: string
  created_at: string
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface ItemList<T> {
  items: T[]
}

export type EmployeeSortField =
  | 'id'
  | 'name'
  | 'department'
  | 'title'
  | 'created_at'
  | 'updated_at'
  | 'updated_by'

export type SortDirection = 'asc' | 'desc'

export interface EmployeeListParams {
  page: number // 1-based
  pageSize: number
  search: string
  department: string
  sortBy: EmployeeSortField
  sortDir: SortDirection
}

export interface EmployeeInput {
  name: string
  department: string
  title: string
}

export interface UserInput {
  display_name: string
  username: string
  password: string
  role: Role
}
