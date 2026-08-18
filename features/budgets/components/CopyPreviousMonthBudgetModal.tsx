// Review/confirm step for copying a previous month's budget allocations.
// Not built on top of components/ui/Modal.tsx — that component only
// supports a single plain-text message, and this step needs a scrollable
// per-category list (name + amount) plus conditional summary notes, so it
// is its own small component. It intentionally mirrors Modal.tsx's chrome
// (transparent/fade RNModal, DIALOG_WIDTH_CLASS, rounded surface card,
// reversed confirm/cancel button row) so it reads as the same dialog
// pattern used elsewhere in the app.

import { Modal as RNModal, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Divider } from '@/components/ui/Divider'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { formatILS } from '@/lib/money/format'
import { DIALOG_WIDTH_CLASS } from '@/constants/layout'
import type { CopyPreviousMonthBudgetPlan } from '@/features/budgets/lib/copyPreviousMonthBudget'

interface CategoryLookup {
  id: string
  name_he: string
  icon: string | null
}

interface CopyPreviousMonthBudgetModalProps {
  visible: boolean
  fromMonthLabel: string
  toMonthLabel: string
  plan: CopyPreviousMonthBudgetPlan
  categories: readonly CategoryLookup[]
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function CopyPreviousMonthBudgetModal({
  visible,
  fromMonthLabel,
  toMonthLabel,
  plan,
  categories,
  loading,
  onConfirm,
  onCancel,
}: CopyPreviousMonthBudgetModalProps) {
  const { t } = useTranslation()
  const nothingToCopy = plan.toCopy.length === 0

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={loading ? undefined : onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <View
          className={`w-full ${DIALOG_WIDTH_CLASS} max-h-[80%] rounded-xl bg-surface-light p-5 dark:bg-surface-dark`}
          accessibilityViewIsModal
        >
          <Text accessibilityRole="alert" className="mb-1 text-lg font-bold text-ink-light dark:text-ink-dark">
            {t('budgets.copyPrevious.title', { fromMonth: fromMonthLabel })}
          </Text>
          <Text className="mb-4 text-sm text-inkMuted-light dark:text-inkMuted-dark">
            {t('budgets.copyPrevious.subtitle', { fromMonth: fromMonthLabel, toMonth: toMonthLabel })}
          </Text>

          {nothingToCopy ? (
            <Text className="mb-4 text-sm text-ink-light dark:text-ink-dark">
              {t('budgets.copyPrevious.nothingToCopy')}
            </Text>
          ) : (
            <>
              <Text className="mb-2 text-caption font-medium text-inkMuted-light dark:text-inkMuted-dark">
                {t('budgets.copyPrevious.toCopyTitle')}
              </Text>
              <ScrollView className="mb-2 max-h-64">
                {plan.toCopy.map((allocation, index) => {
                  const category = categories.find((c) => c.id === allocation.categoryId)
                  return (
                    <View key={allocation.categoryId}>
                      {index > 0 && (
                        <View className="my-2">
                          <Divider />
                        </View>
                      )}
                      <View className="flex-row items-center justify-between gap-3">
                        <View className="flex-1 flex-row items-center gap-3">
                          <CategoryIcon icon={category?.icon} size="sm" />
                          <Text className="flex-1 text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                            {category?.name_he ?? allocation.categoryId}
                          </Text>
                        </View>
                        <Text className="text-body text-inkMuted-light dark:text-inkMuted-dark">
                          {formatILS(allocation.amountAgorot)}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </ScrollView>
            </>
          )}

          {plan.alreadyExistingCount > 0 && (
            <Text className="mb-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('budgets.copyPrevious.alreadyExisting', { count: plan.alreadyExistingCount, toMonth: toMonthLabel })}
            </Text>
          )}
          {plan.skippedDeletedCount > 0 && (
            <Text className="mb-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('budgets.copyPrevious.skippedDeleted', { count: plan.skippedDeletedCount })}
            </Text>
          )}

          <View className="mt-4 flex-row-reverse gap-2">
            {!nothingToCopy && (
              <Button
                title={t('budgets.copyPrevious.confirm')}
                onPress={onConfirm}
                loading={loading}
                variant="secondary"
                maxFontSizeMultiplier={1.5}
              />
            )}
            <Button
              title={t('common.cancel')}
              onPress={onCancel}
              variant="ghost"
              disabled={loading}
              maxFontSizeMultiplier={1.5}
            />
          </View>
        </View>
      </View>
    </RNModal>
  )
}
