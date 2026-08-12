// Milestone 11 / ADR-033. Errors only — this is NOT an analytics module.
//
// THE SOLE PERMITTED Sentry.* CALL SITE. Every other file must go through
// captureException()/addBreadcrumb() below, never import @sentry/react-native
// directly — enforced permanently by __structural__.test.ts's grep, mirroring
// ARCHITECTURE.md's WhatsApp channel-isolation invariant.
//
// DATA-MINIMIZATION BOUNDARY (ADR-033, TRUST_AND_PRIVACY.md T10) — three
// layers, not one:
//   1. Design-time: sendDefaultPii: false, tracesSampleRate: 0 (no
//      performance tracing), an `integrations: []` array. NOTE: an empty
//      array does NOT disable the SDK's default integrations (traced against
//      @sentry/react-native's actual init() — array-form `integrations` is
//      merged with defaults, not a replacement) — the default
//      breadcrumbsIntegration is what generates the 'http'/'fetch'/'xhr'/
//      'console'-category breadcrumbs beforeBreadcrumb below scrubs, so this
//      is expected and relied upon. What actually keeps Session Replay off
//      is that Sentry.mobileReplayIntegration() is never added and no replay
//      sample-rate option is set — replay requires an explicit opt-in, it is
//      not on by default.
//   2. Test-time: crashReporting.test.ts proves the scrub rules against
//      fixtures shaped like this app's real Supabase payloads.
//   3. Structural: __structural__.test.ts's grep (no Sentry.* outside this
//      file, no setUser() anywhere).
//
// Crash reporting is best-effort infrastructure, not a functional dependency
// — unlike lib/supabase/client.ts, a missing DSN must never throw or block
// the app from running; initCrashReporting() just no-ops. For the same
// reason, Sentry.init()/captureException() are never allowed to throw INTO
// the caller — a bug in this module must never crash the app it's supposed
// to be reporting crashes for, and captureException() in particular is
// called from AppErrorBoundary.componentDidCatch(), which nothing else
// protects.
//
// enabled: !__DEV__ — production-only. Local development keeps using
// console.error/console.warn, unchanged by this module.
//
// KNOWN RESIDUAL LIMITATION, stated plainly rather than silently: the scrub
// below is a coarse, deliberately over-inclusive substring match against
// field NAMES (extra/context keys, breadcrumb data keys, and — since a
// developer's thrown Error message often includes the field name inline,
// e.g. "insufficient funds: amountAgorot=1234500" — the exception message
// text itself). It cannot catch a bare, unlabeled value with no
// accompanying keyword (e.g. a raw phone number or amount with no "amount"/
// "agorot"/etc. nearby in the string). This is the same class of accepted,
// named limitation this codebase already uses elsewhere (see Milestone 6's
// D5 in docs/DECISIONS.md) rather than pretending a keyword-substring net is
// a perfect classifier.

import * as Sentry from '@sentry/react-native'
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native'

// Case-insensitive substring match against extra/context/breadcrumb-data
// keys AND free-form exception/breadcrumb message text. Deliberately coarse
// and over-inclusive — better to drop or redact a benign field than leak a
// real one. Covers every category ADR-033's disallow-list names: money
// (amount, agorot, balance, budget), identifiers (household, account,
// transaction, user, invitation), user-entered content (category, merchant,
// description, note), auth/PII (email, token, password, name), and
// CSV/import contents (csv, import).
const SCRUBBED_KEY_SUBSTRINGS = [
  'amount',
  'agorot',
  'balance',
  'email',
  'token',
  'password',
  'household',
  'account',
  'transaction',
  'budget',
  'category',
  'merchant',
  'user',
  'name',
  'description',
  'note',
  'csv',
  'import',
  'invitation',
] as const

const REDACTED_MESSAGE = '[redacted by crash-reporting scrub rules — see ADR-033]'

function isScrubbedKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SCRUBBED_KEY_SUBSTRINGS.some((needle) => lower.includes(needle))
}

function containsScrubbedContent(text: string): boolean {
  const lower = text.toLowerCase()
  return SCRUBBED_KEY_SUBSTRINGS.some((needle) => lower.includes(needle))
}

// Free-form text (an exception message, a breadcrumb message) can't be
// surgically redacted field-by-field the way an object can — if it matches
// the deny-list at all, the whole string is replaced rather than guessing
// which substring is safe to keep.
function scrubText(text: string): string {
  return containsScrubbedContent(text) ? REDACTED_MESSAGE : text
}

