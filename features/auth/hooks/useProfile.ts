// Settings' read-only profile section (docs/PHASE_1_PLAN.md §5.2). `email`
// is NOT read from here — it lives on `auth.users`, not `profiles`
// (docs/DATABASE_SCHEMA.md), and is already available via useAuth().user.email.
//
// Scoped to the caller's own id, same posture as useHasHousehold.ts —
// `profiles_select`'s RLS policy is `USING (TRUE)` (any authenticated user
// can read any profile, needed to show a partner's name), so the real
// boundary here is simply "which row do we ask for," not an RLS gate.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export function profileQueryKey(userId: string | undefined) {
  return ['auth', 'profile', userId] as const
}

export function useProfile(userId: string | undefined) {
  const query = useQuery({
    queryKey: profileQueryKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', userId as string)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!userId,
  })

  return {
    displayName: query.data?.display_name ?? null,
    avatarUrl: query.data?.avatar_url ?? null,
    isLoading: !!userId && query.isPending,
    error: query.error,
  }
}
