import axios from 'axios'

/** Normalised error for every failed API call (matches the backend's error envelope). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly retryAfter?: number

  constructor(
    message: string,
    status: number,
    code: string,
    details?: unknown,
    retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.retryAfter = retryAfter
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  if (axios.isAxiosError(err)) {
    if (err.response) {
      const body = err.response.data as ErrorEnvelope | undefined
      const retry = Number(err.response.headers?.['retry-after'])
      return new ApiError(
        body?.error?.message ?? `Request failed (HTTP ${err.response.status}).`,
        err.response.status,
        body?.error?.code ?? 'http_error',
        body?.error?.details,
        Number.isFinite(retry) ? retry : undefined,
      )
    }
    return new ApiError(
      'Cannot reach the server. Check your connection and try again.',
      0,
      'network_error',
    )
  }
  return new ApiError(err instanceof Error ? err.message : 'Unexpected error.', 0, 'unknown')
}

export function errorMessage(err: unknown): string {
  return toApiError(err).message
}

/** 4xx responses are deterministic: retrying them only adds load. */
export function isHttpError(err: unknown): boolean {
  return err instanceof ApiError && err.status >= 400 && err.status < 500
}
