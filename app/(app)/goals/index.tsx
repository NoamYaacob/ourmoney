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
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'

export default function Goals() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { isLoading: isAccountsLoading } = useAccounts(householdId)
  const { goals, isLoading: isGoalsLoading, error } = useSavingsGoals(householdId)
  const createGoal = useCreateSavingsGoal(householdId)

  const isLoading = isHouseholdLoading || isAccountsLoading

  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')
  const [targetText, setTargetText] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

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
      { householdId, name: name.trim(), targetAgorot: parsed.agorot },
      {
        onSuccess: () => {
          setName('')
          setTargetText('')
          setIsAdding(false)
        },
      }
    )
  }

  return (
    <Screen>
      <Text className="mb-6 text-2xl font-bold text-ink-light dark:text-ink-dark">{t('savings.title')}</Text>

      {error ? (
        <ErrorMessage message={t('savings.errors.generic')} />
      ) : isLoading || isGoalsLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {goals.length === 0 && (
            <EmptyState
              icon="🏆"
              message={t('savings.empty')}
              actionLabel={t('savings.addButton')}
              onAction={() => setIsAdding(true)}
            />
          )}
          {goals.map((goal) => {
            const percent = goalProgressPercent(goal.current_agorot, goal.target_agorot)
            return (
              <Pressable
                key={goal.id}
                onPress={() => router.push(`/goals/${goal.id}`)}
                accessibilityRole="button"
                className="mb-2"
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
                  <ProgressBar percent={percent} />
                </Card>
              </Pressable>
            )
          })}
        </>
      )}

      {isAdding ? (
        <View className="mt-4">
          <Input label={t('savings.form.nameLabel')} value={name} onChangeText={setName} placeholder={t('savings.form.namePlaceholder')} />
          <Input
            label={t('savings.form.targetLabel')}
            value={targetText}
            onChangeText={setTargetText}
            placeholder={t('transactions.form.amountPlaceholder')}
            keyboardType="decimal-pad"
          />
          {(validationError || createGoal.isError) && (
            <ErrorMessage message={validationError ?? t('savings.errors.generic')} />
          )}
          <Button title={t('savings.form.submit')} onPress={handleCreate} loading={createGoal.isPending} />
        </View>
      ) : (
        <View className="mt-4">
          <Button title={t('savings.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
