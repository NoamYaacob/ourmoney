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
import { filterUpcomingObligations } from '@/features/obligations/lib/upcomingObligations'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { categoryIconName } from '@/features/categories/lib/categoryIcon'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { CommitmentRow } from '@/components/ui/CommitmentRow'
import { commitmentUrgency } from '@/features/dashboard/lib/commitmentUrgency'
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
import { HeroPanel, HeroLabel } from '@/components/ui/HeroPanel'
import { Money } from '@/components/ui/Money'
import { INLINE_FORM_WIDTH_CLASS } from '@/constants/layout'

export default function Obligations() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const { obligations, isLoading: isObligationsLoading, error, refetch } = usePlannedObligations(householdId)
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
  const upcomingTotalAgorot = upcoming.reduce((sum, item) => sum + (upcomingById.get(item.id)?.amount_agorot ?? 0), 0)

  const history = obligations
    .filter((o) => o.status !== 'upcoming')
    .slice()
    .sort((a, b) => b.due_date.localeCompare(a.due_date))

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_he, iconName: categoryIconName(c.icon) }))
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

  return (
    <Screen onBack={() => router.back()} keyboardAvoiding width="wide">
      <Text className="mb-4 text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('obligations.title')}
      </Text>

      <PlanningTabs active="obligations" />

      {error ? (
        <ErrorMessage message={t('obligations.errors.generic')} onRetry={refetch} />
      ) : isLoading || isObligationsLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {/* Desktop Claude Design pass: the mockup's dark summary card,
              stating what's already committed before any decision is made
              this month — desktop only. The figure is a plain sum of the
              upcoming obligations already loaded below (no new query, no
              cross-domain total): Recurring gets the identical treatment
              for its own domain (see recurring/index.tsx), each screen
              scoped to data it already owns rather than one shared
              cross-domain "monthly commitment" figure, which would need
              new queries on every one of these three routes for a single
              decorative card. */}
          {upcoming.length > 0 && (
            <View className="hidden web:desktop:mb-5 web:desktop:flex web:desktop:w-[340px]">
              <HeroPanel>
                <HeroLabel>{t('obligations.title')}</HeroLabel>
                <View className="web:desktop:mt-1.5">
                  <Money agorot={upcomingTotalAgorot} size="display" tone="hero" />
                </View>
                <Text className="web:desktop:mt-1 text-caption font-sans text-heroInkMuted-light">
                  {t('obligations.summarySubtitle', { count: upcoming.length, amount: formatILS(upcomingTotalAgorot) })}
                </Text>
              </HeroPanel>
            </View>
          )}

          {upcoming.length === 0 && <EmptyState iconName="calendar-outline" message={t('obligations.empty')} hint={t('obligations.emptyHint')} />}
          {/* Responsive/desktop pass: same 2-column card grid as
              accounts/recurring/goals once there's more than one obligation,
              desktop only — `w-[48%]` + `justify-between` on a `flex-row
              flex-wrap` container is a calc()-free way to get two even
              columns in Yoga/RN's flexbox. Mobile/tablet keep the original
              single-column list untouched. */}
          {/* One card, hairline-separated rows, in the design system's own
              "מה מגיע" shape — the same CommitmentRow the dashboard uses. The
              obligations list had grown its own row (a category tile, the
              date as prose, the amount as plain text), which is exactly the
              drift §07 exists to prevent: the same commitment looked like
              two different things depending on which screen you opened.

              The urgency comes from commitmentUrgency, so a row here and an
              alert about the same charge can never disagree about how close
              it is. */}
          <View className="overflow-hidden rounded-card border border-border-light bg-surfaceMuted-light px-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
            {upcoming.map((item, index) => {
              const obligation = upcomingById.get(item.id)
              if (!obligation) return null
              const urgency = commitmentUrgency(today, obligation.due_date)
              const chipLabel =
                urgency.labelKey === 'inDays'
                  ? t('home.next.inDays', { count: urgency.count })
                  : t(`home.next.${urgency.labelKey}`)

              return (
                <View
                  key={obligation.id}
                  className={index > 0 ? 'border-t border-divider-light dark:border-divider-dark' : undefined}
                >
                  <CommitmentRow
                    testID={`obligation-${obligation.id}`}
                    date={obligation.due_date}
                    name={obligation.name}
                    amountAgorot={obligation.amount_agorot}
                    timeLabel={chipLabel}
                    tone={urgency.tone}
                    meta={obligation.is_shared ? t('transactions.form.shared') : t('transactions.form.personal')}
                    onPress={() => router.push(`/obligations/${obligation.id}`)}
                  />
                </View>
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
                                  className="text-body font-sansSemibold text-ink-light dark:text-ink-dark"
                                  numberOfLines={1}
                                >
                                  {obligation.name}
                                </Text>
                                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                                  {formatDateDisplay(obligation.due_date)}
                                  {' · '}
                                  {t(`obligations.status.${obligation.status}`)}
                                </Text>
                              </View>
                            </View>
                            <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
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
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Card>
          {/* Visual QA + Desktop Polish pass: name+amount and category+
              account pair into rows at desktop, matching every other add/
              edit form in this app — this form previously stayed a single
              stretched column even inside its own width-capped wrapper.
              Mobile/tablet untouched. */}
          <View className="web:desktop:flex-row web:desktop:gap-4">
            <View className="web:desktop:flex-1">
              <Input label={t('obligations.form.nameLabel')} value={name} onChangeText={setName} placeholder={t('obligations.form.namePlaceholder')} />
            </View>
            <View className="web:desktop:flex-1">
              <Input
                label={t('transactions.form.amountLabel')}
                value={amountText}
                onChangeText={setAmountText}
                placeholder={t('transactions.form.amountPlaceholder')}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <DatePickerField label={t('obligations.form.dueDateLabel')} value={dueDate} onChange={setDueDate} />
          <View className="web:desktop:flex-row web:desktop:gap-4">
            <View className="web:desktop:flex-1">
              <Select
                label={t('transactions.form.categoryLabel')}
                options={categoryOptions}
                value={categoryId}
                onChange={setCategoryId}
                placeholder={t('transactions.form.categoryPlaceholder')}
              />
            </View>
            <View className="web:desktop:flex-1">
              <Select
                label={t('transactions.form.accountLabel')}
                options={accountOptions}
                value={accountIdOverride}
                onChange={setAccountIdOverride}
                placeholder={t('transactions.form.accountPlaceholder')}
              />
            </View>
          </View>

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
          <View className="web:desktop:flex-row web:desktop:gap-2">
          <View className="web:desktop:flex-1">
          <Button title={t('obligations.form.submit')} onPress={handleCreate} loading={createObligation.isPending} />
          </View>
          <View className="mt-3 web:desktop:mt-0 web:desktop:flex-1">
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
          </Card>
        </View>
      ) : (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Button title={t('obligations.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
