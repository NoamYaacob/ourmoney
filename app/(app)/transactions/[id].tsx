import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { formatDateDisplay } from '@/lib/dates/format'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useCategoryRules } from '@/features/categories/hooks/useCategoryRules'
import { useTransaction } from '@/features/transactions/hooks/useTransaction'
import { useUpdateTransaction } from '@/features/transactions/hooks/useUpdateTransaction'
import { useExcludeTransaction } from '@/features/transactions/hooks/useExcludeTransaction'
import { useDeleteTransaction } from '@/features/transactions/hooks/useDeleteTransaction'
import { agorotFromILS } from '@/lib/money/format'
import { signedAmountAgorot } from '@/features/transactions/lib/transactionSign'
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
import { StatusChip } from '@/components/ui/StatusChip'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import { DESKTOP_PANEL_CLASS } from '@/constants/layout'

export default function TransactionDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, role, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts } = useAccounts(householdId)
  const { categories } = useCategories(householdId)
  // Rule provenance lookup (ADR-027): matched_rule_id is only an id on the
  // transaction row, so the rule it names — and whether it still exists —
  // is resolved client-side against the household's full rule set.
  const { rules } = useCategoryRules(householdId)
  const { transaction, isLoading } = useTransaction(id)
  const updateTransaction = useUpdateTransaction(householdId)
  const excludeTransaction = useExcludeTransaction(householdId)
  const deleteTransaction = useDeleteTransaction(householdId)
  const { colorScheme: scheme } = useColorScheme()
  const mutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

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

  // A transfer leg is never editable here — RLS forces this
  // (transactions_update's USING clause excludes transfer_id IS NOT NULL
  // rows entirely, migration 008/ADR-035) — so a leg opened directly (e.g.
  // a deep link, or a stale list row from before this milestone) redirects
  // to the dedicated transfer detail screen instead of rendering a form
  // that could never save. useEffect, not adjust-during-render: this is a
  // navigation side effect, not a state sync, matching
  // useAuthGuard.ts's own router.replace pattern.
  useEffect(() => {
    if (transaction?.transfer_id) {
      router.replace(`/transfers/${transaction.transfer_id}`)
    }
  }, [transaction?.transfer_id, router])

  // Folds in isHouseholdLoading: accounts/categories used for the Select
  // pickers below are gated on householdId, so without this the pickers
  // would briefly render with zero options while useHousehold is still
  // resolving (mobile-expo-reviewer finding).
  if (isLoading || isHouseholdLoading || transaction?.transfer_id) {
    return (
      <Screen onBack={() => router.back()} center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!transaction) {
    return (
      <Screen onBack={() => router.back()} center>
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
        // Omitted (not passed as null/unchanged value) unless the user
        // actually changed the category picker from what loaded — sending
        // it unconditionally would clear matched_rule_id (useUpdateTransaction.ts)
        // on every save, even ones that never touched the category.
        categoryId: categoryId !== transaction.category_id ? categoryId : undefined,
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

  // Rule provenance (ADR-027): matched_rule_id is set only when a rule
  // auto-categorized this row (useCreateTransaction.ts /
  // useApplyRulesRetroactively.ts) and cleared on manual override
  // (useUpdateTransaction.ts). A missing lookup — null id, or an id the
  // rule list no longer contains because the rule was deleted (the FK's
  // ON DELETE SET NULL means this second case is actually unreachable, but
  // is handled the same as "no provenance" regardless) — renders nothing,
  // never a crash.
  const matchedRule = transaction.matched_rule_id
    ? rules.find((r) => r.id === transaction.matched_rule_id)
    : undefined
  const matchedRuleCategory = matchedRule ? categories.find((c) => c.id === matchedRule.category_id) : undefined

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name, iconName: accountIconName(a.type) }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_he, iconName: categoryIconName(c.icon) }))
  const selectedAccount = accounts.find((a) => a.id === accountId)
  const selectedCategory = categories.find((c) => c.id === categoryId)

  return (
    // Screen 04 of the mobile design — the same field language new.tsx
    // (screen 05) already carries: AmountField as the hero entry, a
    // SegmentedControl for the one-of-two choices instead of a Chip pair,
    // and Select's 'row' variant with an icon for account/category. No
    // hook, mutation payload, or validation rule below changed from before
    // this pass — only how the fields are presented.
    <Screen onBack={() => router.back()} keyboardAvoiding width="form">
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
        {t('transactions.detail.title')}
      </Text>

      <View className={DESKTOP_PANEL_CLASS}>
        <View className="mb-5">
          <SegmentedControl
            accessibilityLabel={t('transactions.detail.title')}
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

        {/* What and when. The frame puts "שופרסל דיל · יום חמישי,
            21.08.2026" directly under the figure, and this screen was not
            showing the transaction's date anywhere at all — a detail screen
            for a dated thing that never said which day it was. */}
        <Text className="-mt-4 mb-5 text-center text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
          {transaction.merchant_name ? `${transaction.merchant_name} · ` : ''}
          {formatDateDisplay(transaction.txn_date)}
        </Text>

        <View className="web:desktop:flex-row web:desktop:gap-4">
          <View className="web:desktop:flex-1">
            <Input label={t('transactions.form.descriptionLabel')} value={description} onChangeText={setDescription} />
          </View>
          <View className="web:desktop:flex-1">
            <Input
              label={t('transactions.form.merchantLabel')}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder={t('transactions.form.merchantPlaceholder')}
            />
          </View>
        </View>

        <View className="mb-4 mt-2">
          <Card>
            <View className="web:desktop:flex-row web:desktop:items-center">
              <View className="web:desktop:flex-1">
                <Select
                  variant="row"
                  label={t('transactions.form.accountLabel')}
                  options={accountOptions}
                  value={accountId}
                  onChange={setAccountId}
                  placeholder={t('transactions.form.accountPlaceholder')}
                  sheetTitle={t('transactions.form.accountLabel')}
                  leadingIcon={
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                      <Ionicons name={accountIconName(selectedAccount?.type)} size={ICON.row} color={mutedColor} />
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
                  onChange={setCategoryId}
                  placeholder={t('transactions.form.categoryPlaceholder')}
                  sheetTitle={t('transactions.form.categorySheetTitle')}
                  leadingIcon={<CategoryIcon icon={selectedCategory?.icon} size="sm" />}
                />
              </View>
            </View>
          </Card>
        </View>

        {matchedRule && (
          <Card className="mb-4">
            <View className="mb-1.5 flex-row items-center justify-between">
              <Text className="text-caption font-sansSemibold text-inkMuted-light dark:text-inkMuted-dark">
                {t('transactions.detail.categorizedByRule')}
              </Text>
              <StatusChip label={t('categories.rules.ruleBadge')} tone="accent" />
            </View>
            <View className="flex-row flex-wrap items-baseline gap-1.5">
              <Text className="text-caption font-sansSemibold text-inkMuted-light dark:text-inkMuted-dark">
                {t('categories.rules.ifLabel')}
              </Text>
              <Text className="text-body text-ink-light dark:text-ink-dark">
                {t(`categories.rules.field.${matchedRule.field}`)} {t(`categories.rules.operator.${matchedRule.operator}`)} &quot;
                {matchedRule.value}&quot;
                {matchedRuleCategory ? ` → ${matchedRuleCategory.icon} ${matchedRuleCategory.name_he}` : ''}
              </Text>
            </View>
            <View className="mt-2">
              <Button
                title={t('transactions.detail.editRule')}
                variant="ghost"
                onPress={() => router.push({ pathname: '/settings/categories', params: { editRuleId: matchedRule.id } })}
              />
            </View>
          </Card>
        )}

        <Text className="mb-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
          {t('transactions.form.sharedLabel')}
        </Text>
        <View className="mb-4">
          <SegmentedControl
            accessibilityLabel={t('transactions.form.sharedLabel')}
            options={[
              { value: 'shared', label: t('transactions.form.shared') },
              { value: 'personal', label: t('transactions.form.personal') },
            ]}
            value={isShared ? 'shared' : 'personal'}
            onChange={(v) => setIsShared(v === 'shared')}
          />
        </View>

        {(validationError || updateTransaction.isError) && (
          <ErrorMessage message={validationError ?? t('transactions.form.errors.generic')} />
        )}

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

        {/* Save and delete on one row, as the frame draws them: the primary
            action takes the width, deletion is a 52px icon beside it. They
            had been two full-width buttons stacked with the exclude toggle
            between them, which gave deleting a transaction the same visual
            weight as saving one. */}
        <View className="mt-3 flex-row items-stretch gap-2.5">
          <View className="flex-1">
            <Button title={t('transactions.detail.save')} onPress={handleSave} loading={updateTransaction.isPending} />
          </View>
          {canDelete && (
            <Pressable
              onPress={() => setConfirmDeleteVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('transactions.detail.delete')}
              className="h-[52px] w-[52px] items-center justify-center rounded-control border border-border-light bg-surfaceMuted-light active:opacity-70 dark:border-border-dark dark:bg-surfaceMuted-dark"
            >
              <Ionicons
                name="trash-outline"
                size={ICON.nav}
                color={scheme === 'dark' ? colors.dangerStrong.dark : colors.dangerStrong.light}
              />
            </Pressable>
          )}
        </View>

        {deleteTransaction.isError && <ErrorMessage message={t('transactions.detail.deleteError')} />}
      </View>

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
