// Screen 01 of the mobile design — the app's front door.
//
// Four blocks, in this order, and deliberately not ten cards:
//
//   1. פנוי באמת, on the dark panel, as the only figure at hero size.
//   2. The one thing that needs dealing with, if anything does.
//   3. What comes off the account next.
//   4. Where the month's budget stands.
//
// Everything else the desktop dashboard shows — the six-month trend, the
// category donut, savings goals, the full alert list — is either reachable
// from "עוד" or sits behind the analytics disclosure at the bottom. The
// brief's rule was that a household should understand its situation in
// about five seconds, and every card added to this screen costs some of
// them.
//
// This is a sibling of the desktop dashboard, not a narrowed copy of it:
// app/(app)/dashboard/index.tsx picks between the two by width. That split
// is what lets the desktop layout stay exactly as approved while this one
// is structured for a thumb.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useProfile } from '@/features/auth/hooks/useProfile'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useSafeToSpend } from '@/features/cashflow/hooks/useSafeToSpend'
import { useUpcomingCommitments } from '@/features/cashflow/hooks/useUpcomingCommitments'
import { useFinancialAlerts } from '@/features/alerts/hooks/useFinancialAlerts'
import { useBudgetProgress } from '@/features/budgets/hooks/useBudgetProgress'
import { getCurrentMonthPeriodStart, getPeriodEnd, localDateString } from '@/features/budgets/lib/budgetPeriod'
import { budgetState, BUDGET_STATE_LABEL_KEY, BUDGET_STATE_TONE } from '@/features/budgets/lib/budgetState'
import { remainingAgorot } from '@/lib/money/arithmetic'
import { formatILS } from '@/lib/money/format'
import { commitmentUrgency, greetingKey } from '@/features/dashboard/lib/commitmentUrgency'
import { MobileAnalyticsSection } from '@/features/dashboard/components/MobileAnalyticsSection'
import { Screen } from '@/components/ui/Screen'
import { FAB } from '@/components/ui/FAB'
import { Avatar } from '@/components/ui/Avatar'
import { Money } from '@/components/ui/Money'
import { HeroPanel, HeroLabel, HeroNote, HeroTag } from '@/components/ui/HeroPanel'
import { ListCard, ListRow } from '@/components/ui/ListCard'
import { CardHeading } from '@/components/ui/SectionLabel'
import { StatusChip } from '@/components/ui/StatusChip'
import { CommitmentRow } from '@/components/ui/CommitmentRow'
import { BudgetBar } from '@/components/ui/BudgetBar'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

// How many upcoming charges the Home card lists before deferring to the
// full screen. Two, not five: the card answers "what's next", and a fifth
// row pushes the budget block below the fold on a 375px phone.
const HOME_COMMITMENT_ROWS = 2

