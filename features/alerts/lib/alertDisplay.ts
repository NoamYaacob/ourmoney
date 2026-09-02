// Shared severity → icon/color mapping, used identically by the Dashboard
// section and the /alerts screen so the two surfaces never drift. Severity
// is never conveyed by color alone: each tier also gets a distinct glyph
// (filled vs. outline vs. a different family entirely), satisfying this
// milestone's own explicit accessibility requirement.

import type { ComponentProps } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import type { FinancialAlert, FinancialAlertSeverity, FinancialAlertType } from '@/types/app'

type IoniconName = ComponentProps<typeof Ionicons>['name']

export function severityIconName(severity: FinancialAlertSeverity): IoniconName {
  switch (severity) {
    case 'critical':
      return 'alert-circle'
    case 'warning':
      return 'alert-circle-outline'
    case 'info':
      return 'information-circle-outline'
  }
}

// `danger` is reserved for the critical tier only, matching its existing
// "financial-bad" meaning everywhere else in the app (over-budget figures,
// shortfall headlines) — warning/info deliberately stay neutral rather than
// introducing a new "amber" token not otherwise used in this design system.
export function severityColorToken(severity: FinancialAlertSeverity, scheme: 'light' | 'dark'): string {
  switch (severity) {
    case 'critical':
      return scheme === 'dark' ? colors.danger.dark : colors.danger.light
    case 'warning':
      return scheme === 'dark' ? colors.ink.dark : colors.ink.light
    case 'info':
      return scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  }
}

// ============================================================================
// The four tiers the design system draws
// ============================================================================
//
// `OurMoney - Design System.dc.html` §07 names four ("ארבע דרגות התראה"):
// דורש טיפול, כדאי לשים לב, מידע, and תובנה חיובית — money being freed up, a
// goal closing. The engine emits three severities, and it should keep
// emitting three: "this is good news" is not a severity, it is how a
// particular finding reads. So the fourth tier is derived here, at the
// display boundary these helpers already exist to own, rather than by
// widening FinancialAlertSeverity and rewriting every engine test.
//
// `excess_cash_available` is the one type that qualifies today. Adding
// another is a one-line change here, and deliberately not automatic: an
// alert is positive only if a household would read it as good news, which
// is a judgement, not a property of the row.

const POSITIVE_INSIGHT_TYPES: ReadonlySet<FinancialAlertType> = new Set<FinancialAlertType>([
  'excess_cash_available',
])

export type AlertTier = 'critical' | 'warning' | 'info' | 'positive'

export function alertTier(alert: Pick<FinancialAlert, 'type' | 'severity'>): AlertTier {
  if (alert.severity === 'info' && POSITIVE_INSIGHT_TYPES.has(alert.type)) return 'positive'
  return alert.severity
}

// Each tier gets its own glyph as well as its own colour — severity is never
// carried by colour alone (CLAUDE.md § accessibility). The design file picks
// these four specifically: a filled alert for what is broken, a warning
// triangle for what is heading that way, an information circle for a change
// worth knowing about, and a checkmark for good news.
export function tierIconName(tier: AlertTier): IoniconName {
  switch (tier) {
    case 'critical':
      return 'alert-circle'
    case 'warning':
      return 'warning'
    case 'info':
      return 'information-circle'
    case 'positive':
      return 'checkmark-circle'
  }
}

export function tierColor(tier: AlertTier, scheme: 'light' | 'dark'): string {
  switch (tier) {
    case 'critical':
      return scheme === 'dark' ? colors.danger.dark : colors.danger.light
    case 'warning':
      return scheme === 'dark' ? colors.warning.dark : colors.warning.light
    case 'info':
      return scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
    case 'positive':
      return scheme === 'dark' ? colors.positive.dark : colors.positive.light
  }
}

// The tinted card border the phone frame uses, and the heading colour both
// frames use for the group label above the cards.
export const TIER_BORDER_CLASS: Record<AlertTier, string> = {
  critical: 'border-dangerBorder-light dark:border-dangerBorder-dark',
  warning: 'border-warningBorder-light dark:border-warningBorder-dark',
  info: 'border-border-light dark:border-border-dark',
  positive: 'border-positiveBorder-light dark:border-positiveBorder-dark',
}

export const TIER_LABEL_CLASS: Record<AlertTier, string> = {
  critical: 'text-dangerStrong-light dark:text-dangerStrong-dark',
  warning: 'text-warningStrong-light dark:text-warningStrong-dark',
  info: 'text-inkMuted-light dark:text-inkMuted-dark',
  positive: 'text-positiveStrong-light dark:text-positiveStrong-dark',
}
