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
import { Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useTransfer } from '@/features/transactions/hooks/useTransfer'
import { useUpdateTransfer } from '@/features/transactions/hooks/useUpdateTransfer'
import { useDeleteTransfer } from '@/features/transactions/hooks/useDeleteTransfer'
import { agorotFromILS } from '@/lib/money/format'
import { accountIconName } from '@/features/accounts/lib/accountIcon'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import { SurfacePanel } from '@/components/ui/SurfacePanel'
import { AmountField } from '@/features/transactions/components/AmountField'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'

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
  const dangerColor = scheme === 'dark' ? colors.dangerStrong.dark : colors.dangerStrong.light

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
      <Screen onBack={() => router.back()} center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!transfer) {
    return (
      <Screen onBack={() => router.back()} center>
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
    <Screen onBack={() => router.back()} keyboardAvoiding width="form">
      <View className="mb-6 flex-row items-center gap-2">
        <Ionicons name="swap-horizontal" size={ICON.hero} color={mutedColor} />
        <Text className="text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
          {t('transfers.detail.title')}
        </Text>
      </View>

      {/* Checkpoint 7: one panel, matching every sibling form's own desktop
          treatment — and, unlike those siblings, nothing nested inside it.
          `tier="tablet"` gives this the same considered chrome from 768px
          up rather than leaving it invisible until 1200 (the same fix
          already proven on Installments' cycle cards). */}
      <SurfacePanel tier="tablet">
        <AmountField
          label={t('transfers.detail.amountLabel')}
          value={amountText}
          onChangeText={setAmountText}
          placeholder={t('transfers.detail.amountPlaceholder')}
        />

        <View className="border-t border-divider-light dark:border-divider-dark">
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
                <Ionicons name={accountIconName(selectedFromAccount?.type)} size={ICON.row} color={mutedColor} />
              </View>
            }
          />
        </View>
        <View className="border-t border-divider-light dark:border-divider-dark">
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
                <Ionicons name={accountIconName(selectedToAccount?.type)} size={ICON.row} color={mutedColor} />
              </View>
            }
          />
        </View>

        <View className="mt-4">
          <Input
            label={t('transfers.detail.descriptionLabel')}
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {(validationError || updateTransfer.isError) && (
          <ErrorMessage message={validationError ?? t('transfers.errors.generic')} />
        )}

        {/* Save and delete on one row, matching transactions/[id].tsx's own
            asymmetric-weight convention: the primary action takes the
            width, deletion is a compact 52px icon beside it — not the same
            visual weight as saving. */}
        <View className="mt-3 flex-row items-stretch gap-2.5">
          <View className="flex-1">
            <Button title={t('transfers.detail.save')} onPress={handleSave} loading={updateTransfer.isPending} />
          </View>
          {canDelete && (
            <Pressable
              onPress={() => setConfirmDeleteVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('transfers.detail.delete')}
              className="h-[52px] w-[52px] items-center justify-center rounded-control border border-border-light bg-surfaceMuted-light active:opacity-70 dark:border-border-dark dark:bg-surfaceMuted-dark"
            >
              <Ionicons name="trash-outline" size={ICON.nav} color={dangerColor} />
            </Pressable>
          )}
        </View>

        {deleteTransfer.isError && <ErrorMessage message={t('transfers.detail.deleteError')} />}
      </SurfacePanel>

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
