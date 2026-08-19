import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { useArchiveAccount } from '@/features/accounts/hooks/useArchiveAccount'
import { useDeleteAccount } from '@/features/accounts/hooks/useDeleteAccount'
import { useUpdateAccount } from '@/features/accounts/hooks/useUpdateAccount'
import { mapAccountDeleteError } from '@/features/accounts/lib/mapAccountError'
import { formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import type { AccountType } from '@/types/app'

const ACCOUNT_TYPE_OPTIONS: AccountType[] = ['checking', 'savings', 'credit_card', 'cash', 'investment', 'other']

export default function AccountDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, role, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { balances, isLoading: isBalancesLoading } = useAccountBalances(householdId)
  const archiveAccount = useArchiveAccount(householdId)
  const deleteAccount = useDeleteAccount(householdId)
  const updateAccount = useUpdateAccount(householdId)

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmArchiveVisible, setConfirmArchiveVisible] = useState(false)

  const account = accounts.find((a) => a.id === id)

  // Prefill the edit form once, when this account's data first loads —
  // adjusted during rendering (React's documented pattern for this, not a
  // useEffect) via a loaded-id guard, so it re-syncs only if the route's id
  // itself changes, never on every render. Mirrors
  // app/(app)/transactions/[id].tsx's identical pattern.
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('cash')
  if (account && account.id !== loadedAccountId) {
    setLoadedAccountId(account.id)
    setName(account.name)
    setType(account.type as AccountType)
  }

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

  function handleSave() {
    if (!account || !name.trim() || updateAccount.isPending) return
    updateAccount.mutate({ id: account.id, name: name.trim(), type })
  }

  return (
    <Screen keyboardAvoiding width="form">
      <Text className="mb-2 text-2xl font-bold text-ink-light dark:text-ink-dark">{t('accounts.detail.title')}</Text>
      {/* account.balance_agorot is a dead column nothing ever updates
          (features/accounts/lib/computeAccountBalances.ts's header) — the
          balance shown here is computed live from transactions instead.
          Blank while it loads rather than flashing ₪0 as if that were a
          real computed answer. */}
      <Text className="mb-6 text-lg text-inkMuted-light dark:text-inkMuted-dark">
        {isBalancesLoading ? '' : formatILS(balances[account.id] ?? 0)}
      </Text>

      <Input label={t('accounts.form.nameLabel')} value={name} onChangeText={setName} />
      <Select
        label={t('accounts.form.typeLabel')}
        options={ACCOUNT_TYPE_OPTIONS.map((value) => ({ value, label: t(`accounts.types.${value}`) }))}
        value={type}
        onChange={(value) => setType(value as AccountType)}
        placeholder={t('accounts.form.typeLabel')}
      />
      {updateAccount.isError && <ErrorMessage message={t('accounts.errors.generic')} />}
      <View className="mb-3">
        <Button title={t('accounts.detail.save')} onPress={handleSave} loading={updateAccount.isPending} />
      </View>

      <Button
        title={account.is_active ? t('accounts.detail.archive') : t('accounts.detail.archived')}
        variant="secondary"
        disabled={!account.is_active}
        loading={archiveAccount.isPending}
        onPress={() => setConfirmArchiveVisible(true)}
      />

      {/* accounts_delete RLS (is_household_admin(household_id)) is the real
          gate — a non-admin's delete call is always rejected server-side.
          This mirrors Settings' existing admin-gating pattern (rename
          household, remove member): hiding a control the backend would
          reject anyway, rather than letting a non-admin discover the
          rejection through a failed destructive action. */}
      {role === 'admin' && (
        <View className="mt-3">
          <Button title={t('accounts.detail.delete')} variant="ghost" onPress={() => setConfirmDeleteVisible(true)} />
        </View>
      )}

      {deleteError && <ErrorMessage message={t(deleteError)} />}

      <Modal
        visible={confirmArchiveVisible}
        title={t('accounts.detail.archiveConfirmTitle')}
        message={t('accounts.detail.archiveConfirmMessage')}
        confirmLabel={t('accounts.detail.archive')}
        cancelLabel={t('common.cancel')}
        loading={archiveAccount.isPending}
        onCancel={() => setConfirmArchiveVisible(false)}
        onConfirm={() =>
          archiveAccount.mutate(account.id, {
            onSuccess: () => setConfirmArchiveVisible(false),
            onError: () => setConfirmArchiveVisible(false),
          })
        }
      />

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
