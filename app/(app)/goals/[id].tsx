import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useSavingsGoals } from '@/features/savings/hooks/useSavingsGoals'
import { useUpdateSavingsGoal } from '@/features/savings/hooks/useUpdateSavingsGoal'
import { useUpdateSavingsGoalProgress } from '@/features/savings/hooks/useUpdateSavingsGoalProgress'
import { useDeleteSavingsGoal } from '@/features/savings/hooks/useDeleteSavingsGoal'
import { goalProgressPercent } from '@/features/savings/lib/goalProgress'
import { isConflictError, isNotFoundError } from '@/lib/mutations/concurrencyError'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import { ConflictModal } from '@/components/ui/ConflictModal'

type ConflictSource = 'edit' | 'progress' | 'delete'

export default function GoalDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { goals, isLoading: isGoalsLoading, refetch } = useSavingsGoals(householdId)
  const updateGoal = useUpdateSavingsGoal(householdId)
  const updateProgress = useUpdateSavingsGoalProgress(householdId)
  const deleteGoal = useDeleteSavingsGoal(householdId)

  const [nameText, setNameText] = useState('')
  const [targetText, setTargetText] = useState('')
  const [editValidationError, setEditValidationError] = useState<string | null>(null)

  const [progressText, setProgressText] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [conflict, setConflict] = useState<{ kind: 'conflict' | 'not_found'; source: ConflictSource } | null>(null)
  const [reloading, setReloading] = useState(false)

  const goal = goals.find((g) => g.id === id)

  // Prefill the edit form once, when this goal's data first loads — same
  // loaded-id guard pattern as app/(app)/transactions/[id].tsx (adjusted
  // during rendering rather than via useEffect), so it re-syncs only if the
  // route's id itself changes, never clobbering an in-progress edit on a
  // background refetch. editingVersion is pinned at this exact same moment
  // (ADR-036) — a conflict on the identity-edit save resets loadedGoalId to
  // force this block to re-fire against the freshly refetched row; nothing
  // else silently reruns it, so a dirty identity-edit draft survives an
  // unrelated progress/delete conflict on the same screen.
  const [loadedGoalId, setLoadedGoalId] = useState<string | null>(null)
  const [editingVersion, setEditingVersion] = useState<number | null>(null)
  if (goal && goal.id !== loadedGoalId) {
    setLoadedGoalId(goal.id)
    setNameText(goal.name)
    setTargetText(String(goal.target_agorot / 100))
    setEditingVersion(goal.version)
  }

  if (isHouseholdLoading || isGoalsLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!goal) {
    return (
      <Screen center>
        <ErrorMessage message={t('savings.errors.notFound')} />
      </Screen>
    )
  }

  const percent = goalProgressPercent(goal.current_agorot, goal.target_agorot)

  function handleSaveEdit() {
    if (!householdId || !goal || updateGoal.isPending || editingVersion === null) return
    setEditValidationError(null)

    if (!nameText.trim()) {
      setEditValidationError(t('savings.form.errors.missingName'))
      return
    }
    const parsed = agorotFromILS(targetText)
    if (!parsed.ok || parsed.agorot === null) {
      setEditValidationError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }

    updateGoal.mutate(
      {
        id: goal.id,
        expectedVersion: editingVersion,
        name: nameText.trim(),
        targetAgorot: parsed.agorot,
        accountId: goal.account_id,
        targetDate: goal.target_date,
        icon: goal.icon,
        color: goal.color,
      },
      {
        onError: (error) => {
          if (isConflictError(error)) {
            setConflict({ kind: 'conflict', source: 'edit' })
          } else if (isNotFoundError(error)) {
            setConflict({ kind: 'not_found', source: 'edit' })
          } else {
            setEditValidationError(t('savings.errors.generic'))
          }
        },
      }
    )
  }

  function handleUpdateProgress() {
    if (!householdId || !goal || updateProgress.isPending) return
    setValidationError(null)

    const parsed = agorotFromILS(progressText)
    if (!parsed.ok || parsed.agorot === null) {
      setValidationError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }

    updateProgress.mutate(
      {
        goalId: goal.id,
        expectedVersion: goal.version,
        householdId,
        actorId: user?.id ?? null,
        currentAgorot: parsed.agorot,
        wasCompleted: goal.is_completed,
        targetAgorot: goal.target_agorot,
      },
      {
        onSuccess: () => setProgressText(''),
        onError: (error) => {
          if (isConflictError(error)) {
            setConflict({ kind: 'conflict', source: 'progress' })
          } else if (isNotFoundError(error)) {
            setConflict({ kind: 'not_found', source: 'progress' })
          } else {
            setValidationError(t('savings.errors.generic'))
          }
        },
      }
    )
  }

  async function handleReloadFromConflict() {
    if (!conflict) return
    setReloading(true)
    await refetch()
    setReloading(false)
    const { source } = conflict
    setConflict(null)
    if (source === 'edit') {
      // Forces the loadedGoalId guard above to re-fire on next render,
      // re-snapshotting nameText/targetText/editingVersion from the now-
      // fresh cache — the progress form and any pending delete are
      // untouched.
      setLoadedGoalId(null)
    }
  }

  return (
    <Screen keyboardAvoiding>
      <Input label={t('savings.form.nameLabel')} value={nameText} onChangeText={setNameText} placeholder={t('savings.form.namePlaceholder')} />
      <Input
        label={t('savings.form.targetLabel')}
        value={targetText}
        onChangeText={setTargetText}
        placeholder={t('transactions.form.amountPlaceholder')}
        keyboardType="decimal-pad"
      />
      {(editValidationError || updateGoal.isError) && (
        <ErrorMessage message={editValidationError ?? t('savings.errors.generic')} />
      )}
      <Button title={t('savings.detail.save')} onPress={handleSaveEdit} loading={updateGoal.isPending} />

      <Text className="mb-2 mt-6 text-lg text-inkMuted-light dark:text-inkMuted-dark">
        {formatILS(goal.current_agorot)} / {formatILS(goal.target_agorot)}
      </Text>
      <View className="mb-6">
        <ProgressBar percent={percent} />
      </View>
      {goal.is_completed && (
        <Text className="mb-6 text-base font-semibold text-accent-light dark:text-accent-dark">
          {t('savings.completed')}
        </Text>
      )}

      <Input
        label={t('savings.detail.updateProgressLabel')}
        value={progressText}
        onChangeText={setProgressText}
        placeholder={t('transactions.form.amountPlaceholder')}
        keyboardType="decimal-pad"
      />
      {(validationError || updateProgress.isError) && (
        <ErrorMessage message={validationError ?? t('savings.errors.generic')} />
      )}
      <Button
        title={t('savings.detail.updateProgressSubmit')}
        onPress={handleUpdateProgress}
        loading={updateProgress.isPending}
      />

      <View className="mt-6">
        <Button
          title={t('savings.detail.delete')}
          variant="ghost"
          onPress={() => {
            setDeleteError(null)
            setConfirmDeleteVisible(true)
          }}
        />
        {deleteError && <ErrorMessage message={deleteError} />}
      </View>

      <Modal
        visible={confirmDeleteVisible}
        title={t('savings.detail.deleteConfirmTitle')}
        message={t('savings.detail.deleteConfirmMessage')}
        confirmLabel={t('savings.detail.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deleteGoal.isPending}
        onCancel={() => setConfirmDeleteVisible(false)}
        onConfirm={() =>
          deleteGoal.mutate(
            { id: goal.id, expectedVersion: goal.version },
            {
              onSuccess: () => {
                setConfirmDeleteVisible(false)
                router.back()
              },
              onError: (error) => {
                setConfirmDeleteVisible(false)
                if (isConflictError(error)) {
                  setConflict({ kind: 'conflict', source: 'delete' })
                } else if (isNotFoundError(error)) {
                  setConflict({ kind: 'not_found', source: 'delete' })
                } else {
                  setDeleteError(t('savings.errors.generic'))
                }
              },
            }
          )
        }
      />

      <ConflictModal
        visible={conflict !== null}
        kind={conflict?.kind ?? 'conflict'}
        loading={reloading}
        onReload={handleReloadFromConflict}
        onCancel={() => setConflict(null)}
      />
    </Screen>
  )
}
