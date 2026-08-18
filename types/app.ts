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

// Migration 008 (ADR-035) — a transfer's shared metadata (from/to account,
// amount, date, description). Its two linked transaction legs are ordinary
// Transaction rows with transfer_id set to this row's id; this type is never
// itself a transaction and carries no category_id/is_shared/payer_id, which
// only ever belong to a transaction row.
export type Transfer = Tables<'transfers'>

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

// ============================================================================
// Milestone 7 — MVP-3 (Recurring, Savings Goals, CSV Import, Analytics)
// ============================================================================

export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

export interface RecurringTransaction extends Omit<Tables<'recurring_transactions'>, 'frequency'> {
  frequency: RecurringFrequency
}

// is_completed is DB-derived (migration 003's derive_savings_goal_completion
// trigger: current_agorot >= target_agorot) — never client-set. No narrowing
// beyond the generated row shape is needed since every column here already
// has a concrete type.
export type SavingsGoal = Tables<'savings_goals'>

// ============================================================================
// Migration 007 — Planned obligations (Annual Expenses / Planned Obligations)
// ============================================================================

export type PlannedObligationStatus = 'upcoming' | 'completed' | 'cancelled'

export interface PlannedObligation extends Omit<Tables<'planned_obligations'>, 'status'> {
  status: PlannedObligationStatus
}

// ============================================================================
// Smart Financial Alerts V1 — lib/engines/alerts/buildFinancialAlerts.ts's
// output shape. Lives here (not inlined in the engine file, unlike
// SafeToSpendItem/CashFlowForecastEvent) because it has more than one real
// consumer: the aggregation hook, the Dashboard section, and the /alerts
// screen — the same "camelCase, UI-shaped, computed client-side" fan-out
// point BudgetCategoryProgress above already lives at this level for.
// ============================================================================

export type FinancialAlertType = 'forecast_shortfall' | 'upcoming_obligation' | 'recurring_price_increase' | 'budget_risk'

export type FinancialAlertSeverity = 'info' | 'warning' | 'critical'

export type FinancialAlertSource = 'cash_flow' | 'planned_obligation' | 'recurring' | 'budget'

export interface FinancialAlert {
  // Deterministic, derived from type + source identity — never random, never
  // a persisted row id (no alert is ever stored). See buildFinancialAlerts.ts
  // for the exact per-type composition and why each type's prefix can never
  // collide with another's.
  id: string
  type: FinancialAlertType
  severity: FinancialAlertSeverity
  title: string
  description: string
  // null when the alert has no single relevant calendar date (budget_risk).
  date: string | null
  // null when the alert has no single relevant money figure.
  amountAgorot: number | null
  source: FinancialAlertSource
  sourceId: string | null
  // A plain route string (e.g. `/obligations/${id}`) — matches every other
  // screen's existing router.push(`/...`) call shape in this codebase, no
  // typed Href needed at the engine layer.
  actionRoute: string
}
