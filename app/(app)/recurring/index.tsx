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
import { formatDateDisplay, formatDayOfMonth } from '@/lib/dates/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { Screen } from '@/components/ui/Screen'
import { PlanningTabs } from '@/components/ui/PlanningTabs'
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
import { StatusChip } from '@/components/ui/StatusChip'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { HeroPanel, HeroLabel } from '@/components/ui/HeroPanel'
import { Money } from '@/components/ui/Money'
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
  const { recurringTransactions, isLoading: isRecurringLoading, error, refetch } = useRecurringTransactions(householdId)
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
  const activeExpenseTemplates = recurringTransactions.filter((item) => item.is_active && item.amount_agorot < 0)
  const activeMonthlyTotalAgorot = activeExpenseTemplates.reduce((sum, item) => sum + Math.abs(item.amount_agorot), 0)

  return (
    <Screen onBack={() => router.back()} keyboardAvoiding width="wide">
      <Text className="mb-4 text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('recurring.title')}
      </Text>

      <PlanningTabs active="recurring" />

      {priceIncreaseDetections.length > 0 && (
        <View className={`mb-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <SectionLabel className="mb-2">{t('recurring.priceIncrease.sectionTitle')}</SectionLabel>
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
                    <Text className="flex-1 text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                      {d.description}
                    </Text>
                    <StatusChip label={t('recurring.priceIncrease.badge')} tone="danger" />
                  </View>
                  <Text className="mt-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                    {formatILS(d.previousAmountAgorot)} → {formatILS(d.currentAmountAgorot)}
                  </Text>
                  <Text className="mt-0.5 text-caption text-danger-light dark:text-danger-dark">
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
        <ErrorMessage message={t('recurring.errors.generic')} onRetry={refetch} />
      ) : isLoading || isRecurringLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {/* No actionLabel/onAction — the persistent "Add recurring"
              button below already covers it (mobile-expo-reviewer finding,
              same as accounts/index.tsx and goals/index.tsx). */}
          {/* Desktop Claude Design pass: the mockup's dark summary card,
              scoped to this screen's own domain — see obligations/index.tsx's
              identical card for why each of Obligations/Recurring gets its
              own screen-scoped total rather than one shared cross-domain
              "monthly commitment" figure. Sums only active expense
              templates (income templates and paused ones don't belong in
              "what this household is committed to paying monthly"); the
              literal stored per-charge amount is used as-is, so a
              bi-monthly/quarterly template is not normalized to a true
              monthly-equivalent — a simplification worth a comment, not a
              second engine. */}
          {activeExpenseTemplates.length > 0 && (
            <View className="hidden web:desktop:mb-5 web:desktop:flex web:desktop:w-[340px]">
              <HeroPanel>
                <HeroLabel>{t('recurring.title')}</HeroLabel>
                <View className="web:desktop:mt-1.5">
                  <Money agorot={activeMonthlyTotalAgorot} size="display" tone="hero" />
                </View>
                <Text className="web:desktop:mt-1 text-caption font-sans text-heroInkMuted-light">
                  {t('recurring.summarySubtitle', { count: activeExpenseTemplates.length, amount: formatILS(activeMonthlyTotalAgorot) })}
                </Text>
              </HeroPanel>
            </View>
          )}

          {recurringTransactions.length === 0 && <EmptyState iconName="repeat-outline" message={t('recurring.empty')} hint={t('recurring.emptyHint')} />}
          {/* One card, hairline rows, opening with the day of the month —
              which is what both frames draw and what the list is actually
              for: a household scanning "what comes off, and on which day".
              A 2-column grid of cards answered "how many templates do we
              have", a question nobody opens this screen to ask.

              The amount is a magnitude, like every other recurring charge in
              the design; the direction is the screen, not the sign. */}
          {recurringTransactions.length > 0 && (
            <View className="overflow-hidden rounded-card border border-border-light bg-surfaceMuted-light px-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
              {recurringTransactions.map((item, index) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/recurring/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={item.description}
                  className={`min-h-[44px] flex-row items-center gap-3.5 py-3 ${
                    index > 0 ? 'border-t border-divider-light dark:border-divider-dark' : ''
                  } ${item.is_active ? '' : 'opacity-60'}`}
                >
                  <Text
                    className="w-9 font-heeboBold text-caption text-inkMuted-light dark:text-inkMuted-dark"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {formatDayOfMonth(item.next_due_date)}
                  </Text>
                  <View className="flex-1">
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
                        {item.description}
                      </Text>
                      {!item.is_active && <StatusChip label={t('recurring.inactive')} />}
                    </View>
                    <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                      {t(`recurring.frequency.${item.frequency}`)} · {t('recurring.nextDue')}{' '}
                      {formatDateDisplay(item.next_due_date)}
                    </Text>
                  </View>
                  <Money agorot={Math.abs(item.amount_agorot)} size="row" />
                </Pressable>
              ))}
            </View>
          )}
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