export function MobileHome() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const { user } = useAuth()
  const { displayName, avatarUrl } = useProfile(user?.id)
  const { householdId, household, isLoading: isHouseholdLoading } = useHousehold(user?.id)

  const {
    result: safeToSpend,
    horizon,
    isLoading: isSafeToSpendLoading,
    error: safeToSpendError,
  } = useSafeToSpend(householdId, 'month')
  const { commitments, isLoading: isCommitmentsLoading } = useUpcomingCommitments(householdId)
  const { alerts } = useFinancialAlerts(householdId)

  const periodStart = getCurrentMonthPeriodStart()
  const periodEnd = getPeriodEnd(periodStart)
  const today = localDateString()
  const {
    totalAllocatedAgorot,
    totalSpentAgorot,
    isLoading: isBudgetLoading,
    error: budgetError,
  } = useBudgetProgress(householdId, periodStart)

  // The six-month trend, the category donut and the top-categories list are
  // not part of the design's Home — but they are also not part of any other
  // mobile screen, so leaving them out entirely would make them unreachable
  // on a phone. They sit behind this disclosure instead: closed by default
  // so the four blocks above keep the screen, open for a household that
  // came looking. Their queries are gated on it too, so a closed section
  // costs nothing.
  const [showAnalytics, setShowAnalytics] = useState(false)

  // Fail-safe display, the same gate every other screen in this app uses:
  // while the household query is in flight every downstream hook is
  // disabled, so rendering now would show a fully-loaded-looking ₪0.00 that
  // a household with no money could not tell apart from the truth.
  if (isHouseholdLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  const greeting = t(`home.greeting.${greetingKey(new Date().getHours())}`, { name: displayName ?? '' })
  const criticalAlert = alerts.find((alert) => alert.severity === 'critical')
  const alertCount = alerts.filter((alert) => alert.severity !== 'info').length
  const upcoming = commitments.slice(0, HOME_COMMITMENT_ROWS)
  const upcomingTotalAgorot = commitments.reduce((sum, commitment) => sum + commitment.amountAgorot, 0)

  const hasShortfall = safeToSpend.safeToSpendAgorot < 0
  // Days left in the horizon, inclusive of today — a household spending the
  // "per day" figure every remaining day lands exactly on zero.
  const daysLeft = Math.max(1, Math.round((Date.parse(horizon.end) - Date.parse(today)) / 86_400_000) + 1)
  const perDayAgorot = hasShortfall ? 0 : Math.floor(safeToSpend.safeToSpendAgorot / daysLeft)

  // The composition bar: how the money that exists right now divides into
  // free / committed-to-obligations / committed-to-recurring-and-instalments.
  // Percentages of availableCash, so the three segments read as slices of
  // one real quantity rather than an abstract 100%.
  const cash = Math.max(1, safeToSpend.availableCashAgorot)
  const freePercent = Math.max(0, (Math.max(0, safeToSpend.safeToSpendAgorot) / cash) * 100)
  const obligationsPercent = Math.min(100 - freePercent, (safeToSpend.plannedObligationsAgorot / cash) * 100)
  const recurringPercent = Math.max(0, 100 - freePercent - obligationsPercent)

  const budgetRemaining = remainingAgorot(totalAllocatedAgorot, totalSpentAgorot)
  // The same classifier the Budget screen and every category row use, so
  // this block and that screen can never describe one month two ways.
  const monthState = budgetState({
    allocatedAgorot: totalAllocatedAgorot,
    spentAgorot: totalSpentAgorot,
    periodStart,
    periodEnd,
    today,
  })
  const monthLabel = new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(
    new Date(Number(periodStart.slice(0, 4)), Number(periodStart.slice(5, 7)) - 1, 1)
  )

  return (
    <Screen
      width="wide"
      floatingAction={<FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />}
    >
      {/* Header. The two top corners carry only navigation, never a primary
          action — the design's own hand-reach rule; the one thing a
          household does often (add a transaction) is the FAB down by the
          thumb instead. */}
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-title font-heebo text-ink-light dark:text-ink-dark">{greeting}</Text>
          {household && (
            <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">{household.name}</Text>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.push('/alerts')}
            accessibilityRole="button"
            accessibilityLabel={t('alerts.screenTitle')}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="notifications-outline" size={23} color={isDark ? colors.ink.dark : colors.ink.light} />
            {alertCount > 0 && (
              <View
                className="absolute end-1.5 top-1 min-w-[17px] items-center justify-center rounded-full px-1"
                style={{ height: 17, backgroundColor: isDark ? colors.danger.dark : colors.danger.light }}
              >
                <Text
                  className="font-heeboBold text-meta"
                  style={{ color: isDark ? colors.hero.light : '#ffffff' }}
                  maxFontSizeMultiplier={1.2}
                >
                  {alertCount}
                </Text>
              </View>
            )}
          </Pressable>
          <Avatar displayName={displayName ?? ''} avatarUrl={avatarUrl} size={38} />
        </View>
      </View>

      {/* 1 — פנוי באמת. Tapping opens the full derivation. */}
      <HeroPanel
        onPress={() => router.push('/safe-to-spend')}
        accessibilityLabel={t('safeToSpendDetail.title')}
        testID="home-hero"
      >
        <View className="flex-row items-center justify-between">
          <HeroLabel>{t('home.hero.label', { horizon: t('cashFlow.horizon.month') })}</HeroLabel>
          <View className="flex-row items-center gap-1">
            <Text className="text-meta font-sansSemibold text-heroAccent-light">{t('home.hero.howWeCalculated')}</Text>
            <Ionicons name="chevron-back" size={ICON.chip} color={colors.heroAccent.light} />
          </View>
        </View>

        {safeToSpendError ? (
          <View className="mt-2">
            <ErrorMessage message={t('cashFlow.errors.generic')} />
          </View>
        ) : isSafeToSpendLoading ? (
          <View className="mt-2">
            <SkeletonList rows={1} />
          </View>
        ) : (
          <>
            <View className="mt-1.5">
              <Money
                agorot={hasShortfall ? safeToSpend.shortfallAgorot : safeToSpend.safeToSpendAgorot}
                size="hero"
                tone="hero"
              />
            </View>
            <View className="mt-1 flex-row items-center gap-2">
              <HeroTag>{hasShortfall ? t('home.hero.shortfallTag') : t('home.hero.notBankBalance')}</HeroTag>
              {!hasShortfall && perDayAgorot > 0 && (
                <HeroNote>{t('home.hero.perDay', { amount: formatILS(perDayAgorot) })}</HeroNote>
              )}
            </View>
            {hasShortfall && <HeroNote className="mt-2">{t('home.hero.shortfallNote')}</HeroNote>}

            {/* The composition bar. Three segments, no legend: the panel's
                own numbers name them, and a legend on a 4-line hero is more
                to read than the bar saves. */}
            {!hasShortfall && safeToSpend.availableCashAgorot > 0 && (
              <View
                className="mt-4 h-2.5 flex-row gap-0.5 overflow-hidden rounded-full"
                accessibilityLabel={t('home.hero.compositionLabel', {
                  amount: formatILS(safeToSpend.availableCashAgorot),
                  safe: formatILS(safeToSpend.safeToSpendAgorot),
                })}
              >
                <View style={{ width: `${freePercent}%`, backgroundColor: colors.accent.light }} />
                <View style={{ width: `${obligationsPercent}%`, backgroundColor: colors.heroBorder.light }} />
                <View style={{ width: `${recurringPercent}%`, backgroundColor: colors.inkMuted.light }} />
              </View>
            )}
          </>
        )}
      </HeroPanel>

      {/* 2 — the one thing that needs dealing with. Rendered only when the
          engine has a critical alert; there is no "all good" card, because a
          card that says nothing is happening is still a card competing for
          the five seconds. */}
      {criticalAlert && (
        <Pressable
          onPress={() => router.push(criticalAlert.actionRoute as never)}
          accessibilityRole="button"
          className="mt-3"
        >
          <View className="flex-row items-start gap-3 rounded-card border border-dangerBorder-light bg-surfaceMuted-light p-4 dark:border-dangerBorder-dark dark:bg-surfaceMuted-dark">
            <View className="h-9 w-9 items-center justify-center rounded-row bg-dangerSurface-light dark:bg-dangerSurface-dark">
              <Ionicons name="alert-circle" size={ICON.nav} color={isDark ? colors.danger.dark : colors.danger.light} />
            </View>
            <View className="flex-1">
              <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
                {criticalAlert.title}
              </Text>
              <Text className="mt-0.5 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {criticalAlert.description}
              </Text>
            </View>
          </View>
        </Pressable>
      )}

      {/* 3 — what comes off the account next. */}
      <View className="mt-3 rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
        <CardHeading
          trailing={
            commitments.length > 0 ? (
              <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {t('home.next.summary', { count: commitments.length, amount: formatILS(upcomingTotalAgorot) })}
              </Text>
            ) : undefined
          }
        >
          {t('home.next.title')}
        </CardHeading>

        {isCommitmentsLoading ? (
          <View className="mt-2">
            <SkeletonList rows={2} />
          </View>
        ) : upcoming.length === 0 ? (
          <Text className="mt-3 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
            {t('home.next.empty')}
          </Text>
        ) : (
          <View className="mt-2">
            {upcoming.map((commitment) => {
              const urgency = commitmentUrgency(today, commitment.date)
              const chipLabel =
                urgency.labelKey === 'inDays'
                  ? t('home.next.inDays', { count: urgency.count })
                  : t(`home.next.${urgency.labelKey}`)

              return (
                <View key={commitment.id} className="border-t border-divider-light dark:border-divider-dark">
                  <CommitmentRow
                    date={commitment.date}
                    name={commitment.description}
                    amountAgorot={commitment.amountAgorot}
                    timeLabel={chipLabel}
                    tone={urgency.tone}
                    meta={t(`cashFlow.commitments.source.${commitment.source}`)}
                  />
                </View>
              )
            })}

            <Pressable
              onPress={() => router.push('/cash-flow')}
              accessibilityRole="button"
              className="flex-row items-center justify-center gap-1.5 border-t border-divider-light pt-3 dark:border-divider-dark"
            >
              <Text className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
                {t('home.next.viewAll')}
              </Text>
              <Ionicons name="chevron-back" size={ICON.chip} color={isDark ? colors.accent.dark : colors.accent.light} />
            </Pressable>
          </View>
        )}
      </View>

      {/* 4 — the month's budget. */}
      <Pressable onPress={() => router.push('/budgets')} accessibilityRole="button" className="mt-3">
        <View className="rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
          {budgetError ? (
            <ErrorMessage message={t('dashboard.errors.generic')} />
          ) : isBudgetLoading ? (
            <SkeletonList rows={2} />
          ) : totalAllocatedAgorot === 0 ? (
            <>
              <CardHeading>{t('home.budget.title', { month: monthLabel })}</CardHeading>
              <Text className="mt-2 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {t('home.budget.empty')}
              </Text>
            </>
          ) : (
            <>
              <CardHeading
                trailing={
                  <StatusChip
                    label={t(BUDGET_STATE_LABEL_KEY[monthState.state])}
                    tone={BUDGET_STATE_TONE[monthState.state]}
                    dot
                  />
                }
              >
                {t('home.budget.title', { month: monthLabel })}
              </CardHeading>
              <View className="mt-2 flex-row items-baseline gap-2">
                <Money agorot={budgetRemaining} size="large" tone={budgetRemaining < 0 ? 'danger' : 'default'} />
                <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                  {t('home.budget.remainingOf', { total: formatILS(totalAllocatedAgorot) })}
                </Text>
              </View>
              <View className="mt-2.5">
                <BudgetBar
                  percent={monthState.percentSpent ?? 0}
                  pacePercent={monthState.pacePercent}
                  state={monthState.state}
                  height={9}
                  accessibilityLabel={`${t(BUDGET_STATE_LABEL_KEY[monthState.state])}, ${monthState.percentSpent ?? 0}%`}
                />
              </View>
              {monthState.hasProjection && (
                <Text className="mt-2 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                  {monthState.projectedOverspendAgorot > 0
                    ? t('home.budget.projectionOver', { amount: formatILS(monthState.projectedOverspendAgorot) })
                    : t('home.budget.projectionOk')}
                </Text>
              )}
            </>
          )}
        </View>
      </Pressable>

      {/* Analytics, closed by default. See MobileAnalyticsSection's header
          for why this is a disclosure rather than a fifth block or a screen
          of its own. */}
      <View className="mt-3 rounded-card border border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark">
        <Pressable
          onPress={() => setShowAnalytics((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAnalytics }}
          className="min-h-[52px] flex-row items-center justify-between px-4 py-3"
        >
          <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark">
            {t('home.analytics.toggle')}
          </Text>
          <Ionicons
            name={showAnalytics ? 'chevron-up' : 'chevron-down'}
            size={ICON.row}
            color={isDark ? colors.inkMuted.dark : colors.inkMuted.light}
          />
        </Pressable>
        {showAnalytics && (
          <View className="border-t border-divider-light px-4 py-4 dark:border-divider-dark">
            <MobileAnalyticsSection householdId={householdId} periodStart={periodStart} />
          </View>
        )}
      </View>

      <View className="h-4" />
    </Screen>
  )
}
