/**
 * Applies Socket.IO events (and our own mutation results) to the TanStack Query cache.
 *
 * Rules:
 *  - Idempotent: an event whose version is already in the cache is ignored, so
 *    the user who made a change (who gets the REST response AND the broadcast)
 *    never sees a duplicate row, and out-of-order events can't roll data back.
 *  - Patch in place whenever the result is certain; otherwise mark the affected
 *    query for a refetch (e.g. a new row whose page/position only the server
 *    knows). Nothing here polls.
 */

import type { QueryClient } from '@tanstack/react-query'
import { activityKeys, employeeKeys } from '@/lib/queryKeys'
import type { Activity, Employee, EmployeeListParams, ItemList, Page } from '@/types'

export const MAX_ACTIVITIES = 100

type ListEntry = [readonly unknown[], Page<Employee> | undefined]

/** Mirror of the server's search/department filter, used to decide if an employee belongs in a cached list. */
export function matchesFilters(
  params: Pick<EmployeeListParams, 'search' | 'department'>,
  e: Employee,
): boolean {
  if (params.department && e.department.toLowerCase() !== params.department.trim().toLowerCase()) {
    return false
  }
  const term = params.search.trim().toLowerCase()
  if (!term) return true
  const idMatch = /^(?:emp-?)?0*(\d{1,9})$/i.exec(term)
  if (idMatch && Number(idMatch[1]) === e.id) return true
  return [e.name, e.department, e.title].some((v) => v.toLowerCase().includes(term))
}

function isFiltered(p: EmployeeListParams): boolean {
  return p.search.trim() !== '' || p.department !== ''
}

/** Sort keys whose order can change when an employee is edited. */
function sortDependsOnEdits(p: EmployeeListParams): boolean {
  return p.sortBy !== 'id' && p.sortBy !== 'created_at'
}

function pageCount(total: number, pageSize: number): number {
  return total === 0 ? 0 : Math.max(1, Math.ceil(total / pageSize))
}

/** Highest version of this employee known anywhere in the cache (0 if unknown). */
export function knownVersion(qc: QueryClient, id: number): number {
  let version = qc.getQueryData<Employee>(employeeKeys.detail(id))?.version ?? 0
  const lists = qc.getQueriesData<Page<Employee>>({ queryKey: employeeKeys.lists() })
  for (const [, page] of lists) {
    const hit = page?.items.find((i) => i.id === id)
    if (hit && hit.version > version) version = hit.version
  }
  return version
}

/** Newest known copy of an employee in any cached list (undefined if not cached). */
export function findEmployee(qc: QueryClient, id: number): Employee | undefined {
  let best: Employee | undefined = qc.getQueryData<Employee>(employeeKeys.detail(id))
  for (const [, page] of qc.getQueriesData<Page<Employee>>({ queryKey: employeeKeys.lists() })) {
    const hit = page?.items.find((i) => i.id === id)
    if (hit && (!best || hit.version > best.version)) best = hit
  }
  return best
}

/**
 * Merge an employee that was created/updated (by anyone) into every cached list.
 * Returns false when the event carried nothing new (duplicate or stale).
 */
export function applyEmployeeEvent(
  qc: QueryClient,
  employee: Employee,
  kind: 'created' | 'updated',
): boolean {
  if (knownVersion(qc, employee.id) >= employee.version) return false

  // Detail cache: only refresh an entry that already exists.
  if (qc.getQueryData(employeeKeys.detail(employee.id)) !== undefined) {
    qc.setQueryData(employeeKeys.detail(employee.id), employee)
  }

  const entries = qc.getQueriesData<Page<Employee>>({ queryKey: employeeKeys.lists() }) as ListEntry[]
  for (const [key, data] of entries) {
    const params = key[2] as EmployeeListParams
    if (!data) {
      // A fetch is in flight or hasn't produced data yet: restart it so it
      // can't return a snapshot that predates this change.
      void qc.invalidateQueries({ queryKey: key, exact: true })
      continue
    }
    applyToList(qc, key, params, data, employee, kind)
  }

  syncDepartments(qc, employee, kind)
  return true
}

function applyToList(
  qc: QueryClient,
  key: readonly unknown[],
  params: EmployeeListParams,
  data: Page<Employee>,
  employee: Employee,
  kind: 'created' | 'updated',
): void {
  const index = data.items.findIndex((i) => i.id === employee.id)
  const matches = matchesFilters(params, employee)

  // Fast path: "newest changes first" on page 1 - the common live view. The
  // result is fully determined, so update instantly with no request.
  const newestFirstPage1 = params.sortBy === 'updated_at' && params.sortDir === 'desc' && params.page === 1
  if (newestFirstPage1 && matches && (index >= 0 || kind === 'created')) {
    const items = [employee, ...data.items.filter((i) => i.id !== employee.id)].slice(0, params.pageSize)
    const total = index >= 0 ? data.total : data.total + 1
    qc.setQueryData<Page<Employee>>(key, {
      ...data,
      items,
      total,
      pages: pageCount(total, params.pageSize),
    })
    // Mark stale (no network) so the next mount reconciles with the server.
    void qc.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' })
    return
  }

  if (index >= 0) {
    // Patch the row where it sits...
    const before = data.items[index]
    qc.setQueryData<Page<Employee>>(key, {
      ...data,
      items: data.items.map((i) => (i.id === employee.id ? employee : i)),
    })
    // ...and refetch only if the edit may have changed membership or ordering.
    if (matchesFilters(params, before) !== matches || sortDependsOnEdits(params)) {
      void qc.invalidateQueries({ queryKey: key, exact: true })
    }
    return
  }

  // Not on this page.
  const mayAppear =
    kind === 'created'
      ? matches // changes totals and page contents
      : matches && (isFiltered(params) || sortDependsOnEdits(params))
  if (mayAppear) void qc.invalidateQueries({ queryKey: key, exact: true })
}

function syncDepartments(qc: QueryClient, employee: Employee, kind: 'created' | 'updated'): void {
  const key = employeeKeys.departments()
  const cached = qc.getQueryData<ItemList<string>>(key)
  if (!cached) return
  const exists = cached.items.some((d) => d.toLowerCase() === employee.department.toLowerCase())
  if (!exists) {
    qc.setQueryData<ItemList<string>>(key, {
      items: [...cached.items, employee.department].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      ),
    })
  }
  if (kind === 'updated') {
    // A department may have lost its last employee; reconcile lazily.
    void qc.invalidateQueries({ queryKey: key, refetchType: 'none' })
  }
}

/** Prepend a new activity to the cached "latest 100" list. Returns false for duplicates. */
export function applyActivityEvent(qc: QueryClient, activity: Activity): boolean {
  const key = activityKeys.list()
  const cached = qc.getQueryData<ItemList<Activity>>(key)
  if (!cached) {
    // Initial fetch still in flight: make sure it can't miss this entry.
    void qc.invalidateQueries({ queryKey: key })
    return true
  }
  if (cached.items.some((a) => a.id === activity.id)) return false
  const items = [activity, ...cached.items]
    .sort((a, b) => b.id - a.id)
    .slice(0, MAX_ACTIVITIES)
  qc.setQueryData<ItemList<Activity>>(key, { items })
  return true
}
