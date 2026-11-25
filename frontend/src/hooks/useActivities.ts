import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { activityKeys } from '@/lib/queryKeys'
import type { Activity, ItemList } from '@/types'

export function useActivities() {
  return useQuery({
    queryKey: activityKeys.list(),
    queryFn: async () => (await api.get<ItemList<Activity>>('/api/activities')).data,
    // The cache keeps the server's {items: [...]} envelope (the real-time code patches that shape).
    select: (d) => d.items,
  })
}
