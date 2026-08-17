// Shared severity → icon/color mapping, used identically by the Dashboard
// section and the /alerts screen so the two surfaces never drift. Severity
// is never conveyed by color alone: each tier also gets a distinct glyph
// (filled vs. outline vs. a different family entirely), satisfying this
// milestone's own explicit accessibility requirement.

import type { ComponentProps } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import type { FinancialAlertSeverity } from '@/types/app'

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
