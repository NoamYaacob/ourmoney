import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useArchiveAccount } from '@/features/accounts/hooks/useArchiveAccount'
import { useDeleteAccount } from '@/features/accounts/hooks/useDeleteAccount'
import { mapAccountDeleteError } from '@/features/accounts/lib/mapAccountError'
import { formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'

export default function AccountDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const archiveAccount = useArchiveAccount(householdId)
  const deleteAccount = useDeleteAccount(householdId)

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const account = accounts.find((a) => a.id === id)

  // Folds in isHouseholdLoading — without it, a brief household-loading
  // window would fall straight through to the "account not found" state
  // below instead of showing a spinner (mobile-expo-reviewer finding).
  if (isHouseholdLoading || isAccountsLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!account) {
    return (
      <Screen center>
        <ErrorMessage message={t('accounts.errors.notFound')} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Text className="mb-2 text-2xl font-bold text-ink-light dark:text-ink-dark">{account.name}</Text>
      <Text className="mb-6 text-lg text-inkMuted-light dark:text-inkMuted-dark">
        {formatILS(account.balance_agorot)}
      </Text>

      <Button
        title={account.is_active ? t('accounts.detail.archive') : t('accounts.detail.archived')}
        variant="secondary"
        disabled={!account.is_active}
        loading={archiveAccount.isPending}
        onPress={() => archiveAccount.mutate(account.id)}
      />

      <View className="mt-3">
        <Button title={t('accounts.detail.delete')} variant="ghost" onPress={() => setConfirmDeleteVisible(true)} />
      </View>

      {deleteError && <ErrorMessage message={t(deleteError)} />}

      <Modal
        visible={confirmDeleteVisible}
        title={t('accounts.detail.deleteConfirmTitle')}
        message={t('accounts.detail.deleteConfirmMessage')}
        confirmLabel={t('accounts.detail.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deleteAccount.isPending}
        onCancel={() => setConfirmDeleteVisible(false)}
        onConfirm={() =>
          deleteAccount.mutate(account.id, {
            onSuccess: () => {
              setConfirmDeleteVisible(false)
              router.back()
            },
            onError: (error) => {
              setConfirmDeleteVisible(false)
              setDeleteError(mapAccountDeleteError(error))
            },
          })
        }
      />
    </Screen>
  )
}
