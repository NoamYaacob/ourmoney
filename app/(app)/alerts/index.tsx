// Reached from the Dashboard alerts section, not a tab — same posture as
// accounts/recurring/goals/obligations/cash-flow. Current-state alerts
// only, derived live from useFinancialAlerts.ts on every render — no
// persisted history, no read/unread state. If the underlying condition
// disappears, the alert disappears; that is intentional (this is not the
// separately-named, still-future "in-app notification centre" — see
// features/alerts/hooks/useFinancialAlerts.ts's own header).

import { Platform, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useFinancialAlerts } from '@/features/alerts/hooks/useFinancialAlerts'
import { alertTier, tierColor, TIER_LABEL_CLASS, type AlertTier } from '@/features/alerts/lib/alertDisplay'
import { AlertCard } from '@/features/alerts/components/AlertCard'
import { Screen } from '@/components/ui/Screen'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { DESKTOP_BREAKPOINT_PX, INLINE_FORM_WIDTH_CLASS } from '@/constants/layout'
import type { FinancialAlert } from '@/types/app'

// The four tiers, in the order the design files stack them: what is broken,
// what is heading that way, what changed, and what is good news.
const TIER_GROUPS: { tier: AlertTier; labelKey: string }[] = [
  { tier: 'critical', labelKey: 'alerts.groups.critical' },
  { tier: 'warning', labelKey: 'alerts.groups.warning' },
  { tier: 'info', labelKey: 'alerts.groups.info' },
  { tier: 'positive', labelKey: 'alerts.groups.positive' },
]

export default function Alerts() {
  const { t } = useTranslation()
  // Same route split the other redesigned screens make: the two frames draw
  // an alert differently enough that a utility override cannot express it.
  const { width } = useWindowDimensions()
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT_PX
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { alerts, isLoading, hasPartialError } = useFinancialAlerts(householdId)
  const { colorScheme: scheme } = useColorScheme()

  if (isHouseholdLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  return (
    <Screen width="wide">
      <Text className="text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('alerts.screenTitle')}
      </Text>
      {/* Both frames carry this line under the title. It is the one thing a
          household needs to know about this screen: nothing here is a log —
          an alert exists only while the condition behind it does, and it
          leaves on its own when the problem is solved. */}
      <Text className="mb-4 mt-0.5 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
        {t('alerts.subtitle')}
      </Text>

      {/* A single failed source degrades to fewer alerts, never a blank
          screen (useFinancialAlerts.ts's own partial-availability design)
          — this is a non-blocking heads-up, not an error state. */}
      {hasPartialError && (
        <View className="mb-4">
          <ErrorMessage message={t('alerts.errors.partial')} />
        </View>
      )}

      <View className={INLINE_FORM_WIDTH_CLASS}>
        {isLoading ? (
          <SkeletonList rows={3} />
        ) : alerts.length === 0 ? (
          // Visual QA + Desktop Polish pass: a small icon + one line was the
          // entire desktop page below the title — the same "reads as
          // broken/empty" problem Budgets/Transactions' true-empty states
          // already solved with a bounded, padded card. Mobile/tablet keep
          // the exact original (non-compact) EmptyState, unchanged; desktop
          // additionally wraps its own copy in a roomier bordered card.
          // architecture-reviewer finding: an earlier version of this fix
          // switched the mobile copy to `compact`, which would have shrunk
          // mobile's existing empty state — not requested, and not what the
          // comment claimed.
          <>
            <View className="web:desktop:hidden">
              <EmptyState iconName="checkmark-circle-outline" message={t('alerts.empty')} />
            </View>
            <View className="hidden web:desktop:flex web:desktop:items-center web:desktop:rounded-card web:desktop:border web:desktop:border-border-light web:desktop:bg-surfaceMuted-light web:desktop:px-10 web:desktop:py-16 dark:web:desktop:border-border-dark dark:web:desktop:bg-surfaceMuted-dark">
              <EmptyState iconName="checkmark-circle-outline" message={t('alerts.empty')} />
            </View>
          </>
        ) : (
          TIER_GROUPS.map((group) => {
            const groupAlerts = alerts.filter((alert) => alertTier(alert) === group.tier)
            if (groupAlerts.length === 0) return null
            return (
              <View key={group.tier} className="mb-5">
                {/* The heading carries a tier dot and the count, as both
                    frames draw it — "דורש טיפול · 2" tells a household how
                    much is waiting before they read a single card. */}
                <View className="mb-2 flex-row items-center gap-2">
                  <View
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tierColor(group.tier, scheme === 'dark' ? 'dark' : 'light') }}
                  />
                  <Text className={`text-meta font-sansSemibold tracking-[0.06em] ${TIER_LABEL_CLASS[group.tier]}`}>
                    {t('alerts.groupCount', { label: t(group.labelKey), count: groupAlerts.length })}
                  </Text>
                </View>
                <View className="gap-2.5">
                  {groupAlerts.map((alert: FinancialAlert) => (
                    <AlertCard key={alert.id} alert={alert} variant={isDesktopWeb ? 'stripe' : 'card'} />
                  ))}
                </View>
              </View>
            )
          })
        )}
      </View>
    </Screen>
  )
}
