import { createFileRoute } from '@tanstack/react-router'
import { EmployeesPage } from '@/components/employees/EmployeesPage'

export const Route = createFileRoute('/_authed/employees')({
  component: EmployeesPage,
})
