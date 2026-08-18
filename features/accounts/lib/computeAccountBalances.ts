// accounts.balance_agorot is a stored column that nothing ever writes to
// (confirmed: no trigger, function, or application code updates it) — every
// account would permanently show ₪0 if that column were trusted. The balance
// shown in the UI is instead computed live, client-side, as a pure function
// of the household's transactions — CLAUDE.md's "financial calculations
// live in pure functions" rule, and no schema/migration change required.
//
// Deliberately includes every transaction for an account regardless of
// `is_shared` or `is_excluded`. Per CLAUDE.md, those two booleans are
// budget-attribution and user-driven-exclusion respectively — neither means
// "did not really happen to this account's money" — so a real account
// balance must sum every transaction that actually moved money against it.
//
// An account with zero transactions simply has no key in the returned
// record (not a `0` entry) — callers reading a specific account's balance
// should default a missing key to 0, e.g. `balances[account.id] ?? 0`.

export interface AccountBalanceTransaction {
  account_id: string
  amount_agorot: number
}

export function computeAccountBalances(
  transactions: AccountBalanceTransaction[]
): Record<string, number> {
  const balances: Record<string, number> = {}
  for (const { account_id, amount_agorot } of transactions) {
    balances[account_id] = (balances[account_id] ?? 0) + amount_agorot
  }
  return balances
}
