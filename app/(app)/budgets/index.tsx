// One screen for M6 (D4) — monthly overview, per-category allocation
// editor, and the uncategorized-transactions queue. Category rules live in
// settings/categories.tsx alongside category management itself.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useBudgetProgress } from '@/features/budgets/hooks/useBudgetProgress'
import { useSaveBudgetAllocations } from '@/features/budgets/hooks/useSaveBudgetAllocations'
import { useUncategorizedTransactions } from '@/features/budgets/hooks/useUncategorizedTransactions'
import { shiftMonth } from '@/features/budgets/lib/budgetPeriod'
import { usePeriodStore } from '@/store/periodStore'
import { formatILS, agorotFromILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useUpdateTransaction } from '@/features/transactions/hooks/useUpdateTransaction'

export default function Budgets() {
  const { t } = useTranslation()
  const { user } = useAuth()
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
  const { uncategorized, isLoading: isUncategorizedLoading } = useUncategorizedTransactions(householdId)
  const updateTransaction = useUpdateTransaction(householdId)

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingAmount, setEditingAmount] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPreparingSave, setIsPreparingSave] = useState(false)
  const [assigningTxnId, setAssigningTxnId] = useState<string | null>(null)
  const [assignCategoryId, setAssignCategoryId] = useState<string | null>(null)

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

  return (
    <Screen>
      <Text className="mb-4 text-2xl font-bold text-ink-light dark:text-ink-dark">{t('budgets.title')}</Text>

      {/* Month navigation */}
      <View className="mb-4 flex-row items-center justify-between">
        <Pressable onPress={() => setPeriodStart(shiftMonth(periodStart, -1))} accessibilityRole="button">
          <Text className="text-base text-accent-light dark:text-accent-dark">{t('budgets.prevMonth')}</Text>
        </Pressable>
        <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">{periodStart.slice(0, 7)}</Text>
        <Pressable onPress={() => setPeriodStart(shiftMonth(periodStart, 1))} accessibilityRole="button">
          <Text className="text-base text-accent-light dark:text-accent-dark">{t('budgets.nextMonth')}</Text>
        </Pressable>
      </View>

      {error ? (
        <ErrorMessage message={t('budgets.errors.generic')} />
      ) : isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Overview */}
          <Card>
            <View className="flex-row justify-between">
              <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('budgets.totalAllocated')}</Text>
              <Text className="text-sm font-semibold text-ink-light dark:text-ink-dark">
                {formatILS(totalAllocatedAgorot)}
              </Text>
            </View>
            <View className="mt-1 flex-row justify-between">
              <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('budgets.totalSpent')}</Text>
              <Text className="text-sm font-semibold text-ink-light dark:text-ink-dark">{formatILS(totalSpentAgorot)}</Text>
            </View>
          </Card>

          {/* Per-category allocation editor + progress */}
          <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('budgets.categoriesTitle')}
          </Text>
          {progress.map((category, index) => (
            <View key={category.categoryId}>
              {index > 0 && (
                <View className="my-2">
                  <Divider />
                </View>
              )}
              <Pressable
                onPress={() => {
                  setEditingCategoryId(category.categoryId)
                  setEditingAmount(String(category.allocatedAgorot / 100))
                }}
                accessibilityRole="button"
              >
                <Card>
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="text-base text-ink-light dark:text-ink-dark">
                      {category.categoryIcon} {category.categoryNameHe}
                    </Text>
                    <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">
                      {formatILS(category.spentAgorot)} / {formatILS(category.allocatedAgorot)}
                    </Text>
                  </View>
                  <ProgressBar percent={category.percentSpent} />
                </Card>
              </Pressable>
              {editingCategoryId === category.categoryId && (
                <View className="mt-2">
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
          ))}

          {editingCategoryId === null && (
            <View className="mt-3">
              <Select
                label={t('budgets.addCategoryLabel')}
                options={categories
                  .filter((c) => !progress.some((p) => p.categoryId === c.id))
                  .map((c) => ({ value: c.id, label: `${c.icon} ${c.name_he}` }))}
                value={null}
                onChange={(value) => {
                  setEditingCategoryId(value)
                  setEditingAmount('')
                }}
                placeholder={t('budgets.addCategoryPlaceholder')}
              />
            </View>
          )}

          {/* Uncategorized transactions queue */}
          <Text className="mb-2 mt-8 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('budgets.uncategorizedTitle')}
          </Text>
          {isUncategorizedLoading ? (
            <LoadingSpinner />
          ) : uncategorized.length === 0 ? (
            <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('budgets.uncategorizedEmpty')}</Text>
          ) : (
            uncategorized.map((txn, index) => (
              <View key={txn.id}>
                {index > 0 && (
                  <View className="my-2">
                    <Divider />
                  </View>
                )}
                <Card>
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 text-sm text-ink-light dark:text-ink-dark">{txn.description}</Text>
                    <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">
                      {formatILS(txn.amount_agorot)}
                    </Text>
                  </View>
                  {assigningTxnId === txn.id ? (
                    <View className="mt-2">
                      <Select
                        label={t('budgets.assignCategoryLabel')}
                        options={categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name_he}` }))}
                        value={assignCategoryId}
                        onChange={setAssignCategoryId}
                        placeholder={t('budgets.assignCategoryLabel')}
                      />
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
                  ) : (
                    <Pressable onPress={() => setAssigningTxnId(txn.id)} accessibilityRole="button">
                      <Text className="mt-2 text-sm text-accent-light dark:text-accent-dark">
                        {t('budgets.assignCategoryButton')}
                      </Text>
                    </Pressable>
                  )}
                </Card>
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  )
}
