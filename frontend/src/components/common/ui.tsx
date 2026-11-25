import { LoaderCircle, TriangleAlert } from 'lucide-react'
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden />
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 disabled:bg-teal-700/50',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
}

export function Button({
  variant = 'primary',
  loading,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

interface FieldProps {
  label: string
  error?: string
  hint?: string
  htmlFor: string
  children: ReactNode
}

export function Field({ label, error, hint, htmlFor, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

const INPUT =
  'block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ invalid, className = '', id, ...rest }, ref) {
  return (
    <input
      ref={ref}
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid && id ? `${id}-error` : undefined}
      className={`${INPUT} ${invalid ? 'border-red-400' : 'border-slate-300'} ${className}`}
      {...rest}
    />
  )
})

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ invalid, className = '', id, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      id={id}
      aria-invalid={invalid || undefined}
      className={`${INPUT} ${invalid ? 'border-red-400' : 'border-slate-300'} ${className}`}
      {...rest}
    >
      {children}
    </select>
  )
})

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'slate' | 'teal' | 'amber' | 'blue' | 'red' | 'violet'
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    teal: 'bg-teal-50 text-teal-800',
    amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-blue-50 text-blue-800',
    red: 'bg-red-50 text-red-800',
    violet: 'bg-violet-50 text-violet-800',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Alert({
  tone = 'error',
  title,
  children,
}: {
  tone?: 'error' | 'warning'
  title?: string
  children: ReactNode
}) {
  const styles =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-900'
      : 'border-amber-300 bg-amber-50 text-amber-900'
  return (
    <div role="alert" className={`flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${styles}`}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
