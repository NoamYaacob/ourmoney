// Transfer detail/edit screen (migration 008, ADR-035). Reached from a
// transaction list row whose transfer_id is set, or via
// transactions/[id].tsx's redirect for a leg opened directly — never the
// other way around, since a transfer leg is never editable through the
// generic transaction detail screen (RLS forces this: transactions_update's
// USING clause excludes transfer_id IS NOT NULL rows entirely). Shows both
// sides of the transfer together and edits/deletes them atomically via
// update_transfer()/delete_transfer() — there is no "edit just one side"
// affordance anywhere in this screen, by design.

import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useTransfer } from '@/features/transactions/hooks/useTransfer'
import { useUpdateTransfer } from '@/features/transactions/hooks/useUpdateTransfer'
import { useDeleteTransfer } from '@/features/transactions/hooks/useDeleteTransfer'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { accountIconName } from '@/features/accounts/lib/accountIcon'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

export default function TransferDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, role, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts } = useAccounts(householdId)
  const { transfer, isLoading } = useTransfer(id)
  const updateTransfer = useUpdateTransfer(householdId)
  const deleteTransfer = useDeleteTransfer(householdId)
  const { colorScheme: scheme } = useColorScheme()
  const mutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  const [fromAccountIdOverride, setFromAccountIdOverride] = useState<string | null>(null)
  const [toAccountIdOverride, setToAccountIdOverride] = useState<string | null>(null)
  const [amountText, setAmountText] = useState('')
  const [description, setDescription] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)

  // Prefill once, when this transfer's data first loads — same
  // adjust-during-rendering guard pattern as transactions/[id].tsx and
  // accounts/[id].tsx's loadedId guards.
  const [loadedTransferId, setLoadedTransferId] = useState<string | null>(null)
  if (transfer && transfer.id !== loadedTransferId) {
    setLoadedTransferId(transfer.id)
    setFromAccountIdOverride(transfer.from_account_id)
    setToAccountIdOverride(transfer.to_account_id)
    setAmountText(String(transfer.amount_agorot / 100))
    setDescription(transfer.description)
  }

  const fromAccountId = fromAccountIdOverride ?? transfer?.from_account_id ?? null
  const toAccountId = toAccountIdOverride ?? transfer?.to_account_id ?? null
  const selectedFromAccount = accounts.find((a) => a.id === fromAccountId)
  const selectedToAccount = accounts.find((a) => a.id === toAccountId)

  if (isLoading || isHouseholdLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!transfer) {
    return (
      <Screen center>
        <ErrorMessage message={t('transfers.errors.notFound')} />
      </Screen>
    )
  }

  function handleSave() {
    if (updateTransfer.isPending || !transfer || !householdId) return
    setValidationError(null)

    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      setValidationError(t('transfers.errors.sameAccount'))
      return
    }
    if (!description.trim()) {
      setValidationError(t('transfers.errors.missingDescription'))
      return
    }

    const parsed = agorotFromILS(amountText)
    if (!parsed.ok || parsed.agorot === null) {
      setValidationError(t(`transfers.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }

    updateTransfer.mutate(
      {
        transferId: transfer.id,
        householdId,
        fromAccountId,
        toAccountId,
        amountAgorot: parsed.agorot,
        txnDate: transfer.txn_date,
        description: description.trim(),
      },
      { onSuccess: () => router.back() }
    )
  }

  // delete_transfer() is admin-only server-side (matches
  // useDeleteTransaction.ts's admin-gated hard delete) — hiding the button
  // for a non-admin avoids offering an action the RPC would always reject.
  const canDelete = role === 'admin'

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

  return (
    <Screen keyboardAvoiding width="form">
      <View className="mb-6 flex-row items-center gap-2">
        <Ionicons name="swap-horizontal" size={22} color={mutedColor} />
        <Text className="text-2xl font-bold text-ink-light dark:text-ink-dark">{t('transfers.detail.title')}</Text>
      </View>

      <Select
        variant="row"
        label={t('transfers.detail.fromLabel')}
        options={accountOptions}
        value={fromAccountId}
        onChange={setFromAccountIdOverride}
        placeholder={t('transactions.form.fromAccountPlaceholder')}
        sheetTitle={t('transfers.detail.fromLabel')}
        leadingIcon={
          <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
            <Ionicons name={accountIconName(selectedFromAccount?.type)} size={17} color={mutedColor} />
          </View>
        }
      />
      <Select
        variant="row"
        label={t('transfers.detail.toLabel')}
        options={accountOptions}
        value={toAccountId}
        onChange={setToAccountIdOverride}
        placeholder={t('transactions.form.toAccountPlaceholder')}
        sheetTitle={t('transfers.detail.toLabel')}
        leadingIcon={
          <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
            <Ionicons name={accountIconName(selectedToAccount?.type)} size={17} color={mutedColor} />
          </View>
        }
      />

      <Input
        label={t('transfers.detail.amountLabel')}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
      />
      <Input
        label={t('transfers.detail.descriptionLabel')}
        value={description}
        onChangeText={setDescription}
      />

      {(validationError || updateTransfer.isError) && (
        <ErrorMessage message={validationError ?? t('transfers.errors.generic')} />
      )}

      <View className="mt-2">
        <Button title={t('transfers.detail.save')} onPress={handleSave} loading={updateTransfer.isPending} />
      </View>

      {canDelete && (
        <View className="mt-3">
          <Button
            title={t('transfers.detail.delete')}
            variant="ghost"
            onPress={() => setConfirmDeleteVisible(true)}
          />
        </View>
      )}

      {deleteTransfer.isError && <ErrorMessage message={t('transfers.detail.deleteError')} />}

      <Text className="mt-4 text-xs text-inkMuted-light dark:text-inkMuted-dark">
        {formatILS(transfer.amount_agorot)}
      </Text>

      {canDelete && (
        <Modal
          visible={confirmDeleteVisible}
          title={t('transfers.detail.deleteConfirmTitle')}
          message={t('transfers.detail.deleteConfirmMessage')}
          confirmLabel={t('transfers.detail.delete')}
          cancelLabel={t('common.cancel')}
          destructive
          loading={deleteTransfer.isPending}
          onCancel={() => setConfirmDeleteVisible(false)}
          onConfirm={() =>
            deleteTransfer.mutate(transfer.id, {
              onSuccess: () => {
                setConfirmDeleteVisible(false)
                router.back()
              },
            })
          }
        />
      )}
    </Screen>
  )
}
