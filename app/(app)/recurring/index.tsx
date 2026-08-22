// Reached from Settings, not a tab — same posture as accounts/goals.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useRecurringTransactions } from '@/features/recurring/hooks/useRecurringTransactions'
import { useCreateRecurringTransaction } from '@/features/recurring/hooks/useCreateRecurringTransaction'
import { usePriceIncreaseDetections } from '@/features/recurring/hooks/usePriceIncreaseDetections'
import { signedAmountAgorot } from '@/features/transactions/lib/transactionSign'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { DatePickerField } from '@/components/ui/DatePickerField'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { INLINE_FORM_WIDTH_CLASS } from '@/constants/layout'
import type { RecurringFrequency } from '@/types/app'

const FREQUENCIES: RecurringFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
const DAY_OF_MONTH_FREQUENCIES: RecurringFrequency[] = ['monthly', 'quarterly', 'yearly']

export default function Recurring() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const { recurringTransactions, isLoading: isRecurringLoading, error } = useRecurringTransactions(householdId)
  const createRecurring = useCreateRecurringTransaction(householdId)
  const { detections: priceIncreaseDetections } = usePriceIncreaseDetections(householdId)

  const isLoading = isHouseholdLoading || isAccountsLoading || isCategoriesLoading

  const [isAdding, setIsAdding] = useState(false)
  const [accountIdOverride, setAccountIdOverride] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [isIncome, setIsIncome] = useState(false)
  const [amountText, setAmountText] = useState('')
  const [description, setDescription] = useState('')
  const [isShared, setIsShared] = useState(true)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [nextDueDate, setNextDueDate] = useState(localDateString())
  const [validationError, setValidationError] = useState<string | null>(null)

  const accountId = accountIdOverride ?? accounts[0]?.id ?? null
  const needsDayOfMonth = DAY_OF_MONTH_FREQUENCIES.includes(frequency)

  function resetForm() {
    setAmountText('')
    setDescription('')
    setCategoryId(null)
    setIsAdding(false)
  }

  function handleCreate() {
    if (createRecurring.isPending) return
    setValidationError(null)

    if (!householdId || !accountId) {
      setValidationError(t('recurring.form.errors.missingAccount'))
      return
    }
    if (!description.trim()) {
      setValidationError(t('recurring.form.errors.missingDescription'))
      return
    }
    const parsed = agorotFromILS(amountText)
    if (!parsed.ok || parsed.agorot === null) {
      setValidationError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }

    const dayOfMonth = needsDayOfMonth ? Number(nextDueDate.slice(8, 10)) : null

    createRecurring.mutate(
      {
        householdId,
        accountId,
        categoryId,
        amountAgorot: signedAmountAgorot(parsed.agorot, isIncome),
        description: description.trim(),
        isShared,
        frequency,
        dayOfMonth,
        nextDueDate,
      },
      { onSuccess: resetForm }
    )
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name_he}` }))
  const frequencyOptions = FREQUENCIES.map((f) => ({ value: f, label: t(`recurring.frequency.${f}`) }))

  return (
    <Screen keyboardAvoiding width="wide">
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
        {t('recurring.title')}
      </Text>

      {priceIncreaseDetections.length > 0 && (
        <View className={`mb-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Text className="mb-2 text-sm font-semibold text-ink-light dark:text-ink-dark">
            {t('recurring.priceIncrease.sectionTitle')}
          </Text>
          <Card>
            {priceIncreaseDetections.map((d, index) => (
              <View key={d.identityKey}>
                {index > 0 && (
                  <View className="my-3">
                    <Divider />
                  </View>
                )}
                <Pressable
                  onPress={() =>
                    d.recurringId
                      ? router.push(`/recurring/${d.recurringId}`)
                      : router.push(`/transactions/${d.currentTransactionId}`)
                  }
                  accessibilityRole="button"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-base text-ink-light dark:text-ink-dark" numberOfLines={1}>
                      {d.description}
                    </Text>
                    <Text className="text-xs font-semibold text-danger-light dark:text-danger-dark">
                      {t('recurring.priceIncrease.badge')}
                    </Text>
                  </View>
                  <Text className="mt-1 text-xs text-inkMuted-light dark:text-inkMuted-dark">
                    {formatILS(d.previousAmountAgorot)} → {formatILS(d.currentAmountAgorot)}
                  </Text>
                  <Text className="mt-0.5 text-xs text-danger-light dark:text-danger-dark">
                    {t('recurring.priceIncrease.increaseLine', {
                      amount: formatILS(d.increaseAgorot),
                      percent: d.increasePercent,
                    })}
                  </Text>
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      )}

      {error ? (
        <ErrorMessage message={t('recurring.errors.generic')} />
      ) : isLoading || isRecurringLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {/* No actionLabel/onAction — the persistent "Add recurring"
              button below already covers it (mobile-expo-reviewer finding,
              same as accounts/index.tsx and goals/index.tsx). */}
          {recurringTransactions.length === 0 && <EmptyState icon="🔁" message={t('recurring.empty')} />}
          {/* Responsive/desktop pass: a 2-column card grid once there's more
              than one recurring item, desktop only — same calc()-free
              pattern as accounts/index.tsx. */}
          <View
            className={
              recurringTransactions.length > 1 ? 'web:desktop:flex-row web:desktop:flex-wrap web:desktop:justify-between' : undefined
            }
          >
          {recurringTransactions.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(`/recurring/${item.id}`)}
              accessibilityRole="button"
              className={recurringTransactions.length > 1 ? 'mb-2 web:desktop:w-[48%]' : 'mb-2'}
            >
              {/* Paused items are dimmed and get a bolded status word instead
                  of blending into the muted caption — the inline "· מושהה"
                  suffix alone was too easy to miss when scanning the list
                  (UX-completeness audit finding). */}
              <Card
                className={
                  !item.is_active
                    ? 'rounded-card border border-border-light bg-surfaceMuted-light p-3 opacity-60 dark:border-border-dark dark:bg-surfaceMuted-dark'
                    : undefined
                }
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">
                    {item.description}
                  </Text>
                  <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">
                    {formatILS(item.amount_agorot)}
                  </Text>
                </View>
                <Text className="mt-1 text-xs text-inkMuted-light dark:text-inkMuted-dark">
                  {t(`recurring.frequency.${item.frequency}`)} · {t('recurring.nextDue')} {formatDateDisplay(item.next_due_date)}
                  {!item.is_active && (
                    <Text className="font-semibold text-ink-light dark:text-ink-dark"> · {t('recurring.inactive')}</Text>
                  )}
                </Text>
              </Card>
            </Pressable>
          ))}
          </View>
        </>
      )}

      {isAdding ? (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Card>
          <View className="mb-4 flex-row gap-2">
            <Chip label={t('transactions.form.expense')} selected={!isIncome} onPress={() => setIsIncome(false)} />
            <Chip label={t('transactions.form.income')} selected={isIncome} onPress={() => setIsIncome(true)} />
          </View>

          {/* Visual QA + Desktop Polish pass: amount+description and
              account+category pair into rows at desktop, matching every
              other add/edit form in this app — this form previously stayed
              a single stretched column even inside its own width-capped
              wrapper. Mobile/tablet untouched. */}
          <View className="web:desktop:flex-row web:desktop:gap-4">
            <View className="web:desktop:flex-1">
              <Input
                label={t('transactions.form.amountLabel')}
                value={amountText}
                onChangeText={setAmountText}
                placeholder={t('transactions.form.amountPlaceholder')}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="web:desktop:flex-1">
              <Input
                label={t('transactions.form.descriptionLabel')}
                value={description}
                onChangeText={setDescription}
                placeholder={t('transactions.form.descriptionPlaceholder')}
              />
            </View>
          </View>
          <View className="web:desktop:flex-row web:desktop:gap-4">
            <View className="web:desktop:flex-1">
              <Select
                label={t('transactions.form.accountLabel')}
                options={accountOptions}
                value={accountId}
                onChange={setAccountIdOverride}
                placeholder={t('transactions.form.accountPlaceholder')}
              />
            </View>
            <View className="web:desktop:flex-1">
              <Select
                label={t('transactions.form.categoryLabel')}
                options={categoryOptions}
                value={categoryId}
                onChange={setCategoryId}
                placeholder={t('transactions.form.categoryPlaceholder')}
              />
            </View>
          </View>
          <View className="web:desktop:flex-row web:desktop:gap-4">
            <View className="web:desktop:flex-1">
              <Select
                label={t('recurring.form.frequencyLabel')}
                options={frequencyOptions}
                value={frequency}
                onChange={(value) => setFrequency(value as RecurringFrequency)}
                placeholder={t('recurring.form.frequencyLabel')}
              />
            </View>
            <View className="web:desktop:flex-1">
              <DatePickerField
                label={t('recurring.form.nextDueDateLabel')}
                value={nextDueDate}
                onChange={setNextDueDate}
              />
            </View>
          </View>

          <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
            {t('transactions.form.sharedLabel')}
          </Text>
          <View className="mb-4 flex-row gap-2">
            <Chip label={t('transactions.form.shared')} selected={isShared} onPress={() => setIsShared(true)} />
            <Chip label={t('transactions.form.personal')} selected={!isShared} onPress={() => setIsShared(false)} />
          </View>

          {(validationError || createRecurring.isError) && (
            <ErrorMessage message={validationError ?? t('recurring.errors.generic')} />
          )}
          <Button title={t('recurring.form.submit')} onPress={handleCreate} loading={createRecurring.isPending} />
          </Card>
        </View>
      ) : (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Button title={t('recurring.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
