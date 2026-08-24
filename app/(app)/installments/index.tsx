// Credit-card instalment purchases — reached from Settings, not a tab, same
// posture as accounts/obligations/goals/recurring. An installment_plans row
// is the economic event (migration 016, ADR-037); this screen creates and
// lists plans, never individual instalment transactions — those materialize
// on their own via generate_installment_transactions(), mounted at app load
// (useGenerateInstallmentTransactions in app/(app)/_layout.tsx).

import { useState } from 'react'
import { Platform, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useInstallmentPlans } from '@/features/installments/hooks/useInstallmentPlans'
import { useInstallmentMaterializedCounts } from '@/features/installments/hooks/useInstallmentMaterializedCounts'
import { useCreateInstallmentPlan } from '@/features/installments/hooks/useCreateInstallmentPlan'
import { useUpcomingCommitments } from '@/features/cashflow/hooks/useUpcomingCommitments'
import { getCurrentBillingCycleRange } from '@/features/accounts/lib/creditCardCycle'
import { daysBetween } from '@/lib/engines/alerts/alertSeverity'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { sumAgorot } from '@/lib/money/arithmetic'
import { formatDateDisplay } from '@/lib/dates/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { categoryIconName } from '@/features/categories/lib/categoryIcon'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { DatePickerField } from '@/components/ui/DatePickerField'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { Money } from '@/components/ui/Money'
import { CountdownRing } from '@/components/ui/CountdownRing'
import { DESKTOP_BREAKPOINT_PX, INLINE_FORM_WIDTH_CLASS, DESKTOP_CARD_CLASS } from '@/constants/layout'
import { InstallmentPlanRow } from '@/features/installments/components/InstallmentPlanRow'

