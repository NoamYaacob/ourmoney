// CP8E — thin Supabase data layer for financial_pulse_snapshots (migration
// 017). Reads the PREVIOUS snapshot (never touched by this hook itself) and
// exposes an upsert mutation to record a NEW one. All comparison/derivation
// logic lives in lib/engines/pulse/computeFinancialPulse.ts; the write
// LIFECYCLE (when to call the mutation, exactly once per resolved mount)
// lives in useFinancialPulse.ts. This file only knows how to read/write one
// row — same "Supabase calls happen only in hooks" split every other
// feature slice in this codebase follows.
//
// Takes householdId/userId as plain parameters, never reads
// store/householdStore.ts or useAuth() directly — same discipline as
// features/accounts/hooks/useAccounts.ts.

import { useMutation, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export interface FinancialPulseSnapshotRow {
  safeToSpendAgorot: number
  capturedAt: string
}

export function financialPulseSnapshotQueryKey(householdId: string | null | undefined, userId: string | null | undefined) {
  return ['financialPulseSnapshot', householdId, userId] as const
}

// Reads the row exactly as it stood BEFORE this session's own write, if
// any. `staleTime: Infinity` — same choice and same reasoning as
// features/auth/hooks/useAuth.ts's own session query: this represents a
// stable, session-scoped fact ("what did I see when I first opened the app
// this session"), not live server state that should silently refresh
// underneath a mounted screen. Without this, TanStack Query's default
// staleTime would let a SECOND mount within the same session (navigate
// away from Home, then back) background-refetch and pick up the row this
// session's own first-mount write already updated — flipping "previous" to
// what was actually just recorded and making the comparison disappear out
// from under the user mid-session. Combined with
// useRecordFinancialPulseSnapshot never invalidating this query key, the
// net effect is exactly the required lifecycle: "previous" is captured
// once per session and never silently replaced by this session's own
// write — see also clearHouseholdScopedQueries.ts, which removes this
// query key on sign-out so a new session always re-reads for real.
export function useFinancialPulseSnapshot(householdId: string | null | undefined, userId: string | null | undefined) {
  const query = useQuery({
    queryKey: financialPulseSnapshotQueryKey(householdId, userId),
    queryFn: async (): Promise<FinancialPulseSnapshotRow | null> => {
      const { data, error } = await supabase
        .from('financial_pulse_snapshots')
        .select('safe_to_spend_agorot, captured_at')
        .eq('household_id', householdId as string)
        .eq('user_id', userId as string)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return { safeToSpendAgorot: data.safe_to_spend_agorot, capturedAt: data.captured_at }
    },
    enabled: !!householdId && !!userId,
    staleTime: Infinity,
  })

  return {
    previousSnapshot: query.data ?? null,
    isLoading: !!householdId && !!userId && query.isPending,
    error: query.error,
    // Same "never loaded" vs. "loaded and genuinely null" distinction
    // every other hook in this codebase exposes (features/accounts/hooks/
    // useAccounts.ts's own comment) — critical here specifically, because
    // "no row yet" (a real, meaningful null) must never be confused with
    // "haven't checked yet" (should not render/write anything).
    hasData: query.data !== undefined,
  }
}

export interface RecordFinancialPulseSnapshotInput {
  householdId: string
  userId: string
  safeToSpendAgorot: number
}

// Idempotent upsert — same (household_id, user_id) primary key every call,
// so a repeated mount, a React Strict Mode double-invoke, or a retry after
// a transient failure all converge on the same "last seen" row rather than
// erroring or duplicating. Deliberately does NOT invalidate
// useFinancialPulseSnapshot's read query key on success — the written row
// must only ever become visible as "previous" on a genuinely NEW mount (a
// fresh query, e.g. after navigating away and back, or a new app session),
// never by silently replacing the comparison this same mount already
// rendered.
export function useRecordFinancialPulseSnapshot() {
  return useMutation({
    mutationFn: async (input: RecordFinancialPulseSnapshotInput) => {
      // RRR P1 finding #3 fix: captured_at's `DEFAULT NOW()` (migration 017)
      // only ever fires on INSERT — an upsert's ON CONFLICT DO UPDATE branch
      // sets exactly the columns present in this payload, nothing more.
      // Omitting captured_at here meant every write after a household
      // member's first-ever snapshot silently left it exactly as it was on
      // that first write, forever: "since last time" would keep meaning
      // "since our very first-ever session," never "since the previous
      // visit," growing more wrong with every subsequent write. Setting it
      // explicitly on every call is what makes captured_at actually BE "the
      // moment THIS row's safe_to_spend_agorot was captured," matching this
      // column's own comment in migration 017 (left unchanged — the fix
      // belongs entirely in this client-side payload).
      const { error } = await supabase.from('financial_pulse_snapshots').upsert(
        {
          household_id: input.householdId,
          user_id: input.userId,
          safe_to_spend_agorot: input.safeToSpendAgorot,
          captured_at: new Date().toISOString(),
        },
        { onConflict: 'household_id,user_id' }
      )
      if (error) throw error
    },
  })
}
