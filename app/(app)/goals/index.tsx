// Reached from Settings, not a tab — route already reserved in
// docs/ARCHITECTURE.md.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useSavingsGoals } from '@/features/savings/hooks/useSavingsGoals'
import { useCreateSavingsGoal } from '@/features/savings/hooks/useCreateSavingsGoal'
import { goalProgressPercent } from '@/features/savings/lib/goalProgress'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { DatePickerField } from '@/components/ui/DatePickerField'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { INLINE_FORM_WIDTH_CLASS } from '@/constants/layout'

export default function Goals() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { goals, isLoading: isGoalsLoading, error } = useSavingsGoals(householdId)
  const createGoal = useCreateSavingsGoal(householdId)

  const isLoading = isHouseholdLoading || isAccountsLoading

  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')
  const [targetText, setTargetText] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [hasTargetDate, setHasTargetDate] = useState(false)
  const [targetDateText, setTargetDateText] = useState(localDateString())
  const [validationError, setValidationError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setTargetText('')
    setAccountId(null)
    setHasTargetDate(false)
    setTargetDateText(localDateString())
    setIsAdding(false)
  }

  function handleCreate() {
    if (!householdId || createGoal.isPending) return
    setValidationError(null)

    if (!name.trim()) {
      setValidationError(t('savings.form.errors.missingName'))
      return
    }
    const parsed = agorotFromILS(targetText)
    if (!parsed.ok || parsed.agorot === null) {
      setValidationError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }

    createGoal.mutate(
      {
        householdId,
        name: name.trim(),
        targetAgorot: parsed.agorot,
        accountId,
        targetDate: hasTargetDate ? targetDateText : null,
      },
      { onSuccess: resetForm }
    )
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

  return (
    <Screen width="wide">
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
        {t('savings.title')}
      </Text>

      {error ? (
        <ErrorMessage message={t('savings.errors.generic')} />
      ) : isLoading || isGoalsLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {/* No actionLabel/onAction — the persistent "Add goal" button
              below already covers it (mobile-expo-reviewer finding, same
              as accounts/index.tsx and recurring/index.tsx). */}
          {goals.length === 0 && <EmptyState icon="🏆" message={t('savings.empty')} />}
          {/* Responsive/desktop pass: a 2-column card grid once there's more
              than one goal, desktop only — same calc()-free pattern as
              accounts/index.tsx. */}
          <View className={goals.length > 1 ? 'web:desktop:flex-row web:desktop:flex-wrap web:desktop:justify-between' : undefined}>
          {goals.map((goal) => {
            const percent = goalProgressPercent(goal.current_agorot, goal.target_agorot)
            return (
              <Pressable
                key={goal.id}
                onPress={() => router.push(`/goals/${goal.id}`)}
                accessibilityRole="button"
                className={goals.length > 1 ? 'mb-2 web:desktop:w-[48%]' : 'mb-2'}
              >
                <Card>
                  <View className="mb-1 flex-row items-center justify-between">
                    <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">{goal.name}</Text>
                    {goal.is_completed && (
                      <Text className="text-xs font-semibold text-accent-light dark:text-accent-dark">
                        {t('savings.completed')}
                      </Text>
                    )}
                  </View>
                  <Text className="mb-2 text-xs text-inkMuted-light dark:text-inkMuted-dark">
                    {formatILS(goal.current_agorot)} / {formatILS(goal.target_agorot)}
                  </Text>
                  <ProgressBar percent={percent} positiveAtLimit />
                </Card>
              </Pressable>
            )
          })}
          </View>
        </>
      )}

      {isAdding ? (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Input label={t('savings.form.nameLabel')} value={name} onChangeText={setName} placeholder={t('savings.form.namePlaceholder')} />
          <Input
            label={t('savings.form.targetLabel')}
            value={targetText}
            onChangeText={setTargetText}
            placeholder={t('transactions.form.amountPlaceholder')}
            keyboardType="decimal-pad"
          />
          <Select
            label={t('savings.form.accountLabel')}
            options={accountOptions}
            value={accountId}
            onChange={setAccountId}
            placeholder={t('transactions.form.accountPlaceholder')}
          />
          <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('savings.form.targetDateLabel')}</Text>
          <View className="mb-4 flex-row gap-2">
            <Chip label={t('savings.form.hasTargetDate')} selected={hasTargetDate} onPress={() => setHasTargetDate(true)} />
            <Chip label={t('savings.form.noTargetDate')} selected={!hasTargetDate} onPress={() => setHasTargetDate(false)} />
          </View>
          {hasTargetDate && (
            <DatePickerField label={t('savings.form.targetDateLabel')} value={targetDateText} onChange={setTargetDateText} />
          )}
          {(validationError || createGoal.isError) && (
            <ErrorMessage message={validationError ?? t('savings.errors.generic')} />
          )}
          <Button title={t('savings.form.submit')} onPress={handleCreate} loading={createGoal.isPending} />
        </View>
      ) : (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Button title={t('savings.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
