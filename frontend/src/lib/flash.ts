import { useSyncExternalStore } from 'react'

/**
 * Tiny store that remembers which rows were just changed by someone else, so
 * the table can briefly highlight them (a visual cue for real-time updates).
 */

const FLASH_MS = 2500
const active = new Map<string, number>() // key -> token
const listeners = new Set<() => void>()
let snapshot = 0

function emit(): void {
  snapshot++
  listeners.forEach((l) => l())
}

export function markFlash(key: string): void {
  const token = Date.now() + Math.random()
  active.set(key, token)
  emit()
  setTimeout(() => {
    if (active.get(key) === token) {
      active.delete(key)
      emit()
    }
  }, FLASH_MS)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useIsFlashing(key: string): boolean {
  useSyncExternalStore(subscribe, () => snapshot)
  return active.has(key)
}

export const employeeFlashKey = (id: number) => `employee:${id}`
export const activityFlashKey = (id: number) => `activity:${id}`

/** Returns a predicate that re-renders the caller whenever the flash set changes. */
export function useFlashing(): (key: string) => boolean {
  useSyncExternalStore(subscribe, () => snapshot)
  return (key) => active.has(key)
}
