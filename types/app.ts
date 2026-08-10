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
