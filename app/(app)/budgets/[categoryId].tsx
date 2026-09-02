// One budget category, and the transactions behind its number.
//
// `OurMoney - Mobile.dc.html` screen 08 — "מהתקציב לתנועות של אותה קטגוריה".
// The budget list could say a category was 84% spent but not what it was
// spent on, so the obvious next question had no answer anywhere: tapping a
// row opened an inline amount field instead, which answers a question nobody
// arrives with.
//
// It computes nothing of its own. The progress figures come from
// useBudgetProgress — the same hook, the same period, the same numbers the
// list row showed a moment earlier — and the transactions come from
// useTransactions' existing category + period filters. If a figure here ever
// disagreed with the row that led to it, that would mean two calculations
// existed.
//
// Desktop does not route here: its own frame edits allocations inline in the
// list and has no per-category screen, so BudgetCategoryRow keeps that
// behaviour at desktop widths and only the phone navigates.

import { Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useBudgetProgress } from '@/features/budgets/hooks/useBudgetProgress'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { usePeriodStore } from '@/store/periodStore'
import { budgetState, BUDGET_STATE_LABEL_KEY, BUDGET_STATE_TONE } from '@/features/budgets/lib/budgetState'
import { getPeriodEnd, localDateString } from '@/features/budgets/lib/budgetPeriod'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { BudgetBar } from '@/components/ui/BudgetBar'
import { StatusChip } from '@/components/ui/StatusChip'
import { Money } from '@/components/ui/Money'
import { Screen } from '@/components/ui/Screen'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDateDisplay } from '@/lib/dates/format'
import { formatILS } from '@/lib/money/format'
import { sumAgorot } from '@/lib/money/arithmetic'

export default function BudgetCategoryDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>()
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const periodStart = usePeriodStore((s) => s.selectedPeriodStart)
  const periodEnd = getPeriodEnd(periodStart)
  const { categories, isLoading, error, refetch } = useBudgetProgress(householdId, periodStart)
  const { transactions } = useTransactions(householdId, { categoryId, periodStart, periodEnd })

  if (isHouseholdLoading || isLoading) {
    return (
      <Screen onBack={() => router.back()} center>
        <LoadingSpinner />
      </Screen>
    )
  }

  const category = categories.find((c) => c.categoryId === categoryId)
  if (error || !category) {
    return (
      <Screen onBack={() => router.back()}>
        <ErrorMessage
          message={error ? t('budgets.errors.generic') : t('budgets.category.notFound')}
          onRetry={error ? refetch : undefined}
        />
      </Screen>
    )
  }

  const state = budgetState({
    allocatedAgorot: category.allocatedAgorot,
    spentAgorot: category.spentAgorot,
    periodStart,
    periodEnd,
    today: localDateString(),
  })
  const isOver = category.remainingAgorot < 0

  // Expenses only, and only the ones this category's own spend already
  // counts — the same rows useBudgetProgress summed, so the average below
  // divides the figure on screen by the rows on screen.
  const expenses = transactions.filter((txn) => txn.amount_agorot < 0 && !txn.is_excluded && txn.transfer_id === null)
  const averageAgorot =
    expenses.length > 0
      ? Math.round(Math.abs(sumAgorot(expenses.map((txn) => txn.amount_agorot))) / expenses.length)
      : 0

  return (
    <Screen onBack={() => router.back()} scroll width="form">
      <View className="mb-3 min-h-[44px] flex-row items-center justify-between gap-3">
        <Text className="text-title font-heebo text-ink-light dark:text-ink-dark" numberOfLines={1}>
          {category.categoryNameHe}
        </Text>
        {/* Editing the allocation is where the frame puts it: an action on
            this screen, not the thing tapping a row does. */}
        <Pressable
          onPress={() => router.replace('/budgets')}
          accessibilityRole="button"
          accessibilityLabel={t('budgets.category.editAllocation')}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="create-outline" size={ICON.nav} color={iconColor} />
        </Pressable>
      </View>

      <View className="rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
        <View className="flex-row items-center gap-3">
          <CategoryIcon icon={category.categoryIcon} />
          <View className="flex-1">
            <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
              {t('budgets.category.remainingInCategory')}
            </Text>
            <Money
              agorot={category.remainingAgorot}
              size="figure"
              tone={isOver ? 'danger' : 'default'}
            />
          </View>
          <StatusChip label={t(BUDGET_STATE_LABEL_KEY[state.state])} tone={BUDGET_STATE_TONE[state.state]} />
        </View>

        <View className="mt-3.5">
          <BudgetBar
            percent={state.percentSpent ?? 0}
            pacePercent={state.pacePercent}
            state={state.state}
            height={10}
            accessibilityLabel={`${category.categoryNameHe}, ${t(BUDGET_STATE_LABEL_KEY[state.state])}`}
          />
        </View>

        <View className="mt-2.5 flex-row items-baseline justify-between gap-3">
          <Text
            className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {t('budgets.category.spentOf', {
              spent: formatILS(category.spentAgorot),
              total: formatILS(category.allocatedAgorot),
            })}
          </Text>
          <Text
            className={`text-caption font-sans ${
              isOver ? 'text-dangerStrong-light dark:text-dangerStrong-dark' : 'text-positiveStrong-light dark:text-positiveStrong-dark'
            }`}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {isOver
              ? t('budgets.category.exceeded', { amount: formatILS(Math.abs(category.remainingAgorot)) })
              : t('budgets.category.remaining', { amount: formatILS(category.remainingAgorot) })}
          </Text>
        </View>

        {expenses.length > 0 && (
          <Text className="mt-3 border-t border-divider-light pt-3 text-caption font-sans text-inkMuted-light dark:border-divider-dark dark:text-inkMuted-dark">
            {t('budgets.category.countAndAverage', {
              count: expenses.length,
              average: formatILS(averageAgorot),
            })}
            {state.state === 'approaching' && state.projectedOverspendAgorot > 0
              ? `. ${t('budgets.category.projectedOver', { amount: formatILS(state.projectedOverspendAgorot) })}`
              : ''}
          </Text>
        )}
      </View>

      <Text className="mb-2 mt-5 text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
        {t('budgets.category.detailTransactions')}
      </Text>

      {transactions.length === 0 ? (
        <EmptyState
          iconName="receipt-outline"
          message={t('budgets.category.detailEmpty')}
          hint={t('budgets.category.detailEmptyHint')}
          compact
        />
      ) : (
        <View className="overflow-hidden rounded-card border border-border-light bg-surfaceMuted-light px-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
          {transactions.map((txn, index) => (
            <Pressable
              key={txn.id}
              onPress={() => router.push(`/transactions/${txn.id}`)}
              accessibilityRole="button"
              accessibilityLabel={txn.description}
              className={`min-h-[44px] flex-row items-center gap-3 py-3 ${
                index > 0 ? 'border-t border-divider-light dark:border-divider-dark' : ''
              }`}
            >
              <Text
                className="w-12 font-heeboMedium text-meta text-inkMuted-light dark:text-inkMuted-dark"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {formatDateDisplay(txn.txn_date).slice(0, 5)}
              </Text>
              <Text className="flex-1 text-bodySm font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
                {txn.description}
              </Text>
              <Money agorot={Math.abs(txn.amount_agorot)} size="row" />
            </Pressable>
          ))}
        </View>
      )}

      <View className="h-4" />
    </Screen>
  )
}
