import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useSavingsGoals } from '@/features/savings/hooks/useSavingsGoals'
import { useUpdateSavingsGoal } from '@/features/savings/hooks/useUpdateSavingsGoal'
import { useUpdateSavingsGoalProgress } from '@/features/savings/hooks/useUpdateSavingsGoalProgress'
import { useDeleteSavingsGoal } from '@/features/savings/hooks/useDeleteSavingsGoal'
import { goalProgressPercent } from '@/features/savings/lib/goalProgress'
import { isConflictError, isNotFoundError } from '@/lib/mutations/concurrencyError'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { DatePickerField } from '@/components/ui/DatePickerField'
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
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { goals, isLoading: isGoalsLoading, refetch } = useSavingsGoals(householdId)
  const updateGoal = useUpdateSavingsGoal(householdId)
  const updateProgress = useUpdateSavingsGoalProgress(householdId)
  const deleteGoal = useDeleteSavingsGoal(householdId)

  const [nameText, setNameText] = useState('')
  const [targetText, setTargetText] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [hasTargetDate, setHasTargetDate] = useState(false)
  const [targetDateText, setTargetDateText] = useState(localDateString())
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
    setAccountId(goal.account_id)
    setHasTargetDate(goal.target_date !== null)
    setTargetDateText(goal.target_date ?? localDateString())
    setEditingVersion(goal.version)
  }

  // The progress form has no "start editing" gesture — it's always live,
  // like the identity form above — so it needs the identical pinning
  // discipline (ADR-036), via its OWN guard rather than piggybacking on
  // loadedGoalId: a bug found in the UX-completeness audit had
  // handleUpdateProgress read goal.version live from the query cache at
  // submit time. TanStack Query's 30s staleTime plus refetch-on-focus
  // (lib/queryClient.ts) means a background/foreground cycle mid-compose
  // can silently advance that live value — so a submit's expectedVersion
  // would match the row's TRUE current version (the CAS check passes)
  // while the typed amount was composed against an amount the user already
  // can no longer see reflected in that version, silently discarding a
  // concurrent edit with no conflict ever shown. Pinning here, like
  // editingVersion above, closes it: only re-fires on an actual new goal
  // load or an explicit reload-from-conflict for THIS form (see
  // handleReloadFromConflict), never on a silent background refetch.
  const [loadedProgressGoalId, setLoadedProgressGoalId] = useState<string | null>(null)
  const [progressExpectedVersion, setProgressExpectedVersion] = useState<number | null>(null)
  if (goal && goal.id !== loadedProgressGoalId) {
    setLoadedProgressGoalId(goal.id)
    setProgressExpectedVersion(goal.version)
  }

  if (isHouseholdLoading || isAccountsLoading || isGoalsLoading) {
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
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

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
        accountId,
        targetDate: hasTargetDate ? targetDateText : null,
        icon: goal.icon,
        color: goal.color,
      },
      {
        // qa-adversarial-reviewer finding: a successful save never advanced
        // the pinned editingVersion — only a fresh goal load or an explicit
        // conflict-reload did. A second, entirely uncontested identity edit
        // later in the same visit would then submit the now-stale pinned
        // version and spuriously conflict against the server's own prior
        // write, even though nobody else touched the row. The RPC's own
        // success response already carries the new version — pin that
        // directly instead of waiting for the next load/reload to catch up.
        onSuccess: (result) => setEditingVersion(result.version),
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
    if (!householdId || !goal || updateProgress.isPending || progressExpectedVersion === null) return
    setValidationError(null)

    const parsed = agorotFromILS(progressText)
    if (!parsed.ok || parsed.agorot === null) {
      setValidationError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }

    updateProgress.mutate(
      {
        goalId: goal.id,
        expectedVersion: progressExpectedVersion,
        householdId,
        actorId: user?.id ?? null,
        currentAgorot: parsed.agorot,
        wasCompleted: goal.is_completed,
        targetAgorot: goal.target_agorot,
      },
      {
        // Same fix as handleSaveEdit's onSuccess above, for the same reason
        // (qa-adversarial-reviewer finding) — without re-pinning here, a
        // second uncontested progress update in the same visit would submit
        // the stale pre-first-update version and spuriously conflict.
        onSuccess: (result) => {
          setProgressText('')
          setProgressExpectedVersion(result.version)
        },
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
      // fresh cache — the progress form's own pin and any pending delete
      // are untouched.
      setLoadedGoalId(null)
    }
    if (source === 'progress') {
      // Mirrors the edit branch, but scoped to the progress form's own
      // independent pin (architecture-reviewer finding: without this, a
      // progress conflict's reload never re-fired the progress guard, so
      // progressExpectedVersion stayed stuck at the stale value and the
      // very next submit would immediately conflict again). Also discards
      // the stale typed amount — the current/target figures it was composed
      // against just changed underneath it — matching the "reload discards
      // the stale draft" policy every other conflict reload in this app
      // already follows (ADR-036 point 10).
      setLoadedProgressGoalId(null)
      setProgressText('')
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
      {(editValidationError || updateGoal.isError) && (
        <ErrorMessage message={editValidationError ?? t('savings.errors.generic')} />
      )}
      <Button title={t('savings.detail.save')} onPress={handleSaveEdit} loading={updateGoal.isPending} />

      <Text className="mb-2 mt-6 text-lg text-inkMuted-light dark:text-inkMuted-dark">
        {formatILS(goal.current_agorot)} / {formatILS(goal.target_agorot)}
      </Text>
      <View className="mb-6">
        <ProgressBar percent={percent} positiveAtLimit />
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