// Recursive, not shallow — a nested object one level down (e.g.
// extra.request.body.email) must be scrubbed too, not just top-level keys.
function scrubObjectDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value

  if (Array.isArray(value)) {
    return value.map((item: unknown) => scrubObjectDeep(item)) as unknown as T
  }

  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isScrubbedKey(key)) continue
    result[key] = scrubObjectDeep(val)
  }
  return result as T
}

// HTTP/fetch/xhr breadcrumbs can carry Supabase REST query strings
// (?household_id=...) and request/response bodies (transaction amounts,
// descriptions) — both explicitly on ADR-033's disallow-list. `url` is kept
// only as method+path, stripped of any query string.
function scrubHttpBreadcrumbData(data: Record<string, unknown>): Record<string, unknown> {
  const { data: _body, body: _body2, url, ...rest } = data
  const scrubbedRest = scrubObjectDeep(rest)
  if (typeof url === 'string') {
    const [path] = url.split('?')
    return { ...scrubbedRest, url: path }
  }
  return scrubbedRest
}

const HTTP_BREADCRUMB_CATEGORIES = new Set(['http', 'fetch', 'xhr'])

export function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Development console.log/warn/error calls could contain financial data
  // logged during debugging — CLAUDE.md already forbids that, this is
  // defense in depth, not trust-the-rule-was-followed.
  if (breadcrumb.category === 'console') return null

  let result = breadcrumb

  if (result.message) {
    result = { ...result, message: scrubText(result.message) }
  }

  if (result.data) {
    // HTTP/fetch/xhr categories get the extra URL/body treatment; every
    // OTHER category's `data` still goes through the general key-based deep
    // scrub — a category like 'ui.click' carrying a `data.label` with an
    // amount in it must not sail through just because it isn't one of the
    // three network categories.
    const isHttpLike = result.category != null && HTTP_BREADCRUMB_CATEGORIES.has(result.category)
    result = {
      ...result,
      data: isHttpLike ? scrubHttpBreadcrumbData(result.data) : scrubObjectDeep(result.data),
    }
  }

  return result
}

export function beforeSend(event: ErrorEvent): ErrorEvent | null {
  return {
    ...event,
    message: event.message ? scrubText(event.message) : event.message,
    exception: event.exception
      ? {
          ...event.exception,
          values: event.exception.values?.map((exception) => ({
            ...exception,
            value: exception.value ? scrubText(exception.value) : exception.value,
          })),
        }
      : event.exception,
    extra: event.extra ? scrubObjectDeep(event.extra) : event.extra,
    contexts: event.contexts ? scrubObjectDeep(event.contexts) : event.contexts,
    breadcrumbs: event.breadcrumbs
      ?.map((crumb) => beforeBreadcrumb(crumb))
      .filter((crumb): crumb is Breadcrumb => crumb !== null),
  }
}

export function initCrashReporting(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN

  if (!dsn) {
    if (__DEV__) {
      console.warn('[crashReporting] EXPO_PUBLIC_SENTRY_DSN not set; Sentry disabled.')
    }
    return
  }

  try {
    Sentry.init({
      dsn,
      environment: __DEV__ ? 'development' : 'production',
      enabled: !__DEV__,
      sendDefaultPii: false,
      attachStacktrace: true,
      tracesSampleRate: 0,
      integrations: [],
      beforeBreadcrumb,
      beforeSend,
    })
  } catch (error) {
    // A crash-reporting init failure must never take the app down with it —
    // this call runs at module scope in app/_layout.tsx, before anything
    // else (including AppErrorBoundary) exists to catch a thrown error.
    if (__DEV__) {
      console.warn('[crashReporting] Sentry.init failed; crash reporting disabled.', error)
    }
  }
}

export function captureException(error: unknown, context?: Record<string, string>): void {
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined)
  } catch {
    // Called from AppErrorBoundary.componentDidCatch(), which nothing else
    // protects — a failure in the crash-reporting layer itself must never
    // propagate and break the very error boundary it's wired into.
  }
}

export function addBreadcrumb(message: string, category?: string): void {
  try {
    Sentry.addBreadcrumb({ message, category })
  } catch {
    // Same reasoning as captureException — never let this layer itself
    // throw into a caller.
  }
}
