// Screen 14 of the mobile design — the fifth tab.
//
// Not a settings menu with extras bolted on: it is the index of everything
// the four money tabs deliberately left out, and its job is to make sure
// nothing urgent disappears by being here. Every row that can carry
// something time-sensitive shows it inline — the alert count, the next card
// charge, how much is actually available — so a household can tell from
// this one screen whether any of them needs opening.
//
// Two groups, in the design's order. The first is the product: money that
// is committed, owed, or being saved toward. The second is the workshop:
// import, categorisation rules, preferences. A rule the desktop rail
// learned the hard way — mixing the two makes the product half read as
// configuration.

import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useProfile } from '@/features/auth/hooks/useProfile'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useHouseholdMembers } from '@/features/household/hooks/useHouseholdMembers'
import { useFinancialAlerts } from '@/features/alerts/hooks/useFinancialAlerts'
import { useSavingsGoals } from '@/features/savings/hooks/useSavingsGoals'
import { useUpcomingCommitments } from '@/features/cashflow/hooks/useUpcomingCommitments'
import { useSafeToSpend } from '@/features/cashflow/hooks/useSafeToSpend'
import { formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { Screen } from '@/components/ui/Screen'
import { Avatar } from '@/components/ui/Avatar'
import { ListCard, ListRow, RowIcon } from '@/components/ui/ListCard'
import { StatusChip } from '@/components/ui/StatusChip'

export default function More() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const { user } = useAuth()
  const { displayName, avatarUrl } = useProfile(user?.id)
  const { householdId, household } = useHousehold(user?.id)
  const { members } = useHouseholdMembers(householdId)
  const { alerts } = useFinancialAlerts(householdId)
  const { goals } = useSavingsGoals(householdId)
  const { commitments } = useUpcomingCommitments(householdId)
  const { result: safeToSpend } = useSafeToSpend(householdId, 'month')

  const iconColor = scheme === 'dark' ? colors.ink.dark : colors.ink.light
  const criticalCount = alerts.filter((alert) => alert.severity === 'critical').length
  const activeGoals = goals.filter((goal) => !goal.is_completed)

  // The next credit-card charge, if the household has a card with an open
  // cycle. `buildUpcomingCommitments` already models this as its own source
  // type, so this row reports the engine's answer rather than re-deriving a
  // billing date from account settings.
  const nextCardCharge = commitments.find((commitment) => commitment.source === 'credit_card_cycle')

  return (
    <Screen width="wide">
      <Text className="text-title font-heebo text-ink-light dark:text-ink-dark">{t('more.title')}</Text>

      <ListCard className="mt-3">
        <ListRow
          title={displayName ?? ''}
          subtitle={
            household
              ? t('more.householdSubtitle', { household: household.name, count: members.length })
              : undefined
          }
          leading={<Avatar displayName={displayName ?? ''} avatarUrl={avatarUrl} size={44} />}
          onPress={() => router.push('/settings')}
        />
      </ListCard>

      <ListCard className="mt-4">
        <ListRow
          title={t('more.alerts')}
          leading={
            <RowIcon tone={criticalCount > 0 ? 'danger' : 'neutral'}>
              <Ionicons
                name="notifications-outline"
                size={18}
                color={criticalCount > 0 ? (scheme === 'dark' ? colors.danger.dark : colors.dangerStrong.light) : iconColor}
              />
            </RowIcon>
          }
          trailing={
            criticalCount > 0 ? <StatusChip label={String(criticalCount)} tone="danger" /> : undefined
          }
          onPress={() => router.push('/alerts')}
        />
        <ListRow
          title={t('more.credit')}
          subtitle={
            nextCardCharge ? t('more.creditSubtitle', { date: formatDateDisplay(nextCardCharge.date) }) : t('more.creditEmpty')
          }
          leading={
            <RowIcon>
              <Ionicons name="card-outline" size={18} color={iconColor} />
            </RowIcon>
          }
          onPress={() => router.push('/installments')}
        />
        <ListRow
          title={t('more.planning')}
          subtitle={t('more.planningSubtitle')}
          leading={
            <RowIcon>
              <Ionicons name="calendar-outline" size={18} color={iconColor} />
            </RowIcon>
          }
          onPress={() => router.push('/obligations')}
        />
        <ListRow
          title={t('more.accounts')}
          subtitle={t('more.accountsSubtitle', { amount: formatILS(safeToSpend.availableCashAgorot) })}
          leading={
            <RowIcon>
              <Ionicons name="wallet-outline" size={18} color={iconColor} />
            </RowIcon>
          }
          onPress={() => router.push('/accounts')}
        />
        <ListRow
          title={t('more.goals')}
          subtitle={
            activeGoals.length > 0 ? t('more.goalsSubtitle', { count: activeGoals.length }) : t('more.goalsEmpty')
          }
          leading={
            <RowIcon>
              <Ionicons name="flag-outline" size={18} color={iconColor} />
            </RowIcon>
          }
          onPress={() => router.push('/goals')}
        />
        {/* Locked/informational, never a working (even mocked) connection —
            see connections/index.tsx's own header comment for why. The
            "בקרוב" badge here is the same signal the target screen repeats
            on every row, so nobody taps through expecting a real flow. */}
        <ListRow
          title={t('more.connections')}
          leading={
            <RowIcon>
              <Ionicons name="link-outline" size={18} color={iconColor} />
            </RowIcon>
          }
          badges={<StatusChip label={t('connections.comingSoon')} />}
          onPress={() => router.push('/connections')}
        />
      </ListCard>

      <ListCard className="mt-3">
        <ListRow
          title={t('more.import')}
          leading={
            <RowIcon>
              <Ionicons name="cloud-upload-outline" size={18} color={iconColor} />
            </RowIcon>
          }
          onPress={() => router.push('/transactions/import')}
        />
        <ListRow
          title={t('more.categories')}
          leading={
            <RowIcon>
              <Ionicons name="pricetags-outline" size={18} color={iconColor} />
            </RowIcon>
          }
          onPress={() => router.push('/settings/categories')}
        />
        <ListRow
          title={t('more.settings')}
          leading={
            <RowIcon>
              <Ionicons name="settings-outline" size={18} color={iconColor} />
            </RowIcon>
          }
          onPress={() => router.push('/settings')}
        />
      </ListCard>

      <View className="h-4" />
    </Screen>
  )
}
