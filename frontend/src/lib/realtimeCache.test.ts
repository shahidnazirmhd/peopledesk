import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_ACTIVITIES,
  applyActivityEvent,
  applyEmployeeEvent,
  knownVersion,
  matchesFilters,
} from '@/lib/realtimeCache'
import { activityKeys, employeeKeys } from '@/lib/queryKeys'
import type { Activity, Employee, EmployeeListParams, ItemList, Page } from '@/types'

const emp = (id: number, over: Partial<Employee> = {}): Employee => ({
  id,
  employee_code: `EMP-${String(id).padStart(6, '0')}`,
  name: `Person ${id}`,
  department: 'Engineering',
  title: 'Engineer',
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  updated_by: 1,
  updated_by_username: 'admin',
  updated_by_display_name: 'Administrator',
  ...over,
})

const params = (over: Partial<EmployeeListParams> = {}): EmployeeListParams => ({
  page: 1,
  pageSize: 3,
  search: '',
  department: '',
  sortBy: 'updated_at',
  sortDir: 'desc',
  ...over,
})

const page = (items: Employee[], total = items.length, p = params()): Page<Employee> => ({
  items,
  total,
  page: p.page,
  page_size: p.pageSize,
  pages: total === 0 ? 0 : Math.ceil(total / p.pageSize),
})

let qc: QueryClient
beforeEach(() => {
  qc = new QueryClient()
})

function seed(p: EmployeeListParams, data: Page<Employee>) {
  qc.setQueryData(employeeKeys.list(p), data)
}
const read = (p: EmployeeListParams) => qc.getQueryData<Page<Employee>>(employeeKeys.list(p))

describe('applyEmployeeEvent - created', () => {
  it('prepends to a newest-first page 1 and trims to page size', () => {
    const p = params()
    seed(p, page([emp(3), emp(2), emp(1)], 3, p))
    expect(applyEmployeeEvent(qc, emp(4), 'created')).toBe(true)
    const got = read(p)!
    expect(got.items.map((e) => e.id)).toEqual([4, 3, 2])
    expect(got.total).toBe(4)
    expect(got.pages).toBe(2)
  })

  it('ignores a duplicate of the same version (own mutation + own broadcast)', () => {
    const p = params()
    seed(p, page([emp(1)], 1, p))
    expect(applyEmployeeEvent(qc, emp(2), 'created')).toBe(true)
    expect(applyEmployeeEvent(qc, emp(2), 'created')).toBe(false)
    expect(read(p)!.items.filter((e) => e.id === 2)).toHaveLength(1)
    expect(read(p)!.total).toBe(2)
  })

  it('does not add a non-matching employee to a filtered list', () => {
    const p = params({ department: 'Sales' })
    seed(p, page([emp(1, { department: 'Sales' })], 1, p))
    applyEmployeeEvent(qc, emp(2, { department: 'Engineering' }), 'created')
    expect(read(p)!.items.map((e) => e.id)).toEqual([1])
    expect(read(p)!.total).toBe(1)
  })

  it('adds a matching employee to a filtered newest-first list', () => {
    const p = params({ department: 'Sales' })
    seed(p, page([emp(1, { department: 'Sales' })], 1, p))
    applyEmployeeEvent(qc, emp(2, { department: 'sales' }), 'created')
    expect(read(p)!.items.map((e) => e.id)).toEqual([2, 1])
  })

  it('marks other pages/sorts stale instead of guessing', () => {
    const p = params({ page: 2 })
    seed(p, page([emp(1)], 4, p))
    applyEmployeeEvent(qc, emp(9), 'created')
    expect(qc.getQueryState(employeeKeys.list(p))?.isInvalidated).toBe(true)
    expect(read(p)!.items.map((e) => e.id)).toEqual([1]) // untouched until refetch
  })
})

