// Reached from the Dashboard alerts section, not a tab — same posture as
// accounts/recurring/goals/obligations/cash-flow. Current-state alerts
// only, derived live from useFinancialAlerts.ts on every render — no
// persisted history, no read/unread state. If the underlying condition
// disappears, the alert disappears; that is intentional (this is not the
// separately-named, still-future "in-app notification centre" — see
// features/alerts/hooks/useFinancialAlerts.ts's own header).

import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useFinancialAlerts } from '@/features/alerts/hooks/useFinancialAlerts'
import { severityColorToken, severityIconName } from '@/features/alerts/lib/alertDisplay'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { INLINE_FORM_WIDTH_CLASS } from '@/constants/layout'
import type { FinancialAlert, FinancialAlertSeverity } from '@/types/app'
import { ICON } from '@/constants/icons'

const SEVERITY_GROUPS: { severity: FinancialAlertSeverity; labelKey: string }[] = [
  { severity: 'critical', labelKey: 'alerts.groups.critical' },
  { severity: 'warning', labelKey: 'alerts.groups.warning' },
  { severity: 'info', labelKey: 'alerts.groups.info' },
]

export default function Alerts() {
  const { t } = useTranslation()
  const router = useRouter()
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
      <Text className="mb-6 text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('alerts.screenTitle')}
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
              <EmptyState icon="✅" message={t('alerts.empty')} />
            </View>
            <View className="hidden web:desktop:flex web:desktop:items-center web:desktop:rounded-card web:desktop:border web:desktop:border-border-light web:desktop:bg-surfaceMuted-light web:desktop:px-10 web:desktop:py-16 dark:web:desktop:border-border-dark dark:web:desktop:bg-surfaceMuted-dark">
              <EmptyState icon="✅" message={t('alerts.empty')} />
            </View>
          </>
        ) : (
          SEVERITY_GROUPS.map((group) => {
            const groupAlerts = alerts.filter((alert) => alert.severity === group.severity)
            if (groupAlerts.length === 0) return null
            return (
              <View key={group.severity} className="mb-6">
                <SectionLabel className="mb-2">{t(group.labelKey)}</SectionLabel>
                {/* Mobile/tablet: one shared Card with Divider-separated
                    rows (unchanged). Desktop Claude Design pass: the
                    mockup's own treatment instead — each alert is its own
                    card with a severity-colored border-start stripe, the
                    same visual language Dashboard's "דורש טיפול" panel
                    already uses for the identical alert data. */}
                <Card className="web:desktop:hidden">
                  {groupAlerts.map((alert: FinancialAlert, index) => (
                    <View key={alert.id}>
                      {index > 0 && (
                        <View className="my-3">
                          <Divider />
                        </View>
                      )}
                      <Pressable
                        onPress={() => router.push(alert.actionRoute)}
                        accessibilityRole="button"
                        className="flex-row items-center gap-3"
                      >
                        <Ionicons
                          name={severityIconName(alert.severity)}
                          size={ICON.nav}
                          color={severityColorToken(alert.severity, scheme === 'dark' ? 'dark' : 'light')}
                        />
                        <View className="flex-1">
                          <Text className="text-body text-ink-light dark:text-ink-dark">{alert.title}</Text>
                          <Text className="mt-0.5 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                            {alert.description}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  ))}
                </Card>
                <View className="hidden web:desktop:flex web:desktop:gap-2.5">
                  {groupAlerts.map((alert: FinancialAlert) => (
                    <Pressable
                      key={alert.id}
                      onPress={() => router.push(alert.actionRoute)}
                      accessibilityRole="button"
                      className={`web:desktop:flex-row web:desktop:gap-3 web:desktop:rounded-row web:desktop:border web:desktop:border-e-[3px] web:desktop:bg-surfaceMuted-light web:desktop:p-4 dark:web:desktop:bg-surfaceMuted-dark ${
                        alert.severity === 'critical'
                          ? 'web:desktop:border-border-light web:desktop:border-e-danger-light dark:web:desktop:border-border-dark dark:web:desktop:border-e-danger-dark'
                          : alert.severity === 'warning'
                            ? 'web:desktop:border-border-light web:desktop:border-e-warning-light dark:web:desktop:border-border-dark dark:web:desktop:border-e-warning-dark'
                            : 'web:desktop:border-border-light dark:web:desktop:border-border-dark'
                      }`}
                    >
                      <Ionicons
                        name={severityIconName(alert.severity)}
                        size={ICON.nav}
                        color={severityColorToken(alert.severity, scheme === 'dark' ? 'dark' : 'light')}
                      />
                      <View className="web:desktop:flex-1">
                        <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">{alert.title}</Text>
                        <Text className="web:desktop:mt-0.5 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                          {alert.description}
                        </Text>
                      </View>
                    </Pressable>
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
