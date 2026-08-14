// One screen for M6 (D4) — monthly overview, per-category allocation
// editor, and the uncategorized-transactions queue. Category rules live in
// settings/categories.tsx alongside category management itself.
//
// Design Phase 3: visual language brought in line with Dashboard/Add
// Transaction (Phase 1/2) — MonthNavigator instead of a hand-rolled prev/
// next row, a hero summary card, CategoryIcon instead of raw emoji, one
// enclosing Card per list (Divider-separated rows) instead of one bordered
// Card per row. Every hook call, mutation payload, and state-clearing
// behavior below is unchanged from Phase 1 — this is presentation only.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useBudgetProgress } from '@/features/budgets/hooks/useBudgetProgress'
import { useSaveBudgetAllocations } from '@/features/budgets/hooks/useSaveBudgetAllocations'
import { useUncategorizedTransactions } from '@/features/budgets/hooks/useUncategorizedTransactions'
import { MonthNavigator } from '@/features/budgets/components/MonthNavigator'
import { usePeriodStore } from '@/store/periodStore'
import { formatILS, agorotFromILS } from '@/lib/money/format'
import { spentPercent } from '@/lib/money/arithmetic'
import { categoryIconName } from '@/features/categories/lib/categoryIcon'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { colors } from '@/constants/colors'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { useUpdateTransaction } from '@/features/transactions/hooks/useUpdateTransaction'

