// Domain types — see CLAUDE.md § TypeScript. Narrows the generated Supabase
// row shapes (types/database.ts, never hand-edited) to the literal unions
// the schema's CHECK constraints actually enforce.

import type { Tables } from './database'

export type HouseholdRole = 'admin' | 'member'
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled'

export type Household = Tables<'households'>

export interface HouseholdMember extends Omit<Tables<'household_members'>, 'role'> {
  role: HouseholdRole
}

export interface Invitation extends Omit<Tables<'invitations'>, 'status'> {
  status: InvitationStatus
}

// The household_members -> profiles join Settings' member list reads
// (features/household/hooks/useHouseholdMembers.ts) — camelCase and flat,
// since it's already shaped for direct UI consumption, unlike the other
// types above which narrow a generated row shape one-to-one.
export interface HouseholdMemberWithProfile {
  userId: string
  role: HouseholdRole
  joinedAt: string
  displayName: string
  avatarUrl: string | null
}
