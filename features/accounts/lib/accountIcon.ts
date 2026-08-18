// Presentation-only mapping from an account's `type` (types/app.ts's
// AccountType — a real DB column, not derived) to an Ionicons glyph, for the
// Add Transaction account-selection row (Design Phase 2). No schema change:
// this only decides how a known type is drawn.
import type { IoniconName } from '@/features/categories/lib/categoryIcon'
import type { AccountType } from '@/types/app'

const ACCOUNT_TYPE_ICON: Record<AccountType, IoniconName> = {
  checking: 'business-outline',
  savings: 'wallet-outline',
  credit_card: 'card-outline',
  cash: 'cash-outline',
  investment: 'trending-up-outline',
  other: 'ellipsis-horizontal-circle-outline',
}

const FALLBACK_ICON: IoniconName = 'wallet-outline'

// Accepts a plain string, not just AccountType — `Account['type']` comes
// through as an unconstrained `string` from the generated Supabase types
// (types/database.ts), the same reason app/(app)/accounts/[id].tsx already
// casts it at its own call site. Validating here instead keeps that cast
// out of every caller and degrades safely for anything unrecognized.
export function accountIconName(type: string | null | undefined): IoniconName {
  if (!type || !(type in ACCOUNT_TYPE_ICON)) return FALLBACK_ICON
  return ACCOUNT_TYPE_ICON[type as AccountType]
}
