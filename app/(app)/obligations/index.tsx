// Annual Expenses / Planned Obligations — reached from Settings, not a tab,
// same posture as accounts/goals/recurring. A KNOWN future obligation
// (ארנונה, ביטוח רכב, טסט לרכב...) that is not a recurring monthly payment
// and not a movement of money that already happened — see migration 007's
// own header comment for the full model-decision rationale. One-time only
// in this milestone (no recurrence field); "mark paid" is a status
// transition only (status -> 'completed'), not a transaction-generating
// action — see docs/DECISIONS.md and this milestone's final report for why
// that's deferred, not forgotten.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { usePlannedObligations } from '@/features/obligations/hooks/usePlannedObligations'
import { useCreatePlannedObligation } from '@/features/obligations/hooks/useCreatePlannedObligation'
import { filterUpcomingObligations, isPastDue } from '@/features/obligations/lib/upcomingObligations'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { categoryIconName } from '@/features/categories/lib/categoryIcon'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
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

export default function Obligations() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const { obligations, isLoading: isObligationsLoading, error } = usePlannedObligations(householdId)
  const createObligation = useCreatePlannedObligation(householdId)

  const isLoading = isHouseholdLoading || isAccountsLoading || isCategoriesLoading

  // UX-completeness audit finding: completed/cancelled obligations vanished
  // from this screen entirely with no way to look them up again — there
  // was no audit trail confirming a mark-paid/cancel actually took effect.
  // Reuses the household's already-loaded obligations list (no new query,
  // no new index) — just an additional client-side filter alongside
  // filterUpcomingObligations below.
  const [isHistoryVisible, setIsHistoryVisible] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')
  const [amountText, setAmountText] = useState('')
  const [dueDate, setDueDate] = useState(localDateString())
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountIdOverride, setAccountIdOverride] = useState<string | null>(null)
  const [isShared, setIsShared] = useState(true)
  const [notes, setNotes] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setAmountText('')
    setDueDate(localDateString())
    setCategoryId(null)
    setAccountIdOverride(null)
    setIsShared(true)
    setNotes('')
    setIsAdding(false)
  }

  function handleCreate() {
    if (!householdId || createObligation.isPending) return
    setValidationError(null)

    if (!name.trim()) {
      setValidationError(t('obligations.form.errors.missingName'))
      return
    }
    const parsed = agorotFromILS(amountText)
    if (!parsed.ok || parsed.agorot === null) {
      setValidationError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }
    if (!dueDate) {
      setValidationError(t('obligations.form.errors.missingDueDate'))
      return
    }

    createObligation.mutate(
      {
        householdId,
        name: name.trim(),
        amountAgorot: parsed.agorot,
        dueDate,
        categoryId,
        accountId: accountIdOverride,
        isShared,
        notes: notes.trim() || null,
      },
      { onSuccess: resetForm }
    )
  }

  const upcoming = filterUpcomingObligations(
    obligations.map((o) => ({ id: o.id, dueDate: o.due_date, status: o.status }))
  )
  const upcomingById = new Map(obligations.map((o) => [o.id, o]))
  const today = localDateString()

  const history = obligations
    .filter((o) => o.status !== 'upcoming')
    .slice()
    .sort((a, b) => b.due_date.localeCompare(a.due_date))

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_he, iconName: categoryIconName(c.icon) }))
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

  return (
    <Screen keyboardAvoiding width="wide">
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
        {t('obligations.title')}
      </Text>

      {error ? (
        <ErrorMessage message={t('obligations.errors.generic')} />
      ) : isLoading || isObligationsLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {upcoming.length === 0 && <EmptyState iconName="calendar-outline" message={t('obligations.empty')} />}
          {/* Responsive/desktop pass: same 2-column card grid as
              accounts/recurring/goals once there's more than one obligation,
              desktop only — `w-[48%]` + `justify-between` on a `flex-row
              flex-wrap` container is a calc()-free way to get two even
              columns in Yoga/RN's flexbox. Mobile/tablet keep the original
              single-column list untouched. */}
          <View
            className={
              upcoming.length > 1 ? 'web:desktop:flex-row web:desktop:flex-wrap web:desktop:justify-between' : undefined
            }
          >
            {upcoming.map((item) => {
              const obligation = upcomingById.get(item.id)
              if (!obligation) return null
              const category = obligation.category_id ? categories.find((c) => c.id === obligation.category_id) : undefined
              const pastDue = isPastDue(obligation.due_date, today)
              return (
                <Pressable
                  key={obligation.id}
                  onPress={() => router.push(`/obligations/${obligation.id}`)}
                  accessibilityRole="button"
                  className={upcoming.length > 1 ? 'mb-2 web:desktop:w-[48%]' : 'mb-2'}
                >
                  <Card>
                    <View className="flex-row items-center justify-between web:flex-row">
                      <View className="flex-1 flex-row items-center gap-3 web:flex-row">
                        <CategoryIcon icon={category?.icon} size="sm" />
                        <View className="flex-1">
                          <Text className="text-base font-semibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
                            {obligation.name}
                          </Text>
                          <Text
                            className={`text-xs ${
                              pastDue ? 'text-danger-light dark:text-danger-dark' : 'text-inkMuted-light dark:text-inkMuted-dark'
                            }`}
                          >
                            {obligation.due_date}
                            {pastDue ? ` · ${t('obligations.pastDue')}` : ''}
                            {' · '}
                            {obligation.is_shared ? t('transactions.form.shared') : t('transactions.form.personal')}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-sm font-semibold text-ink-light dark:text-ink-dark">
                        {formatILS(obligation.amount_agorot)}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              )
            })}
          </View>

          {history.length > 0 && (
            <View className="mt-4">
              <Pressable
                onPress={() => setIsHistoryVisible((v) => !v)}
                accessibilityRole="button"
                className="flex-row items-center gap-1 web:flex-row"
              >
                <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                  {t(isHistoryVisible ? 'obligations.history.hideButton' : 'obligations.history.showButton')}
                </Text>
              </Pressable>
              {isHistoryVisible && (
                <View className="mt-2">
                  <Card>
                    {history.map((obligation, index) => {
                      const category = obligation.category_id
                        ? categories.find((c) => c.id === obligation.category_id)
                        : undefined
                      return (
                        <Pressable
                          key={obligation.id}
                          onPress={() => router.push(`/obligations/${obligation.id}`)}
                          accessibilityRole="button"
                        >
                          {index > 0 && (
                            <View className="my-3">
                              <Divider />
                            </View>
                          )}
                          <View className="flex-row items-center justify-between web:flex-row">
                            <View className="flex-1 flex-row items-center gap-3 web:flex-row">
                              <CategoryIcon icon={category?.icon} size="sm" />
                              <View className="flex-1">
                                <Text
                                  className="text-base font-semibold text-ink-light dark:text-ink-dark"
                                  numberOfLines={1}
                                >
                                  {obligation.name}
                                </Text>
                                <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">
                                  {obligation.due_date}
                                  {' · '}
                                  {t(`obligations.status.${obligation.status}`)}
                                </Text>
                              </View>
                            </View>
                            <Text className="text-sm font-semibold text-ink-light dark:text-ink-dark">
                              {formatILS(obligation.amount_agorot)}
                            </Text>
                          </View>
                        </Pressable>
                      )
                    })}
                  </Card>
                </View>
              )}
            </View>
          )}
        </>
      )}

      {isAdding ? (
        <View className="mt-4 web:desktop:max-w-[600px]">
          <Input label={t('obligations.form.nameLabel')} value={name} onChangeText={setName} placeholder={t('obligations.form.namePlaceholder')} />
          <Input
            label={t('transactions.form.amountLabel')}
            value={amountText}
            onChangeText={setAmountText}
            placeholder={t('transactions.form.amountPlaceholder')}
            keyboardType="decimal-pad"
          />
          <DatePickerField label={t('obligations.form.dueDateLabel')} value={dueDate} onChange={setDueDate} />
          <Select
            label={t('transactions.form.categoryLabel')}
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            placeholder={t('transactions.form.categoryPlaceholder')}
          />
          <Select
            label={t('transactions.form.accountLabel')}
            options={accountOptions}
            value={accountIdOverride}
            onChange={setAccountIdOverride}
            placeholder={t('transactions.form.accountPlaceholder')}
          />

          <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('transactions.form.sharedLabel')}</Text>
          <View className="mb-4 flex-row gap-2">
            <Chip label={t('transactions.form.shared')} selected={isShared} onPress={() => setIsShared(true)} />
            <Chip label={t('transactions.form.personal')} selected={!isShared} onPress={() => setIsShared(false)} />
          </View>

          <Input
            label={t('obligations.form.notesLabel')}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('obligations.form.notesPlaceholder')}
            multiline
          />

          {(validationError || createObligation.isError) && (
            <ErrorMessage message={validationError ?? t('obligations.errors.generic')} />
          )}
          <Button title={t('obligations.form.submit')} onPress={handleCreate} loading={createObligation.isPending} />
          <View className="mt-3">
            <Button
              title={t('common.cancel')}
              variant="secondary"
              disabled={createObligation.isPending}
              onPress={() => {
                setValidationError(null)
                resetForm()
              }}
            />
          </View>
        </View>
      ) : (
        <View className="mt-4 web:desktop:max-w-[600px]">
          <Button title={t('obligations.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
