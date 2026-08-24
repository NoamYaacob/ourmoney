// Reached from Settings, not a tab — route already reserved in
// docs/ARCHITECTURE.md.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { useSavingsGoals } from '@/features/savings/hooks/useSavingsGoals'
import { useCreateSavingsGoal } from '@/features/savings/hooks/useCreateSavingsGoal'
import { goalProgressPercent, resolveGoalCurrentAgorot, resolveGoalIsCompleted } from '@/features/savings/lib/goalProgress'
import { calculateSavingsPace } from '@/lib/engines/savings/calculateSavingsPace'
import { formatDateDisplay } from '@/lib/dates/format'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { Screen } from '@/components/ui/Screen'
import { PlanningTabs } from '@/components/ui/PlanningTabs'
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
import { StatusChip } from '@/components/ui/StatusChip'
import { INLINE_FORM_WIDTH_CLASS } from '@/constants/layout'

export default function Goals() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { balances } = useAccountBalances(householdId)
  const { goals, isLoading: isGoalsLoading, error, refetch } = useSavingsGoals(householdId)
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
    <Screen onBack={() => router.back()} width="wide">
      <Text className="mb-4 text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('savings.title')}
      </Text>

      <PlanningTabs active="goals" />

      {error ? (
        <ErrorMessage message={t('savings.errors.generic')} onRetry={refetch} />
      ) : isLoading || isGoalsLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {/* No actionLabel/onAction — the persistent "Add goal" button
              below already covers it (mobile-expo-reviewer finding, same
              as accounts/index.tsx and recurring/index.tsx). */}
          {goals.length === 0 && <EmptyState iconName="flag-outline" message={t('savings.empty')} />}
          {/* Responsive/desktop pass: a 2-column card grid once there's more
              than one goal, desktop only — same calc()-free pattern as
              accounts/index.tsx. */}
          {/* One column of rows inside one card, as both frames draw it —
              name, pace chip and percent on the head line, the amounts and
              target date under it, the bar, then a sentence saying what the
              pace actually means. A grid of cards answered "how many goals
              are there"; this answers "are we going to make it". */}
          <View className={goals.length > 0 ? 'gap-4 rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark' : undefined}>
          {goals.map((goal) => {
            const currentAgorot = resolveGoalCurrentAgorot(goal, balances)
            const isCompleted = resolveGoalIsCompleted(goal, balances)
            const percent = goalProgressPercent(currentAgorot, goal.target_agorot)
            // Same single-source-of-truth reasoning as goals/[id].tsx: a
            // goal reads as "behind" from the pace calculation's own
            // remainingAgorot/isOnTrack, not from the separately-derived
            // isCompleted flag.
            const pace = calculateSavingsPace({
              currentAgorot,
              targetAgorot: goal.target_agorot,
              targetDate: goal.target_date,
              today: localDateString(),
            })
            const isBehind = pace !== null && pace.remainingAgorot > 0 && !pace.isOnTrack
            return (
              <Pressable
                key={goal.id}
                onPress={() => router.push(`/goals/${goal.id}`)}
                accessibilityRole="button"
                accessibilityLabel={goal.name}
              >
                <View className="flex-row flex-wrap items-baseline gap-2">
                  <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">{goal.name}</Text>
                  {isCompleted ? (
                    <StatusChip label={t('savings.completed')} tone="positive" />
                  ) : isBehind ? (
                    <StatusChip
                      label={t(pace?.isOverdue ? 'savings.pace.overdue' : 'savings.pace.behind')}
                      tone="warning"
                    />
                  ) : (
                    pace !== null && <StatusChip label={t('savings.pace.onTrack')} tone="positive" />
                  )}
                  <Text
                    className="ms-auto text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {percent}%
                  </Text>
                </View>
                <Text className="mb-1.5 mt-0.5 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                  {t('savings.progressOf', {
                    current: formatILS(currentAgorot),
                    target: formatILS(goal.target_agorot),
                  })}
                  {goal.target_date ? ` · ${t('savings.targetOn', { date: formatDateDisplay(goal.target_date) })}` : ''}
                </Text>
                <ProgressBar percent={percent} positiveAtLimit />
                {/* What the pace means, in a sentence. Every figure in it
                    comes from calculateSavingsPace — the engine already
                    computes the required monthly saving and whether the
                    target is still reachable; the list simply never said
                    so. Nothing here is estimated: a goal with no target
                    date says exactly that rather than projecting one. */}
                {!isCompleted && (
                  <Text className="mt-1.5 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                    {pace === null
                      ? t('savings.pace.noDateSentence', {
                          amount: formatILS(Math.max(0, goal.target_agorot - currentAgorot)),
                        })
                      : pace.isOverdue
                        ? t('savings.pace.behindSentence', { amount: formatILS(pace.remainingAgorot) })
                        : t('savings.pace.onTrackSentence', {
                            amount: formatILS(pace.remainingAgorot),
                            monthly: formatILS(pace.requiredMonthlyAgorot),
                          })}
                  </Text>
                )}
              </Pressable>
            )
          })}
          </View>
        </>
      )}

      {isAdding ? (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Card>
          {/* Visual QA + Desktop Polish pass: name+target pair into a row at
              desktop (the same field-pairing pattern used by every other
              add/edit form in this app), and the form now sits inside a
              Card so it reads as one cohesive block rather than fields
              floating loose below the list. Mobile/tablet untouched. */}
          <View className="web:desktop:flex-row web:desktop:gap-4">
            <View className="web:desktop:flex-1">
              <Input label={t('savings.form.nameLabel')} value={name} onChangeText={setName} placeholder={t('savings.form.namePlaceholder')} />
            </View>
            <View className="web:desktop:flex-1">
              <Input
                label={t('savings.form.targetLabel')}
                value={targetText}
                onChangeText={setTargetText}
                placeholder={t('transactions.form.amountPlaceholder')}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
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
          </Card>
        </View>
      ) : (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Button title={t('savings.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