describe('applyEmployeeEvent - updated', () => {
  it('moves an updated employee to the top of a newest-first page', () => {
    const p = params()
    seed(p, page([emp(3), emp(2), emp(1)], 3, p))
    applyEmployeeEvent(qc, emp(1, { version: 2, title: 'Lead' }), 'updated')
    const got = read(p)!
    expect(got.items.map((e) => e.id)).toEqual([1, 3, 2])
    expect(got.items[0].title).toBe('Lead')
    expect(got.total).toBe(3)
  })

  it('patches in place for id-sorted lists without refetching', () => {
    const p = params({ sortBy: 'id', sortDir: 'asc' })
    seed(p, page([emp(1), emp(2)], 2, p))
    applyEmployeeEvent(qc, emp(2, { version: 2, name: 'Renamed' }), 'updated')
    expect(read(p)!.items.map((e) => e.name)).toEqual(['Person 1', 'Renamed'])
    expect(qc.getQueryState(employeeKeys.list(p))?.isInvalidated).toBe(false)
  })

  it('refetches name-sorted lists because the order may change', () => {
    const p = params({ sortBy: 'name', sortDir: 'asc' })
    seed(p, page([emp(1), emp(2)], 2, p))
    applyEmployeeEvent(qc, emp(1, { version: 2, name: 'Zed' }), 'updated')
    expect(read(p)!.items[0].name).toBe('Zed') // patched immediately
    expect(qc.getQueryState(employeeKeys.list(p))?.isInvalidated).toBe(true)
  })

  it('ignores stale (older version) events so data never rolls back', () => {
    const p = params({ sortBy: 'id', sortDir: 'asc' })
    seed(p, page([emp(1, { version: 5, name: 'Newest' })], 1, p))
    expect(applyEmployeeEvent(qc, emp(1, { version: 4, name: 'Older' }), 'updated')).toBe(false)
    expect(read(p)!.items[0].name).toBe('Newest')
  })

  it('refetches when an edit makes an employee leave a department filter', () => {
    const p = params({ department: 'Sales', sortBy: 'id', sortDir: 'asc' })
    seed(p, page([emp(1, { department: 'Sales' })], 1, p))
    applyEmployeeEvent(qc, emp(1, { version: 2, department: 'Engineering' }), 'updated')
    expect(qc.getQueryState(employeeKeys.list(p))?.isInvalidated).toBe(true)
  })

  it('adds a brand-new department to the department filter options', () => {
    qc.setQueryData<ItemList<string>>(employeeKeys.departments(), { items: ['Engineering', 'Sales'] })
    applyEmployeeEvent(qc, emp(1, { department: 'Legal' }), 'created')
    expect(qc.getQueryData<ItemList<string>>(employeeKeys.departments())!.items).toEqual([
      'Engineering',
      'Legal',
      'Sales',
    ])
  })
})

describe('knownVersion', () => {
  it('is 0 when nothing is cached and the max version otherwise', () => {
    expect(knownVersion(qc, 1)).toBe(0)
    const p = params()
    seed(p, page([emp(1, { version: 3 })], 1, p))
    expect(knownVersion(qc, 1)).toBe(3)
  })
})

describe('matchesFilters', () => {
  it('matches department case-insensitively and search across fields and id', () => {
    const e = emp(12, { name: 'Grace Hopper', title: 'Admiral' })
    expect(matchesFilters({ search: '', department: 'engineering' }, e)).toBe(true)
    expect(matchesFilters({ search: '', department: 'Sales' }, e)).toBe(false)
    expect(matchesFilters({ search: 'hopper', department: '' }, e)).toBe(true)
    expect(matchesFilters({ search: 'EMP-000012', department: '' }, e)).toBe(true)
    expect(matchesFilters({ search: '12', department: '' }, e)).toBe(true)
    expect(matchesFilters({ search: '1', department: '' }, e)).toBe(false) // exact id, like the server
    expect(matchesFilters({ search: 'nobody', department: '' }, e)).toBe(false)
  })
})

describe('applyActivityEvent', () => {
  const act = (id: number): Activity => ({
    id,
    user_id: 1,
    username: 'admin',
    action: 'employee_created',
    details: `d${id}`,
    created_at: '2026-01-01T00:00:00Z',
  })

  it('prepends newest first and ignores duplicates', () => {
    qc.setQueryData<ItemList<Activity>>(activityKeys.list(), { items: [act(2), act(1)] })
    expect(applyActivityEvent(qc, act(3))).toBe(true)
    expect(applyActivityEvent(qc, act(3))).toBe(false)
    expect(qc.getQueryData<ItemList<Activity>>(activityKeys.list())!.items.map((a) => a.id)).toEqual([3, 2, 1])
  })

  it('keeps at most 100 entries, dropping the oldest', () => {
    const items = Array.from({ length: MAX_ACTIVITIES }, (_, i) => act(MAX_ACTIVITIES - i))
    qc.setQueryData<ItemList<Activity>>(activityKeys.list(), { items })
    applyActivityEvent(qc, act(MAX_ACTIVITIES + 1))
    const got = qc.getQueryData<ItemList<Activity>>(activityKeys.list())!.items
    expect(got).toHaveLength(MAX_ACTIVITIES)
    expect(got[0].id).toBe(MAX_ACTIVITIES + 1)
    expect(got.at(-1)!.id).toBe(2)
  })

  it('invalidates instead of dropping the event when the initial fetch is still in flight', () => {
    expect(applyActivityEvent(qc, act(1))).toBe(true)
  })
})