export default function Budgets() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { colorScheme: scheme } = useColorScheme()
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { categories } = useCategories(householdId)
  const periodStart = usePeriodStore((s) => s.selectedPeriodStart)
  const setPeriodStart = usePeriodStore((s) => s.setSelectedPeriodStart)
  const {
    categories: progress,
    totalAllocatedAgorot,
    totalSpentAgorot,
    isLoading: isProgressLoading,
    error,
    refetch: refetchProgress,
  } = useBudgetProgress(householdId, periodStart)
  // Folds in isHouseholdLoading (mobile-expo-reviewer finding — see
  // dashboard/index.tsx's identical comment for why this matters).
  const isLoading = isHouseholdLoading || isProgressLoading
  const saveAllocations = useSaveBudgetAllocations(householdId)
  const {
    uncategorized,
    isLoading: isUncategorizedLoading,
    error: uncategorizedError,
  } = useUncategorizedTransactions(householdId)
  const updateTransaction = useUpdateTransaction(householdId)

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingAmount, setEditingAmount] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPreparingSave, setIsPreparingSave] = useState(false)
  const [assigningTxnId, setAssigningTxnId] = useState<string | null>(null)
  const [assignCategoryId, setAssignCategoryId] = useState<string | null>(null)

  // The edit form is keyed off editingCategoryId matching a category from
  // THIS month's `progress` list. Navigating the month without clearing it
  // (e.g. via the prev/next buttons below) leaves a stale id that matches
  // nothing in the new month's list — the edit form silently vanishes, but
  // the "add category" Select stays hidden too (it's gated on
  // editingCategoryId === null), leaving the user unable to add or edit any
  // allocation until they save or happen to tap a same-id category. Clearing
  // both whenever the displayed month changes closes that gap.
  function handleMonthChange(nextPeriodStart: string) {
    setPeriodStart(nextPeriodStart)
    setEditingCategoryId(null)
    setEditingAmount('')
  }

  // save_budget_allocations() uses true-replace semantics (D3): the payload
  // IS the full desired set for the month, and anything omitted from it
  // gets deleted server-side. Building that payload from `progress` (a
  // cache that can be stale — this app has no Realtime channel on
  // budget_allocations, only on transactions) risks silently deleting a
  // partner's concurrent allocation on a different device
  // (qa-adversarial-reviewer finding: household A adds Food while B's
  // stale screen still only shows Rent, B then saves Transport, and B's
  // save wipes A's Food because it wasn't in B's payload). Refetching
  // immediately before building the payload substantially narrows this
  // window — it does not close it entirely (a true simultaneous save from
  // both devices within the same round trip is still possible, and is not
  // solved without either optimistic-concurrency versioning or a Realtime
  // channel on budget_allocations, neither of which is in this milestone's
  // approved scope) — accepted and documented the same way D5 accepts the
  // concurrent-partner notification race, not silently.
  async function handleSaveAllocation(categoryId: string) {
    const parsed = agorotFromILS(editingAmount)
    if (!parsed.ok || parsed.agorot === null) {
      setSaveError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }

    setIsPreparingSave(true)
    const { data: freshData } = await refetchProgress()
    setIsPreparingSave(false)
    const freshCategories = freshData?.categories ?? progress

    const nextAllocations = freshCategories
      .filter((c) => c.categoryId !== categoryId)
      .map((c) => ({ categoryId: c.categoryId, amountAgorot: c.allocatedAgorot }))
    nextAllocations.push({ categoryId, amountAgorot: parsed.agorot })

    saveAllocations.mutate(
      { periodStart, allocations: nextAllocations },
      {
        onSuccess: () => {
          setEditingCategoryId(null)
          setEditingAmount('')
          setSaveError(null)
        },
        onError: () => setSaveError(t('budgets.errors.generic')),
      }
    )
  }

  const overallPercent = spentPercent(totalSpentAgorot, totalAllocatedAgorot)
  const isOverBudget = totalAllocatedAgorot > 0 && totalSpentAgorot > totalAllocatedAgorot
  const addableCategories = categories.filter((c) => !progress.some((p) => p.categoryId === c.id))

  return (
    <Screen width="wide">
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark">{t('budgets.title')}</Text>

      <MonthNavigator periodStart={periodStart} onChange={handleMonthChange} />

      {error ? (
        <ErrorMessage message={t('budgets.errors.generic')} />
      ) : isLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          {/* Overview — same visual language as Dashboard's hero (Card +
              hero figure + progress + two-stat row), but the hero figure
              here is the planned budget itself, not "remaining": this
              screen's job is reviewing/setting the plan, not just
              monitoring it, so the two screens read as related, not
              identical. */}
          <Card>
            <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('budgets.totalAllocated')}
            </Text>
            <Text className="mt-1 text-display font-bold text-ink-light dark:text-ink-dark">
              {formatILS(totalAllocatedAgorot)}
            </Text>

            {overallPercent !== null && (
              <>
                <View className="mt-4">
                  <ProgressBar percent={overallPercent} overBudget={isOverBudget} />
                </View>
                <Text className="mt-2 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                  {t('dashboard.percentUsed', { percent: overallPercent })}
                </Text>
              </>
            )}

            <View className="mt-4 flex-row items-center">
              <View className="flex-1">
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.spent')}</Text>
                <Text className="mt-0.5 text-heading font-semibold text-ink-light dark:text-ink-dark">
                  {formatILS(totalSpentAgorot)}
                </Text>
              </View>
              <View className="mx-4 h-8 w-px bg-border-light dark:bg-border-dark" />
              <View className="flex-1">
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('budgets.remaining')}</Text>
                <Text
                  className={`mt-0.5 text-heading font-semibold ${
                    isOverBudget ? 'text-danger-light dark:text-danger-dark' : 'text-ink-light dark:text-ink-dark'
                  }`}
                >
                  {formatILS(totalAllocatedAgorot - totalSpentAgorot)}
                </Text>
              </View>
            </View>
          </Card>

          {/* Desktop polish pass: a subtle divider groups the hero away
              from the grid below it, matching Dashboard's identical
              treatment — desktop-only, mobile/tablet spacing untouched. */}
          <View className="hidden web:desktop:mb-1 web:desktop:mt-6 web:desktop:flex">
            <Divider />
          </View>

          {/* Responsive/desktop pass: category budgets and the uncategorized
              queue sit side by side at desktop
              (`web:desktop:flex-row-reverse` — see _layout.tsx's
              DesktopSideRail comment for why `-reverse` is needed on web).
              Reversing keeps source/DOM order as [categories,
              uncategorized] while visually placing categories (primary) on
              the right and uncategorized (secondary) on the left — the
              correct RTL reading order. Mobile/tablet stay stacked in the
              original order (plain View column default). */}
          <View className="web:desktop:flex-row-reverse web:desktop:items-start web:desktop:gap-6">
          <View className="web:desktop:flex-1">
          {/* Per-category allocation editor + progress */}
          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('budgets.categoriesTitle')}
          </Text>
          {progress.length === 0 ? (
            <EmptyState iconName="pie-chart-outline" message={t('budgets.noCategories')} compact />
          ) : (
            <Card>
              {progress.map((category, index) => {
                const categoryOverBudget = category.remainingAgorot < 0
                return (
                  <View key={category.categoryId}>
                    {index > 0 && (
                      <View className="my-3">
                        <Divider />
                      </View>
                    )}
                    <Pressable
                      onPress={() => {
                        setEditingCategoryId(category.categoryId)
                        setEditingAmount(String(category.allocatedAgorot / 100))
                      }}
                      accessibilityRole="button"
                      className="flex-row items-start gap-3"
                    >
                      <CategoryIcon icon={category.categoryIcon} size="sm" />
                      <View className="flex-1">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-body text-ink-light dark:text-ink-dark">{category.categoryNameHe}</Text>
                          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                            {formatILS(category.spentAgorot)} / {formatILS(category.allocatedAgorot)}
                          </Text>
                        </View>
                        <View className="mt-1.5">
                          <ProgressBar percent={category.percentSpent} overBudget={categoryOverBudget} />
                        </View>
                        <Text
                          className={`mt-1 text-caption ${
                            categoryOverBudget
                              ? 'text-danger-light dark:text-danger-dark'
                              : 'text-positive-light dark:text-positive-dark'
                          }`}
                        >
                          {categoryOverBudget
                            ? t('dashboard.categoryExceeded', { amount: formatILS(Math.abs(category.remainingAgorot)) })
                            : t('dashboard.categoryRemaining', { amount: formatILS(category.remainingAgorot) })}
                        </Text>
                      </View>
                    </Pressable>
                    {editingCategoryId === category.categoryId && (
                      <View className="mt-3 ps-11">
                        <Input
                          label={t('budgets.allocationLabel')}
                          value={editingAmount}
                          onChangeText={setEditingAmount}
                          keyboardType="decimal-pad"
                        />
                        {saveError && <ErrorMessage message={saveError} />}
                        <Button
                          title={t('budgets.saveAllocation')}
                          loading={isPreparingSave || saveAllocations.isPending}
                          onPress={() => {
                            if (isPreparingSave || saveAllocations.isPending) return
                            void handleSaveAllocation(category.categoryId)
                          }}
                        />
                      </View>
                    )}
                  </View>
                )
              })}
            </Card>
          )}

          {editingCategoryId === null && addableCategories.length > 0 && (
            // Desktop polish pass: tightened from mt-3 to feel like part of
            // the same category-budgets area above it, rather than an
            // isolated control — mobile/tablet keep the original mt-3 gap.
            <View className="mt-3 web:desktop:mt-2">
              <Card>
                <Select
                  variant="row"
                  label={t('budgets.addCategoryLabel')}
                  options={addableCategories.map((c) => ({
                    value: c.id,
                    label: c.name_he,
                    iconName: categoryIconName(c.icon),
                  }))}
                  value={null}
                  onChange={(value) => {
                    setEditingCategoryId(value)
                    setEditingAmount('')
                  }}
                  placeholder={t('budgets.addCategoryPlaceholder')}
                  sheetTitle={t('budgets.addCategoryLabel')}
                  leadingIcon={
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                      <Ionicons name="add-circle-outline" size={18} color={accentColor} />
                    </View>
                  }
                />
              </Card>
            </View>
          )}
          </View>

          <View className="web:desktop:flex-1">
          {/* Uncategorized transactions queue */}
          <Text className="mb-2 mt-8 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('budgets.uncategorizedTitle')}
          </Text>
          {uncategorizedError ? (
            <ErrorMessage message={t('budgets.errors.generic')} />
          ) : isUncategorizedLoading ? (
            <SkeletonList rows={3} />
          ) : uncategorized.length === 0 ? (
            <EmptyState iconName="checkmark-done-outline" message={t('budgets.uncategorizedEmpty')} compact />
          ) : (
            <Card>
              {uncategorized.map((txn, index) => (
                <View key={txn.id}>
                  {index > 0 && (
                    <View className="my-3">
                      <Divider />
                    </View>
                  )}
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                      {txn.description}
                    </Text>
                    <Text className="text-body text-inkMuted-light dark:text-inkMuted-dark">
                      {formatILS(txn.amount_agorot)}
                    </Text>
                  </View>
                  {assigningTxnId === txn.id ? (
                    <View className="mt-2">
                      <Select
                        variant="row"
                        label={t('budgets.assignCategoryLabel')}
                        options={categories.map((c) => ({
                          value: c.id,
                          label: c.name_he,
                          iconName: categoryIconName(c.icon),
                        }))}
                        value={assignCategoryId}
                        onChange={setAssignCategoryId}
                        placeholder={t('budgets.assignCategoryLabel')}
                        sheetTitle={t('budgets.assignCategoryLabel')}
                        leadingIcon={
                          <CategoryIcon
                            icon={categories.find((c) => c.id === assignCategoryId)?.icon}
                            size="sm"
                          />
                        }
                      />
                      <View className="mt-2">
                        <Button
                          title={t('budgets.assignCategorySubmit')}
                          loading={updateTransaction.isPending}
                          onPress={() => {
                            if (!assignCategoryId || !householdId) return
                            updateTransaction.mutate(
                              { id: txn.id, householdId, categoryId: assignCategoryId },
                              {
                                onSuccess: () => {
                                  setAssigningTxnId(null)
                                  setAssignCategoryId(null)
                                },
                              }
                            )
                          }}
                        />
                      </View>
                    </View>
                  ) : (
                    <Pressable onPress={() => setAssigningTxnId(txn.id)} accessibilityRole="button">
                      <Text className="mt-2 text-caption font-medium text-accent-light dark:text-accent-dark">
                        {t('budgets.assignCategoryButton')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </Card>
          )}
          </View>
          </View>
        </>
      )}
    </Screen>
  )
}
