// Postgres FK-violation code (23503) is what accounts' default ON DELETE
// RESTRICT produces when a transaction still references the account being
// deleted — mapped to a friendly, actionable message instead of a raw
// Postgres error string.

interface PostgrestErrorLike {
  code?: string
}

export function mapAccountDeleteError(error: unknown): string {
  const code = (error as PostgrestErrorLike | null)?.code
  if (code === '23503') return 'accounts.errors.hasTransactions'
  return 'accounts.errors.generic'
}
