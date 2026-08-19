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
import { INLINE_FORM_WIDTH_CLASS } from '@/constants/layout'
import type { FinancialAlert, FinancialAlertSeverity } from '@/types/app'

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
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
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
          <EmptyState icon="✅" message={t('alerts.empty')} />
        ) : (
          SEVERITY_GROUPS.map((group) => {
            const groupAlerts = alerts.filter((alert) => alert.severity === group.severity)
            if (groupAlerts.length === 0) return null
            return (
              <View key={group.severity} className="mb-6">
                <Text className="mb-2 text-sm font-semibold text-ink-light dark:text-ink-dark">
                  {t(group.labelKey)}
                </Text>
                <Card>
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
                          size={20}
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
              </View>
            )
          })
        )}
      </View>
    </Screen>
  )
}
