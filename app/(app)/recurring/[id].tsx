import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useRecurringTransactions } from '@/features/recurring/hooks/useRecurringTransactions'
import { useUpdateRecurringTransaction } from '@/features/recurring/hooks/useUpdateRecurringTransaction'
import { useSkipRecurringOccurrence } from '@/features/recurring/hooks/useSkipRecurringOccurrence'
import { useDeleteRecurringTransaction } from '@/features/recurring/hooks/useDeleteRecurringTransaction'
import { formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'

export default function RecurringDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { recurringTransactions, isLoading: isRecurringLoading } = useRecurringTransactions(householdId)
  const updateRecurring = useUpdateRecurringTransaction(householdId)
  const skipOccurrence = useSkipRecurringOccurrence(householdId)
  const deleteRecurring = useDeleteRecurringTransaction(householdId)

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const item = recurringTransactions.find((r) => r.id === id)

  if (isHouseholdLoading || isRecurringLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!item) {
    return (
      <Screen center>
        <ErrorMessage message={t('recurring.errors.notFound')} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Text className="mb-2 text-2xl font-bold text-ink-light dark:text-ink-dark">{item.description}</Text>
      <Text className="mb-1 text-lg text-inkMuted-light dark:text-inkMuted-dark">
        {formatILS(item.amount_agorot)}
      </Text>
      <Text className="mb-6 text-sm text-inkMuted-light dark:text-inkMuted-dark">
        {t(`recurring.frequency.${item.frequency}`)} · {t('recurring.nextDue')} {item.next_due_date}
      </Text>

      <Button
        title={t('recurring.detail.skip')}
        variant="secondary"
        loading={skipOccurrence.isPending}
        onPress={() => {
          setActionError(null)
          skipOccurrence.mutate(item.id, { onError: () => setActionError(t('recurring.errors.generic')) })
        }}
      />

      <View className="mt-3">
        <Button
          title={item.is_active ? t('recurring.detail.pause') : t('recurring.detail.resume')}
          variant="secondary"
          loading={updateRecurring.isPending}
          onPress={() => {
            setActionError(null)
            updateRecurring.mutate(
              { id: item.id, isActive: !item.is_active },
              { onError: () => setActionError(t('recurring.errors.generic')) }
            )
          }}
        />
      </View>

      <View className="mt-3">
        <Button title={t('recurring.detail.delete')} variant="ghost" onPress={() => setConfirmDeleteVisible(true)} />
      </View>

      {actionError && <ErrorMessage message={actionError} />}

      <Modal
        visible={confirmDeleteVisible}
        title={t('recurring.detail.deleteConfirmTitle')}
        message={t('recurring.detail.deleteConfirmMessage')}
        confirmLabel={t('recurring.detail.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deleteRecurring.isPending}
        onCancel={() => setConfirmDeleteVisible(false)}
        onConfirm={() =>
          deleteRecurring.mutate(item.id, {
            onSuccess: () => {
              setConfirmDeleteVisible(false)
              router.back()
            },
            onError: () => {
              setConfirmDeleteVisible(false)
              setActionError(t('recurring.errors.generic'))
            },
          })
        }
      />
    </Screen>
  )
}
