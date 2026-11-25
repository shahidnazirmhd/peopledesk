import { z } from 'zod'

// These rules mirror the backend's Pydantic validation. The server remains the
// authority; client-side validation is only for fast feedback.

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginForm = z.infer<typeof loginSchema>

export const employeeSchema = z.object({
  name: z.string().trim().min(1, 'Employee name is required').max(120, 'Maximum 120 characters'),
  department: z.string().trim().min(1, 'Department is required').max(80, 'Maximum 80 characters'),
  title: z.string().trim().min(1, 'Job title is required').max(120, 'Maximum 120 characters'),
})
export type EmployeeForm = z.infer<typeof employeeSchema>

export const userSchema = z.object({
  display_name: z.string().trim().min(1, 'Display name is required').max(100, 'Maximum 100 characters'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Maximum 50 characters')
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9_.-]*$/,
      'Use letters, numbers, dots, dashes or underscores; start with a letter or number',
    ),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((v) => new TextEncoder().encode(v).length <= 72, 'Password must be at most 72 bytes')
    .refine(
      (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v),
      'Include an uppercase letter, a lowercase letter and a digit',
    ),
  role: z.enum(['admin', 'user']),
})
export type UserForm = z.infer<typeof userSchema>