export default function Installments() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const { plans, isLoading: isPlansLoading, error } = useInstallmentPlans(householdId)
  const { materializedCounts } = useInstallmentMaterializedCounts(householdId)
  const createPlan = useCreateInstallmentPlan(householdId)
  // Desktop Claude Design pass: the mockup's billing-cycle cards, at the
  // top of what it calls "אשראי ותשלומים" (Credit & Payments) — this
  // screen's own nav destination already carries that label (see
  // _layout.tsx's RAIL_GROUPS). Reuses useUpcomingCommitments' own
  // credit_card_cycle entries (the exact same current-cycle-spend figure
  // Dashboard's "מה מגיע" panel and Safe-to-Spend already reserve against)
  // rather than a second, parallel query — only the cycle's own start/end
  // dates (for the countdown ring) are computed fresh here, via the same
  // pure getCurrentBillingCycleRange every other current-cycle figure in
  // this app already goes through.
  const { commitments } = useUpcomingCommitments(householdId)
  // Same route split the other redesigned screens make.
  const { width } = useWindowDimensions()
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT_PX
  const creditCardCycleCommitments = commitments.filter((c) => c.source === 'credit_card_cycle')
  const today = localDateString()

  const isLoading = isHouseholdLoading || isAccountsLoading || isCategoriesLoading

  const creditCardAccounts = accounts.filter((a) => a.type === 'credit_card' && a.is_active)

  const [isAdding, setIsAdding] = useState(false)
  const [description, setDescription] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [totalAmountText, setTotalAmountText] = useState('')
  const [installmentCountText, setInstallmentCountText] = useState('')
  const [firstChargeDate, setFirstChargeDate] = useState(localDateString())
  const [accountId, setAccountId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [isShared, setIsShared] = useState(true)
  const [validationError, setValidationError] = useState<string | null>(null)

  function resetForm() {
    setDescription('')
    setMerchantName('')
    setTotalAmountText('')
    setInstallmentCountText('')
    setFirstChargeDate(localDateString())
    setAccountId(null)
    setCategoryId(null)
    setIsShared(true)
    setIsAdding(false)
  }

  function handleCreate() {
    if (!householdId || createPlan.isPending) return
    setValidationError(null)

    if (!description.trim()) {
      setValidationError(t('installments.form.errors.missingDescription'))
      return
    }
    if (!accountId) {
      setValidationError(t('installments.form.errors.missingAccount'))
      return
    }
    const parsedTotal = agorotFromILS(totalAmountText)
    if (!parsedTotal.ok || parsedTotal.agorot === null || parsedTotal.agorot <= 0) {
      setValidationError(t('installments.form.errors.invalidTotalAmount'))
      return
    }
    const installmentCount = Number(installmentCountText.trim())
    if (!Number.isInteger(installmentCount) || installmentCount < 1) {
      setValidationError(t('installments.form.errors.invalidInstallmentCount'))
      return
    }
    if (!firstChargeDate) {
      setValidationError(t('installments.form.errors.missingFirstChargeDate'))
      return
    }

    createPlan.mutate(
      {
        householdId,
        accountId,
        categoryId,
        merchantName: merchantName.trim() || null,
        description: description.trim(),
        totalAgorot: parsedTotal.agorot,
        installmentCount,
        firstChargeDate,
        isShared,
      },
      { onSuccess: resetForm }
    )
  }

  // What the whole set of plans still costs. Every open plan reserves its
  // monthly figure out of "פנוי באמת" until its last charge, so the column
  // total is a fact about this month, not just a sum of history.
  const openPlans = plans.filter((plan) => (materializedCounts[plan.id] ?? 0) < plan.installment_count)
  const totalRemainingAgorot = sumAgorot(
    openPlans.map((plan) => plan.total_agorot - plan.monthly_agorot * (materializedCounts[plan.id] ?? 0))
  )
  const totalMonthlyAgorot = sumAgorot(openPlans.map((plan) => plan.monthly_agorot))

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_he, iconName: categoryIconName(c.icon) }))
  const accountOptions = creditCardAccounts.map((a) => ({ value: a.id, label: a.name }))

  return (
    <Screen keyboardAvoiding width="wide">
      {/* Desktop Claude Design pass: the mockup titles this screen "אשראי
          ותשלומים" (Credit & Payments), matching its nav destination's own
          label — mobile keeps its original, narrower "רכישות בתשלומים"
          title, since mobile shows only the installments list below, never
          the billing-cycle cards. Same two-copy toggle pattern this app
          already uses for compact-vs-full empty states. */}
      {/* The phone frame titles this screen the same as its nav destination
          does — "אשראי ותשלומים", not the narrower "רכישות בתשלומים", because
          the billing-cycle cards below are half of what it shows. Desktop
          gets the same title from the shell bar (DesktopTopBar). */}
      <Text className="mb-4 text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('nav.creditAndPayments')}
      </Text>

      {creditCardCycleCommitments.length > 0 && (
        /* Both frames lead with these. `OurMoney - Mobile.dc.html` screen 09
           stacks one card per credit card; the desktop frame sets them side
           by side. They had been desktop-only, which left the phone opening
           a screen called "אשראי ותשלומים" with no אשראי on it. */
        <View className="mb-5 gap-3 web:desktop:flex-row web:desktop:gap-4">
          {creditCardCycleCommitments.map((commitment) => {
            const account = creditCardAccounts.find((a) => a.id === commitment.sourceId)
            if (!account || account.billing_cycle_day === null) return null
            const range = getCurrentBillingCycleRange(account.billing_cycle_day, today)
            const cycleLengthDays = Math.max(1, daysBetween(range.start, range.end))
            const daysElapsed = Math.max(0, daysBetween(range.start, today))
            const daysLeft = Math.max(0, daysBetween(today, range.end))
            const installmentAgorot = commitment.installmentAgorot ?? 0
            return (
              <View key={account.id} className={`web:desktop:flex-1 ${DESKTOP_CARD_CLASS}`}>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-meta font-sansSemibold tracking-[0.1em] text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                      {account.name}
                    </Text>
                    <Text className="mt-0.5 text-heading font-heeboBold text-ink-light dark:text-ink-dark web:desktop:text-[18px]" numberOfLines={1}>
                      {t('installments.cycleCards.nextCharge')} · {formatDateDisplay(range.end)}
                    </Text>
                  </View>
                  <CountdownRing percentElapsed={Math.min(100, (daysElapsed / cycleLengthDays) * 100)} daysLeft={daysLeft} />
                </View>
                <View className="mt-3.5">
                  <Money agorot={commitment.amountAgorot} size="display" />
                </View>

                {/* What this statement is MADE of. The frame's own subtitle
                    for this screen is "כמה יירד ומתי, ומה מזה תשלומים", and
                    a household looking at a card bill wants to know how much
                    of it is a decision they already made months ago. The two
                    segments are the same total split, never a second sum. */}
                <View className="mt-3.5 h-2.5 flex-row gap-0.5 overflow-hidden rounded-full">
                  <View
                    className="bg-inkMuted-light dark:bg-inkMuted-dark"
                    style={{ flexGrow: Math.max(0, commitment.amountAgorot - installmentAgorot), flexBasis: 0 }}
                  />
                  {installmentAgorot > 0 && (
                    <View className="bg-accent-light dark:bg-accent-dark" style={{ flexGrow: installmentAgorot, flexBasis: 0 }} />
                  )}
                </View>

                <View className="mt-3 gap-2">
                  <View className="flex-row items-center gap-2">
                    <View className="h-2.5 w-2.5 rounded-[3px] bg-inkMuted-light dark:bg-inkMuted-dark" />
                    <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                      {t('installments.cycleCards.regularSpend')}
                    </Text>
                    <View className="ms-auto">
                      <Money agorot={commitment.amountAgorot - installmentAgorot} size="caption" tone="muted" />
                    </View>
                  </View>
                  {installmentAgorot > 0 && (
                    <View className="flex-row items-center gap-2">
                      <View className="h-2.5 w-2.5 rounded-[3px] bg-accent-light dark:bg-accent-dark" />
                      <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                        {t('installments.cycleCards.installmentSpend')}
                      </Text>
                      <View className="ms-auto">
                        <Money agorot={installmentAgorot} size="caption" tone="muted" />
                      </View>
                    </View>
                  )}
                </View>

                <Text className="mt-3 border-t border-divider-light pt-3 text-caption font-sans text-inkMuted-light dark:border-divider-dark dark:text-inkMuted-dark">
                  {t('installments.cycleCards.range', { start: formatDateDisplay(range.start), end: formatDateDisplay(range.end) })}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      {plans.length > 0 && (
        // The list's own head, as both frames draw it: the title, then what
        // the whole set costs — the total still owed and what it takes out
        // of each month. A household reading a list of purchases needs the
        // column total before the rows, not after them.
        <View className="mb-3 mt-2">
          {/* Stacks on a phone. Two figures and a title do not share a
              390px line without one of them truncating, and truncating the
              total is worse than spending a row on it. */}
          <View className="gap-1 web:desktop:flex-row web:desktop:items-baseline web:desktop:justify-between web:desktop:gap-3">
            <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark web:desktop:text-[19px]">
              {t('installments.listTitle')}
            </Text>
            <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {t('installments.listTotals', {
                remaining: formatILS(totalRemainingAgorot),
                monthly: formatILS(totalMonthlyAgorot),
              })}
            </Text>
          </View>
          <Text className="mt-1 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
            {t('installments.listExplainer', { monthly: formatILS(totalMonthlyAgorot) })}
          </Text>
        </View>
      )}

      {error ? (
        <ErrorMessage message={t('installments.errors.generic')} />
      ) : isLoading || isPlansLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {plans.length === 0 && <EmptyState iconName="card-outline" message={t('installments.empty')} hint={t('installments.emptyHint')} />}
          {/* The phone stacks cards; desktop lays each plan across one line
              with its own figure columns. Both carry the same pill track —
              a plan is a countable number of payments, not a percentage. */}
          <View className={isDesktopWeb ? undefined : 'gap-2.5'}>
            {plans.map((plan) => (
              <InstallmentPlanRow
                key={plan.id}
                plan={plan}
                paidCount={materializedCounts[plan.id] ?? 0}
                categoryIcon={plan.category_id ? categories.find((c) => c.id === plan.category_id)?.icon : undefined}
                accountName={accounts.find((a) => a.id === plan.account_id)?.name}
                variant={isDesktopWeb ? 'row' : 'card'}
              />
            ))}
          </View>
        </>
      )}

      {isAdding ? (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Card>
            {creditCardAccounts.length === 0 ? (
              <>
                <ErrorMessage message={t('installments.noCreditCardAccounts')} />
                {/* mobile-expo-reviewer finding: this branch also renders
                    transiently while useAccounts is still resolving (its
                    default is an empty array until the query settles), and
                    for a household that genuinely has zero credit-card
                    accounts it renders permanently — either way, without an
                    explicit way back, isAdding stayed true forever with no
                    control left to close the form. */}
                <View className="mt-3">
                  <Button title={t('common.cancel')} variant="secondary" onPress={() => setIsAdding(false)} />
                </View>
              </>
            ) : (
              <>
                <View className="web:desktop:flex-row web:desktop:gap-4">
                  <View className="web:desktop:flex-1">
                    <Input
                      label={t('installments.form.descriptionLabel')}
                      value={description}
                      onChangeText={setDescription}
                      placeholder={t('installments.form.descriptionPlaceholder')}
                    />
                  </View>
                  <View className="web:desktop:flex-1">
                    <Input
                      label={t('installments.form.merchantLabel')}
                      value={merchantName}
                      onChangeText={setMerchantName}
                      placeholder={t('installments.form.merchantPlaceholder')}
                    />
                  </View>
                </View>
                <View className="web:desktop:flex-row web:desktop:gap-4">
                  <View className="web:desktop:flex-1">
                    <Input
                      label={t('installments.form.totalAmountLabel')}
                      value={totalAmountText}
                      onChangeText={setTotalAmountText}
                      placeholder={t('installments.form.totalAmountPlaceholder')}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View className="web:desktop:flex-1">
                    <Input
                      label={t('installments.form.installmentCountLabel')}
                      value={installmentCountText}
                      onChangeText={setInstallmentCountText}
                      placeholder={t('installments.form.installmentCountPlaceholder')}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <DatePickerField
                  label={t('installments.form.firstChargeDateLabel')}
                  value={firstChargeDate}
                  onChange={setFirstChargeDate}
                />
                <View className="web:desktop:flex-row web:desktop:gap-4">
                  <View className="web:desktop:flex-1">
                    <Select
                      label={t('transactions.form.accountLabel')}
                      options={accountOptions}
                      value={accountId}
                      onChange={setAccountId}
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

                <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('transactions.form.sharedLabel')}</Text>
                <View className="mb-4 flex-row gap-2">
                  <Chip label={t('transactions.form.shared')} selected={isShared} onPress={() => setIsShared(true)} />
                  <Chip label={t('transactions.form.personal')} selected={!isShared} onPress={() => setIsShared(false)} />
                </View>

                {(validationError || createPlan.isError) && (
                  <ErrorMessage message={validationError ?? t('installments.errors.generic')} />
                )}
                <View className="web:desktop:flex-row web:desktop:gap-2">
                  <View className="web:desktop:flex-1">
                    <Button title={t('installments.form.submit')} onPress={handleCreate} loading={createPlan.isPending} />
                  </View>
                  <View className="mt-3 web:desktop:mt-0 web:desktop:flex-1">
                    <Button
                      title={t('common.cancel')}
                      variant="secondary"
                      disabled={createPlan.isPending}
                      onPress={() => {
                        setValidationError(null)
                        resetForm()
                      }}
                    />
                  </View>
                </View>
              </>
            )}
          </Card>
        </View>
      ) : (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Button title={t('installments.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
