import { flexRender, type Row, type Table } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { Select, Spinner } from '@/components/common/ui'

interface DataTableProps<T> {
  table: Table<T>
  isLoading?: boolean
  /** True while refetching with the previous data still visible. */
  isRefreshing?: boolean
  emptyTitle: string
  emptyHint?: string
  rowClassName?: (row: Row<T>) => string
}

export function DataTable<T>({
  table,
  isLoading,
  isRefreshing,
  emptyTitle,
  emptyHint,
  rowClassName,
}: DataTableProps<T>) {
  const rows = table.getRowModel().rows
  const colCount = table.getVisibleLeafColumns().length

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {isRefreshing && (
        <div className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-teal-500" aria-hidden />
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                      }
                      className="px-4 py-3 whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 uppercase hover:bg-slate-200/60"
                          title={`Sort by ${String(header.column.columnDef.header)}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3.5 text-teal-700" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3.5 text-teal-700" />
                          ) : (
                            <ChevronsUpDown className="size-3.5 text-slate-400" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-16 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="size-5" /> Loading…
                  </span>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-16 text-center">
                  <Inbox className="mx-auto size-8 text-slate-300" aria-hidden />
                  <p className="mt-2 font-medium text-slate-700">{emptyTitle}</p>
                  {emptyHint && <p className="mt-0.5 text-sm text-slate-500">{emptyHint}</p>}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={`hover:bg-slate-50 ${rowClassName?.(row) ?? ''}`}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface PaginationProps {
  page: number // 1-based
  pages: number
  total: number
  pageSize: number
  pageSizeOptions?: number[]
  onPage: (page: number) => void
  onPageSize?: (size: number) => void
  noun?: string
  children?: ReactNode
}

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  pageSizeOptions = [10, 25, 50],
  onPage,
  onPageSize,
  noun = 'results',
}: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <p>
        {total === 0 ? `No ${noun}` : `Showing ${from}–${to} of ${total} ${noun}`}
      </p>
      <div className="flex items-center gap-3">
        {onPageSize && (
          <label className="flex items-center gap-2">
            <span className="text-slate-500">Rows</span>
            <Select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="!w-auto !py-1"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-slate-300 bg-white p-1.5 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-20 text-center tabular-nums">
            Page {pages === 0 ? 0 : page} / {pages}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= pages}
            className="rounded-lg border border-slate-300 bg-white p-1.5 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
