// Reached via the Transactions tab's FAB, not a tab itself
// (docs/ARCHITECTURE.md). Cash spending is exactly as easy to log as card
// spending (ADR-026) — there is no separate "cash entry" path, `accounts`
// just has a `type: 'cash'` account like any other.
//
// Date is not user-editable in M6: PROJECT_SPEC.md only requires "defaults
// to today," with no explicit requirement for arbitrary-date entry, and no
// date-picker dependency is installed in this project yet — adding one is a
// scope decision left for a future milestone rather than assumed here.

import { useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useHouseholdMembers } from '@/features/household/hooks/useHouseholdMembers'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useCreateTransaction } from '@/features/transactions/hooks/useCreateTransaction'
import { signedAmountAgorot } from '@/features/transactions/lib/transactionSign'
import { agorotFromILS } from '@/lib/money/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function NewTransaction() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { members } = useHouseholdMembers(householdId)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const createTransaction = useCreateTransaction(householdId)

  // accountId/payerId are "overrides": null means "no explicit user choice
  // yet, fall back to the sensible default computed at render time" (the
  // first account, the current user) — avoids a setState-in-effect just to
  // seed a default once data loads.
  const [accountIdOverride, setAccountIdOverride] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [isIncome, setIsIncome] = useState(false)
  const [amountText, setAmountText] = useState('')
  const [description, setDescription] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [isShared, setIsShared] = useState(true)
  const [payerIdOverride, setPayerIdOverride] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const accountId = accountIdOverride ?? accounts[0]?.id ?? null
  const payerId = payerIdOverride ?? user?.id ?? null

  function handleCategoryChange(nextCategoryId: string) {
    setCategoryId(nextCategoryId)
    const category = categories.find((c) => c.id === nextCategoryId)
    if (category) setIsIncome(category.is_income)
  }

  function handleSubmit() {
    if (createTransaction.isPending) return
    setValidationError(null)

    if (!householdId || !accountId) {
      setValidationError(t('transactions.form.errors.missingAccount'))
      return
    }
    if (!description.trim()) {
      setValidationError(t('transactions.form.errors.missingDescription'))
      return
    }

    const parsed = agorotFromILS(amountText)
    if (!parsed.ok || parsed.agorot === null) {
      setValidationError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }

    createTransaction.mutate(
      {
        householdId,
        accountId,
        categoryId,
        amountAgorot: signedAmountAgorot(parsed.agorot, isIncome),
        description: description.trim(),
        merchantName: merchantName.trim() || null,
        txnDate: localDateString(),
        isShared,
        payerId,
      },
      { onSuccess: () => router.back() }
    )
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name_he}` }))
  const payerOptions = members.map((m) => ({ value: m.userId, label: m.displayName }))

  return (
    <Screen keyboardAvoiding>
      <Text className="mb-6 text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('transactions.form.title')}
      </Text>

      {isHouseholdLoading || isAccountsLoading || isCategoriesLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <View className="mb-4 flex-row gap-2">
            <Chip label={t('transactions.form.expense')} selected={!isIncome} onPress={() => setIsIncome(false)} />
            <Chip label={t('transactions.form.income')} selected={isIncome} onPress={() => setIsIncome(true)} />
          </View>

          <Input
            label={t('transactions.form.amountLabel')}
            value={amountText}
            onChangeText={setAmountText}
            placeholder={t('transactions.form.amountPlaceholder')}
            keyboardType="decimal-pad"
          />

          <Input
            label={t('transactions.form.descriptionLabel')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('transactions.form.descriptionPlaceholder')}
          />

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
            onChange={setAccountIdOverride}
            placeholder={t('transactions.form.accountPlaceholder')}
          />

          <Select
            label={t('transactions.form.categoryLabel')}
            options={categoryOptions}
            value={categoryId}
            onChange={handleCategoryChange}
            placeholder={t('transactions.form.categoryPlaceholder')}
          />

          <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
            {t('transactions.form.sharedLabel')}
          </Text>
          <View className="mb-1 flex-row gap-2">
            <Chip label={t('transactions.form.shared')} selected={isShared} onPress={() => setIsShared(true)} />
            <Chip label={t('transactions.form.personal')} selected={!isShared} onPress={() => setIsShared(false)} />
          </View>
          <Text className="mb-4 text-xs text-inkMuted-light dark:text-inkMuted-dark">
            {t('transactions.form.sharedHint')}
          </Text>

          {payerOptions.length > 1 && (
            <Select
              label={t('transactions.form.payerLabel')}
              options={payerOptions}
              value={payerId}
              onChange={setPayerIdOverride}
              placeholder={t('transactions.form.payerPlaceholder')}
            />
          )}

          {(validationError || createTransaction.isError) && (
            <ErrorMessage message={validationError ?? t('transactions.form.errors.generic')} />
          )}

          <View className="mt-2">
            <Button
              title={t('transactions.form.submit')}
              onPress={handleSubmit}
              loading={createTransaction.isPending}
            />
          </View>
        </>
      )}
    </Screen>
  )
}
