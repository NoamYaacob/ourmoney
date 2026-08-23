// Credit-card instalment purchases — reached from Settings, not a tab, same
// posture as accounts/obligations/goals/recurring. An installment_plans row
// is the economic event (migration 016, ADR-037); this screen creates and
// lists plans, never individual instalment transactions — those materialize
// on their own via generate_installment_transactions(), mounted at app load
// (useGenerateInstallmentTransactions in app/(app)/_layout.tsx).

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useInstallmentPlans } from '@/features/installments/hooks/useInstallmentPlans'
import { useInstallmentMaterializedCounts } from '@/features/installments/hooks/useInstallmentMaterializedCounts'
import { useCreateInstallmentPlan } from '@/features/installments/hooks/useCreateInstallmentPlan'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { categoryIconName } from '@/features/categories/lib/categoryIcon'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
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
import { INLINE_FORM_WIDTH_CLASS } from '@/constants/layout'

export default function Installments() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const { plans, isLoading: isPlansLoading, error } = useInstallmentPlans(householdId)
  const { materializedCounts } = useInstallmentMaterializedCounts(householdId)
  const createPlan = useCreateInstallmentPlan(householdId)

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

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_he, iconName: categoryIconName(c.icon) }))
  const accountOptions = creditCardAccounts.map((a) => ({ value: a.id, label: a.name }))

  return (
    <Screen keyboardAvoiding width="wide">
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
        {t('installments.title')}
      </Text>

      {error ? (
        <ErrorMessage message={t('installments.errors.generic')} />
      ) : isLoading || isPlansLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {plans.length === 0 && <EmptyState iconName="card-outline" message={t('installments.empty')} />}
          <View className={plans.length > 1 ? 'web:desktop:flex-row web:desktop:flex-wrap web:desktop:justify-between' : undefined}>
            {plans.map((plan) => {
              const category = plan.category_id ? categories.find((c) => c.id === plan.category_id) : undefined
              const materialized = materializedCounts[plan.id] ?? 0
              const remainingAgorot = plan.total_agorot - plan.monthly_agorot * materialized
              return (
                <Pressable
                  key={plan.id}
                  onPress={() => router.push(`/installments/${plan.id}`)}
                  accessibilityRole="button"
                  className={plans.length > 1 ? 'mb-2 web:desktop:w-[48%]' : 'mb-2'}
                >
                  <Card>
                    <View className="flex-row items-center justify-between web:flex-row">
                      <View className="flex-1 flex-row items-center gap-3 web:flex-row">
                        <CategoryIcon icon={category?.icon} size="sm" />
                        <View className="flex-1">
                          <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
                            {plan.description}
                          </Text>
                          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                            {t('installments.installmentProgress', { materialized, total: plan.installment_count })}
                          </Text>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text
                          accessibilityLabel={`${t('installments.remainingAmount')} ${formatILS(remainingAgorot)}`}
                          className="text-body font-sansSemibold text-ink-light dark:text-ink-dark"
                        >
                          {formatILS(remainingAgorot)}
                        </Text>
                        <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                          {t('installments.monthlyAmount')}: {formatILS(plan.monthly_agorot)}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              )
            })}
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
                <View className="web:desktop:flex-row-reverse web:desktop:gap-2">
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
