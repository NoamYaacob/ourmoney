// TEMPORARY diagnostic logging for the root-spinner-on-tab-focus
// investigation (Web Preview bug report). Dev-only — every call point below
// is gated behind __DEV__, so this is a no-op in any production/release
// build, native or web, and never runs against a real user's device.
//
// Logs status/fetchStatus enums, booleans, and event names only. Never logs
// tokens, emails, user IDs, household IDs, or monetary values — every call
// site in the four instrumented hooks passes primitives/booleans it derives
// itself, not raw query.data.
//
// Remove this file and its call sites once the root cause behind the
// reported spinner flash is confirmed and fixed.

const startedAt = Date.now()

export function diagLog(label: string, fields: Record<string, string | number | boolean>): void {
  if (!__DEV__) return
  const elapsed = Date.now() - startedAt
  // eslint-disable-next-line no-console
  console.log(`[spinner-diag +${elapsed}ms] ${label}`, fields)
}
