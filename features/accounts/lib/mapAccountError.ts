// Postgres FK-violation code (23503) is what accounts' default ON DELETE
// RESTRICT produces when a transaction still references the account being
// deleted — mapped to a friendly, actionable message instead of a raw
// Postgres error string.

interface PostgrestErrorLike {
  code?: string
}

export function mapAccountDeleteError(error: unknown): string {
  const code = (error as PostgrestErrorLike | null)?.code
  // Release-readiness pass finding: this returned 'accounts.errors.hasTransactions',
  // a key that has never existed in i18n/locales/he.json — the real string
  // lives under accounts.detail.hasTransactions (the delete-confirmation
  // dialog's own copy already promises "if it has transactions, deletion
  // will fail," so this is that same promise's follow-through). react-i18next
  // has no throw-on-missing-key mode in this app, so a wrong key doesn't fail
  // a test or a type check — it silently renders the raw key string to the
  // user instead of the intended Hebrew message.
  if (code === '23503') return 'accounts.detail.hasTransactions'
  return 'accounts.errors.generic'
}
