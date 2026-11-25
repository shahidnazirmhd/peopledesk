import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { userKeys } from '@/lib/queryKeys'
import type { Page, User, UserInput } from '@/types'

export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: async () => (await api.get<Page<User>>('/api/users', { params: { page_size: 500 } })).data,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UserInput) => (await api.post<User>('/api/users', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}
