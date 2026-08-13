import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useTransaction } from '@/features/transactions/hooks/useTransaction'
import { useUpdateTransaction } from '@/features/transactions/hooks/useUpdateTransaction'
import { useExcludeTransaction } from '@/features/transactions/hooks/useExcludeTransaction'
import { useDeleteTransaction } from '@/features/transactions/hooks/useDeleteTransaction'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { signedAmountAgorot } from '@/features/transactions/lib/transactionSign'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'

export default function TransactionDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, role, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts } = useAccounts(householdId)
  const { categories } = useCategories(householdId)
  const { transaction, isLoading } = useTransaction(id)
  const updateTransaction = useUpdateTransaction(householdId)
  const excludeTransaction = useExcludeTransaction(householdId)
  const deleteTransaction = useDeleteTransaction(householdId)

  const [amountText, setAmountText] = useState('')
  const [isIncome, setIsIncome] = useState(false)
  const [description, setDescription] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [isShared, setIsShared] = useState(true)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)

  // Prefill the edit form once, when this transaction's data first loads —
  // adjusted during rendering (React's documented pattern for this, not a
  // useEffect) via a loaded-id guard, so it re-syncs only if the route's id
  // itself changes, never on every render.
  const [loadedTransactionId, setLoadedTransactionId] = useState<string | null>(null)
  if (transaction && transaction.id !== loadedTransactionId) {
    setLoadedTransactionId(transaction.id)
    setAmountText(String(Math.abs(transaction.amount_agorot) / 100))
    setIsIncome(transaction.amount_agorot > 0)
    setDescription(transaction.description)
    setMerchantName(transaction.merchant_name ?? '')
    setIsShared(transaction.is_shared)
    setCategoryId(transaction.category_id)
    setAccountId(transaction.account_id)
  }

  // Folds in isHouseholdLoading: accounts/categories used for the Select
  // pickers below are gated on householdId, so without this the pickers
  // would briefly render with zero options while useHousehold is still
  // resolving (mobile-expo-reviewer finding).
  if (isLoading || isHouseholdLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!transaction) {
    return (
      <Screen center>
        <ErrorMessage message={t('transactions.errors.notFound')} />
      </Screen>
    )
  }

  function handleSave() {
    if (updateTransaction.isPending || !transaction) return
    setValidationError(null)

    const parsed = agorotFromILS(amountText)
    if (!parsed.ok || parsed.agorot === null) {
      setValidationError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }
    if (!description.trim()) {
      setValidationError(t('transactions.form.errors.missingDescription'))
      return
    }

    updateTransaction.mutate(
      {
        id: transaction.id,
        householdId: transaction.household_id,
        accountId: accountId ?? transaction.account_id,
        categoryId,
        amountAgorot: signedAmountAgorot(parsed.agorot, isIncome),
        description: description.trim(),
        merchantName: merchantName.trim() || null,
        isShared,
      },
      { onSuccess: () => router.back() }
    )
  }

  // transactions_delete RLS restricts hard delete to household admins
  // (useDeleteTransaction.ts's own header comment) — hiding the button for
  // non-admins avoids offering an action that would always fail server-side.
  const canDelete = role === 'admin'

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name_he}` }))

  return (
    <Screen keyboardAvoiding>
      <Text className="mb-6 text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('transactions.detail.title')}
      </Text>

      <View className="mb-4 flex-row gap-2">
        <Chip label={t('transactions.form.expense')} selected={!isIncome} onPress={() => setIsIncome(false)} />
        <Chip label={t('transactions.form.income')} selected={isIncome} onPress={() => setIsIncome(true)} />
      </View>

      <Input label={t('transactions.form.amountLabel')} value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" />
      <Input label={t('transactions.form.descriptionLabel')} value={description} onChangeText={setDescription} />
      <Input
        label={t('transactions.form.merchantLabel')}
        value={merchantName}
        onChangeText={setMerchantName}
        placeholder={t('transactions.form.merchantPlaceholder')}
      />
      <Select
        label={t('transactions.form.accountLabel')}
        options={accountOptions}
        value={accountId}
        onChange={setAccountId}
        placeholder={t('transactions.form.accountPlaceholder')}
      />
      <Select
        label={t('transactions.form.categoryLabel')}
        options={categoryOptions}
        value={categoryId}
        onChange={setCategoryId}
        placeholder={t('transactions.form.categoryPlaceholder')}
      />

      <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
        {t('transactions.form.sharedLabel')}
      </Text>
      <View className="mb-4 flex-row gap-2">
        <Chip label={t('transactions.form.shared')} selected={isShared} onPress={() => setIsShared(true)} />
        <Chip label={t('transactions.form.personal')} selected={!isShared} onPress={() => setIsShared(false)} />
      </View>

      {(validationError || updateTransaction.isError) && (
        <ErrorMessage message={validationError ?? t('transactions.form.errors.generic')} />
      )}

      <View className="mt-2">
        <Button title={t('transactions.detail.save')} onPress={handleSave} loading={updateTransaction.isPending} />
      </View>

      <View className="mt-3">
        <Button
          title={
            transaction.is_excluded ? t('transactions.detail.include') : t('transactions.detail.exclude')
          }
          variant="secondary"
          loading={excludeTransaction.isPending}
          onPress={() =>
            excludeTransaction.mutate({ id: transaction.id, isExcluded: !transaction.is_excluded })
          }
        />
      </View>

      {canDelete && (
        <View className="mt-3">
          <Button
            title={t('transactions.detail.delete')}
            variant="ghost"
            onPress={() => setConfirmDeleteVisible(true)}
          />
        </View>
      )}

      {deleteTransaction.isError && <ErrorMessage message={t('transactions.detail.deleteError')} />}

      <Text className="mt-4 text-xs text-inkMuted-light dark:text-inkMuted-dark">
        {formatILS(transaction.amount_agorot)}
      </Text>

      {canDelete && (
        <Modal
          visible={confirmDeleteVisible}
          title={t('transactions.detail.deleteConfirmTitle')}
          message={t('transactions.detail.deleteConfirmMessage')}
          confirmLabel={t('transactions.detail.delete')}
          cancelLabel={t('common.cancel')}
          destructive
          loading={deleteTransaction.isPending}
          onCancel={() => setConfirmDeleteVisible(false)}
          onConfirm={() =>
            deleteTransaction.mutate(transaction.id, {
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
