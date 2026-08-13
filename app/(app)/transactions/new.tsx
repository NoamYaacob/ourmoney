// Reached via the Transactions tab's FAB, not a tab itself
// (docs/ARCHITECTURE.md). Cash spending is exactly as easy to log as card
// spending (ADR-026) — there is no separate "cash entry" path, `accounts`
// just has a `type: 'cash'` account like any other.
//
// Date is not user-editable in M6: PROJECT_SPEC.md only requires "defaults
// to today," with no explicit requirement for arbitrary-date entry, and no
// date-picker dependency is installed in this project yet — adding one is a
// scope decision left for a future milestone rather than assumed here.
//
// Design Phase 2: information hierarchy only — every field, every piece of
// validation, and the submit call are unchanged from Phase 1. Amount is now
// a dedicated hero entry (AmountField) instead of a plain labeled input;
// expense/income and personal/shared are SegmentedControls instead of Chip
// pairs; account/category use Select's 'row' variant with an icon instead
// of a boxed dropdown-style trigger with an emoji baked into the label.

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
import { accountIconName } from '@/features/accounts/lib/accountIcon'
import { categoryIconName } from '@/features/categories/lib/categoryIcon'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { AmountField } from '@/features/transactions/components/AmountField'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

export default function NewTransaction() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { members } = useHouseholdMembers(householdId)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const createTransaction = useCreateTransaction(householdId)
  const { colorScheme: scheme } = useColorScheme()
  const mutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

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
  const selectedAccount = accounts.find((a) => a.id === accountId)
  const selectedCategory = categories.find((c) => c.id === categoryId)

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

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name, iconName: accountIconName(a.type) }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_he, iconName: categoryIconName(c.icon) }))
  const payerOptions = members.map((m) => ({ value: m.userId, label: m.displayName }))

  return (
    <Screen keyboardAvoiding width="narrow">
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark">{t('transactions.form.title')}</Text>

      {isHouseholdLoading || isAccountsLoading || isCategoriesLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <View className="mb-5">
            <SegmentedControl
              accessibilityLabel={t('transactions.form.title')}
              options={[
                { value: 'expense', label: t('transactions.form.expense'), tint: 'ink' },
                { value: 'income', label: t('transactions.form.income'), tint: 'positive' },
              ]}
              value={isIncome ? 'income' : 'expense'}
              onChange={(v) => setIsIncome(v === 'income')}
            />
          </View>

          <AmountField
            label={t('transactions.form.amountLabel')}
            value={amountText}
            onChangeText={setAmountText}
            placeholder={t('transactions.form.amountPlaceholder')}
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

          <View className="mb-4 mt-2">
            <Card>
              <Select
                variant="row"
                label={t('transactions.form.accountLabel')}
                options={accountOptions}
                value={accountId}
                onChange={setAccountIdOverride}
                placeholder={t('transactions.form.accountPlaceholder')}
                sheetTitle={t('transactions.form.accountLabel')}
                leadingIcon={
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                    <Ionicons name={accountIconName(selectedAccount?.type)} size={17} color={mutedColor} />
                  </View>
                }
              />
              <Divider />
              <Select
                variant="row"
                label={t('transactions.form.categoryLabel')}
                options={categoryOptions}
                value={categoryId}
                onChange={handleCategoryChange}
                placeholder={t('transactions.form.categoryPlaceholder')}
                sheetTitle={t('transactions.form.categorySheetTitle')}
                leadingIcon={<CategoryIcon icon={selectedCategory?.icon} size="sm" />}
              />
            </Card>
          </View>

          <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
            {t('transactions.form.sharedLabel')}
          </Text>
          <SegmentedControl
            accessibilityLabel={t('transactions.form.sharedLabel')}
            options={[
              { value: 'shared', label: t('transactions.form.shared') },
              { value: 'personal', label: t('transactions.form.personal') },
            ]}
            value={isShared ? 'shared' : 'personal'}
            onChange={(v) => setIsShared(v === 'shared')}
          />
          <Text className="mb-4 mt-2 text-xs text-inkMuted-light dark:text-inkMuted-dark">
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

          <View className="mt-4">
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
