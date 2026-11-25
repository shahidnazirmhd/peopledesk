const dateTime = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const dateOnly = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
})

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateTime.format(d)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : dateOnly.format(d)
}

export const ACTIVITY_LABELS: Record<string, string> = {
  user_login: 'User login',
  user_logout: 'User logout',
  user_created: 'User created',
  employee_created: 'Employee created',
  employee_updated: 'Employee updated',
}

export function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action] ?? action
}

export function roleLabel(role: string): string {
  return role === 'admin' ? 'Admin' : 'User'
}
