// "Available cash" for Safe-to-Spend deliberately does not mean "every
// account balance." Product decision (audited against the six account
// types in supabase/migrations/002_financial_schema.sql, i18n labels in
// i18n/locales/he.json's accounts.types):
//
//   checking (עו״ש)     — included: the household's everyday spending account.
//   cash (מזומן)         — included: physically-held money, immediately spendable.
//   savings (חיסכון)     — excluded: not treated as immediately spendable in V1;
//                          an Israeli household's חיסכון is commonly earmarked,
//                          not everyday liquidity. Revisit only with an explicit
//                          product decision, not silently.
//   credit_card (כרטיס אשראי) — excluded: a credit line/debt, never positive cash.
//   investment (השקעות)  — excluded: not immediately spendable (explicit
//                          instruction — "do not count investments as
//                          immediately spendable cash unless the current
//                          product semantics explicitly treat them that way").
//   other (אחר)          — excluded: an unclassified catch-all with no known
//                          liquidity semantics; conservative default.
//
// Also requires is_active (an archived/closed account holds no real
// spendable money going forward) and include_in_total (the one existing
// per-account opt-out column — previously unused anywhere in the app; this
// engine is its first real consumer).

export type EligibleCashAccountType = 'checking' | 'cash'

const ELIGIBLE_TYPES: ReadonlySet<string> = new Set<EligibleCashAccountType>(['checking', 'cash'])

export interface EligibleCashAccountInput {
  id: string
  type: string
  is_active: boolean
  include_in_total: boolean
}

export function isEligibleCashAccount(account: EligibleCashAccountInput): boolean {
  return ELIGIBLE_TYPES.has(account.type) && account.is_active && account.include_in_total
}

// balances is keyed by account_id (features/accounts/lib/computeAccountBalances.ts's
// output shape) — an account with no key (no transactions yet) contributes 0,
// matching that module's own documented "missing key defaults to 0" convention.
export function sumEligibleCashAgorot(
  accounts: readonly EligibleCashAccountInput[],
  balances: Readonly<Record<string, number>>
): number {
  return accounts
    .filter(isEligibleCashAccount)
    .reduce((sum, account) => sum + (balances[account.id] ?? 0), 0)
}
