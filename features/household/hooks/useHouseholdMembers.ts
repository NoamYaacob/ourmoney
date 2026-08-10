// Settings' household member list (docs/PHASE_1_PLAN.md §5.2). Deliberately
// NOT a Realtime subscription — see this milestone's plan note: §5.2's
// literal "uses Realtime to stay live" contradicts docs/ARCHITECTURE.md's
// Realtime Strategy section (scoped to `transactions` only) and Milestone
// 4's own precedent of declining a household_members subscription for the
// same reason. This is a plain query on the app's default staleTime
// (lib/queryClient.ts) — refetches naturally on next mount/focus/
// invalidation, not instantly.
//
// Takes `householdId` as a plain parameter and never reads
// store/householdStore.ts itself — it is a pure function of whatever id its
// caller passes. Callers MUST source that id from useHousehold(user?.id)'s
// own return value (the live, session-scoped query), never from the
// Zustand store directly — see useHousehold.ts's own account-switch test
// for why: the store is a synchronized cache, not a read authority, and
// during an account switch it is the query's per-user cache key (not the
// store) that guarantees a previous account's household id can never leak
// into this query. RLS (household_members_select via
// is_household_member(household_id)) remains defense-in-depth underneath
// this regardless.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { HouseholdMemberWithProfile, HouseholdRole } from '@/types/app'

interface MemberRow {
  user_id: string
  role: string
  joined_at: string
  profiles: { display_name: string; avatar_url: string | null } | null
}

export function householdMembersQueryKey(householdId: string | null | undefined) {
  return ['household', 'members', householdId] as const
}

export function useHouseholdMembers(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: householdMembersQueryKey(householdId),
    queryFn: async (): Promise<HouseholdMemberWithProfile[]> => {
      const { data, error } = await supabase
        .from('household_members')
        .select('user_id, role, joined_at, profiles(display_name, avatar_url)')
        .eq('household_id', householdId as string)
      if (error) throw error

      return (data as unknown as MemberRow[]).map((row) => ({
        userId: row.user_id,
        role: row.role as HouseholdRole,
        joinedAt: row.joined_at,
        displayName: row.profiles?.display_name ?? '',
        avatarUrl: row.profiles?.avatar_url ?? null,
      }))
    },
    enabled: !!householdId,
  })

  return {
    members: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    error: query.error,
  }
}
