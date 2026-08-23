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
import { useCreateTransfer } from '@/features/transactions/hooks/useCreateTransfer'
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
import { DESKTOP_PANEL_CLASS } from '@/constants/layout'

export default function NewTransaction() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { members } = useHouseholdMembers(householdId)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const createTransaction = useCreateTransaction(householdId)
  const createTransfer = useCreateTransfer(householdId)
  const { colorScheme: scheme } = useColorScheme()
  const mutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  // accountId/toAccountId/payerId are "overrides": null means "no explicit
  // user choice yet, fall back to the sensible default computed at render
  // time" (the first account, the second distinct account, the current
  // user) — avoids a setState-in-effect just to seed a default once data
  // loads.
  const [accountIdOverride, setAccountIdOverride] = useState<string | null>(null)
  const [toAccountIdOverride, setToAccountIdOverride] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  // Migration 008 (ADR-035): a third entry type alongside expense/income.
  // Transfer mode hides category/shared-personal/payer entirely (a
  // transfer is never categorized, never partially shared — see this
  // screen's transfer-mode branch below) rather than merely disabling them,
  // matching the milestone's explicit UI requirement.
  const [entryType, setEntryType] = useState<'expense' | 'income' | 'transfer'>('expense')
  const isIncome = entryType === 'income'
  const isTransfer = entryType === 'transfer'
  const [amountText, setAmountText] = useState('')
  const [description, setDescription] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [isShared, setIsShared] = useState(true)
  const [payerIdOverride, setPayerIdOverride] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Archiving an account is meant to remove it from every picker a new
  // transaction/transfer could attribute money to (UX-completeness audit
  // finding: an archived account previously stayed selectable here,
  // contradicting useArchiveAccount.ts's own stated purpose). accounts/
  // [id].tsx and accounts/index.tsx intentionally keep showing archived
  // accounts for history/unarchive — only this create-flow's pickers filter
  // them out.
  const activeAccounts = accounts.filter((a) => a.is_active)

  const accountId = accountIdOverride ?? activeAccounts[0]?.id ?? null
  // Default destination is the first account that isn't already the
  // default source — never the same account twice, so the same-account
  // validation error never greets a user who hasn't touched either picker.
  const toAccountId = toAccountIdOverride ?? activeAccounts.find((a) => a.id !== accountId)?.id ?? null
  const payerId = payerIdOverride ?? user?.id ?? null
  const selectedAccount = accounts.find((a) => a.id === accountId)
  const selectedToAccount = accounts.find((a) => a.id === toAccountId)
  const selectedCategory = categories.find((c) => c.id === categoryId)

  function handleCategoryChange(nextCategoryId: string) {
    setCategoryId(nextCategoryId)
    const category = categories.find((c) => c.id === nextCategoryId)
    if (category) setEntryType(category.is_income ? 'income' : 'expense')
  }

  function handleSubmit() {
    if (createTransaction.isPending || createTransfer.isPending) return
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

    if (isTransfer) {
      if (!toAccountId || toAccountId === accountId) {
        setValidationError(t('transactions.form.errors.sameAccount'))
        return
      }
      createTransfer.mutate(
        {
          householdId,
          fromAccountId: accountId,
          toAccountId,
          amountAgorot: parsed.agorot,
          txnDate: localDateString(),
          description: description.trim(),
        },
        { onSuccess: () => router.back() }
      )
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

  const accountOptions = activeAccounts.map((a) => ({ value: a.id, label: a.name, iconName: accountIconName(a.type) }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_he, iconName: categoryIconName(c.icon) }))
  const payerOptions = members.map((m) => ({ value: m.userId, label: m.displayName }))

  return (
    <Screen keyboardAvoiding width="form">
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
        {t('transactions.form.title')}
      </Text>

      {isHouseholdLoading || isAccountsLoading || isCategoriesLoading ? (
        <LoadingSpinner />
      ) : (
        // Visual QA + Desktop Polish pass: the whole form now shares one
        // bounded panel at desktop (the same DESKTOP_PANEL_CLASS token
        // Dashboard/Budgets/Settings already use) instead of the amount
        // hero, description/merchant row, and account/category Card reading
        // as three loose, differently-framed sections floating on an
        // otherwise-empty page. Mobile/tablet are untouched — the panel
        // class only ever applies its border/shadow/padding at
        // `web:desktop:`.
        <View className={DESKTOP_PANEL_CLASS}>
          <View className="mb-5">
            <SegmentedControl
              accessibilityLabel={t('transactions.form.title')}
              options={[
                { value: 'expense', label: t('transactions.form.expense'), tint: 'ink' },
                { value: 'income', label: t('transactions.form.income'), tint: 'positive' },
                { value: 'transfer', label: t('transactions.form.transfer'), tint: 'accent' },
              ]}
              value={entryType}
              onChange={setEntryType}
            />
          </View>

          <AmountField
            label={t('transactions.form.amountLabel')}
            value={amountText}
            onChangeText={setAmountText}
            placeholder={t('transactions.form.amountPlaceholder')}
          />

          {/* Desktop Visual/Responsive Design pass: description+merchant is
              the one field pair on this form that logically groups (both
              are free-text detail about the same transaction) and where
              pairing them buys back real vertical space — paired in a row
              only once there's room for it (`web:desktop:`), stacked
              exactly as before on mobile/tablet and in transfer mode
              (merchant doesn't apply there, so nothing to pair with). */}
          <View className={isTransfer ? undefined : 'web:desktop:flex-row web:desktop:gap-4'}>
            <View className={isTransfer ? undefined : 'web:desktop:flex-1'}>
              <Input
                label={t('transactions.form.descriptionLabel')}
                value={description}
                onChangeText={setDescription}
                placeholder={
                  isTransfer
                    ? t('transactions.form.transferDescriptionPlaceholder')
                    : t('transactions.form.descriptionPlaceholder')
                }
              />
            </View>

            {!isTransfer && (
              <View className="web:desktop:flex-1">
                <Input
                  label={t('transactions.form.merchantLabel')}
                  value={merchantName}
                  onChangeText={setMerchantName}
                  placeholder={t('transactions.form.merchantPlaceholder')}
                />
              </View>
            )}
          </View>

          {isTransfer ? (
            // Transfer mode: category/shared-personal/payer are meaningless
            // for an internal transfer (migration 008, ADR-035) — replaced
            // entirely by a from-account/to-account pair, never shown
            // alongside the expense/income fields above.
            <View className="mb-4 mt-2">
              <Card>
                {/* Desktop Visual/Responsive Design pass: from/to-account is
                    the other pairing on this form (both are the same kind
                    of field, picking the two ends of one movement) — side
                    by side at desktop with a vertical divider, matching the
                    stat-pair pattern Dashboard/Budgets' hero cards already
                    use (a manual w-px bar, since Divider.tsx has no
                    vertical variant to extend). Stacked with the existing
                    horizontal Divider on mobile/tablet, unchanged. */}
                <View className="web:desktop:flex-row web:desktop:items-center">
                  <View className="web:desktop:flex-1">
                    <Select
                      variant="row"
                      label={t('transactions.form.fromAccountLabel')}
                      options={accountOptions}
                      value={accountId}
                      onChange={setAccountIdOverride}
                      placeholder={t('transactions.form.fromAccountPlaceholder')}
                      sheetTitle={t('transactions.form.fromAccountLabel')}
                      leadingIcon={
                        <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                          <Ionicons name={accountIconName(selectedAccount?.type)} size={17} color={mutedColor} />
                        </View>
                      }
                    />
                  </View>
                  <View className="web:desktop:hidden">
                    <Divider />
                  </View>
                  <View className="hidden web:desktop:mx-4 web:desktop:flex web:desktop:h-9 web:desktop:w-px web:desktop:self-center web:desktop:bg-border-light dark:web:desktop:bg-border-dark" />
                  <View className="web:desktop:flex-1">
                    <Select
                      variant="row"
                      label={t('transactions.form.toAccountLabel')}
                      options={accountOptions}
                      value={toAccountId}
                      onChange={setToAccountIdOverride}
                      placeholder={t('transactions.form.toAccountPlaceholder')}
                      sheetTitle={t('transactions.form.toAccountLabel')}
                      leadingIcon={
                        <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                          <Ionicons name={accountIconName(selectedToAccount?.type)} size={17} color={mutedColor} />
                        </View>
                      }
                    />
                  </View>
                </View>
              </Card>
            </View>
          ) : (
            <View className="mb-4 mt-2">
              <Card>
                {/* Same account/category pairing at desktop as the
                    from/to-account block above. */}
                <View className="web:desktop:flex-row web:desktop:items-center">
                  <View className="web:desktop:flex-1">
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
                  </View>
                  <View className="web:desktop:hidden">
                    <Divider />
                  </View>
                  <View className="hidden web:desktop:mx-4 web:desktop:flex web:desktop:h-9 web:desktop:w-px web:desktop:self-center web:desktop:bg-border-light dark:web:desktop:bg-border-dark" />
                  <View className="web:desktop:flex-1">
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
                  </View>
                </View>
              </Card>
            </View>
          )}

          {!isTransfer && (
            // Visual QA + Desktop Polish pass: shared/personal + payer paired
            // side by side at desktop, same reasoning as the description/
            // merchant and account/category rows above — only when payer is
            // actually shown (`payerOptions.length > 1`), so a single-member
            // household doesn't get a half-empty row. `items-start` (not
            // stretch): the segmented control carries its own hint text
            // below it and is taller than the bare payer Select beside it.
            <View className={payerOptions.length > 1 ? 'web:desktop:flex-row web:desktop:items-start web:desktop:gap-4' : undefined}>
              <View className={payerOptions.length > 1 ? 'web:desktop:flex-1' : undefined}>
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
              </View>

              {payerOptions.length > 1 && (
                <View className="web:desktop:flex-1">
                  <Select
                    label={t('transactions.form.payerLabel')}
                    options={payerOptions}
                    value={payerId}
                    onChange={setPayerIdOverride}
                    placeholder={t('transactions.form.payerPlaceholder')}
                  />
                </View>
              )}
            </View>
          )}

          {(validationError || createTransaction.isError || createTransfer.isError) && (
            <ErrorMessage message={validationError ?? t('transactions.form.errors.generic')} />
          )}

          <View className="mt-4">
            <Button
              title={t('transactions.form.submit')}
              onPress={handleSubmit}
              loading={createTransaction.isPending || createTransfer.isPending}
            />
          </View>
        </View>
      )}
    </Screen>
  )
}
