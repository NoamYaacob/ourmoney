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

// ============================================================================
// Milestone 6 — MVP-2 Core Financial Loop
// ============================================================================

export type AccountType = 'checking' | 'savings' | 'credit_card' | 'cash' | 'investment' | 'other'
export type CategoryRuleField = 'description' | 'merchant_name'
export type CategoryRuleOperator = 'contains' | 'equals' | 'starts_with'
export type TransactionSource = 'manual' | 'csv_import' | 'recurring'

export type Account = Tables<'accounts'>

export type Category = Tables<'categories'>

export interface CategoryRule extends Omit<Tables<'category_rules'>, 'field' | 'operator'> {
  field: CategoryRuleField
  operator: CategoryRuleOperator
}

export interface Transaction extends Omit<Tables<'transactions'>, 'source'> {
  source: TransactionSource
}

export type Budget = Tables<'budgets'>
export type BudgetAllocation = Tables<'budget_allocations'>

// features/budgets/hooks/useBudgetProgress.ts's per-category derived shape —
// camelCase, UI-shaped, computed client-side from canonical transactions
// (CLAUDE.md: no redundant persisted "spent" counters).
export interface BudgetCategoryProgress {
  categoryId: string
  categoryNameHe: string
  categoryIcon: string
  allocatedAgorot: number
  spentAgorot: number
  remainingAgorot: number
  percentSpent: number | null
}
