import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { useSavingsGoals } from '@/features/savings/hooks/useSavingsGoals'
import { useUpdateSavingsGoal } from '@/features/savings/hooks/useUpdateSavingsGoal'
import { useUpdateSavingsGoalProgress } from '@/features/savings/hooks/useUpdateSavingsGoalProgress'
import { useDeleteSavingsGoal } from '@/features/savings/hooks/useDeleteSavingsGoal'
import { goalProgressPercent, resolveGoalCurrentAgorot, resolveGoalIsCompleted } from '@/features/savings/lib/goalProgress'
import { calculateSavingsPace } from '@/lib/engines/savings/calculateSavingsPace'
import { formatDateDisplay } from '@/lib/dates/format'
import type { SavingsGoalProgressSource } from '@/types/app'
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
import { DESKTOP_PANEL_CLASS } from '@/constants/layout'

type ConflictSource = 'edit' | 'progress' | 'delete'

export default function GoalDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { balances } = useAccountBalances(householdId)
  const { goals, isLoading: isGoalsLoading, refetch } = useSavingsGoals(householdId)
  const updateGoal = useUpdateSavingsGoal(householdId)
  const updateProgress = useUpdateSavingsGoalProgress(householdId)
  const deleteGoal = useDeleteSavingsGoal(householdId)

  const [nameText, setNameText] = useState('')
  const [targetText, setTargetText] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [progressSource, setProgressSource] = useState<SavingsGoalProgressSource>('manual')
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
    setProgressSource(goal.progress_source)
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
      <Screen onBack={() => router.back()} center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!goal) {
    return (
      <Screen onBack={() => router.back()} center>
        <ErrorMessage message={t('savings.errors.notFound')} />
      </Screen>
    )
  }

  const resolvedCurrentAgorot = resolveGoalCurrentAgorot(goal, balances)
  const resolvedIsCompleted = resolveGoalIsCompleted(goal, balances)
  const percent = goalProgressPercent(resolvedCurrentAgorot, goal.target_agorot)
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  // Single source of truth for "is there anything left to project": the
  // pace calculation's own remainingAgorot, not the separate
  // resolveGoalIsCompleted signal — that reads is_completed, a stored
  // column a manual goal's DB trigger derives from current_agorot, which
  // is one more hop than comparing the two live numbers already in hand
  // here and could in principle drift a render behind them.
  const pace = calculateSavingsPace({
    currentAgorot: resolvedCurrentAgorot,
    targetAgorot: goal.target_agorot,
    targetDate: goal.target_date,
    today: localDateString(),
  })
  const showPace = pace !== null && pace.remainingAgorot > 0

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
        progressSource,
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
          } else if (error instanceof Error && error.message === 'account_already_linked') {
            setEditValidationError(t('savings.errors.accountAlreadyLinked'))
          } else if (error instanceof Error && error.message === 'linked_account_requires_account') {
            setEditValidationError(t('savings.errors.linkedAccountRequiresAccount'))
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
    <Screen onBack={() => router.back()} keyboardAvoiding width="form">
      {/* Visual QA + Desktop Polish pass: this screen had no header at
          all — the goal's own name only ever appeared inside its own
          editable Input, matching neither the pattern every other detail
          screen (recurring/obligations/transactions) already uses nor
          giving a desktop reader any sense of "what am I looking at" above
          the fold. */}
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[26px]">
        {goal.name}
      </Text>

      {/* Visual QA + Desktop Polish pass: bounded desktop panel (same token
          as every other screen) plus paired field rows — this screen had
          zero responsive treatment before this pass. Mobile/tablet
          untouched. */}
      <View className={DESKTOP_PANEL_CLASS}>
      <View className="web:desktop:flex-row web:desktop:gap-4">
        <View className="web:desktop:flex-1">
          <Input label={t('savings.form.nameLabel')} value={nameText} onChangeText={setNameText} placeholder={t('savings.form.namePlaceholder')} />
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
      <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('savings.form.progressSourceLabel')}</Text>
      <View className="mb-4 flex-row gap-2">
        <Chip
          label={t('savings.form.progressSourceManual')}
          selected={progressSource === 'manual'}
          onPress={() => setProgressSource('manual')}
        />
        <Chip
          label={t('savings.form.progressSourceLinked')}
          selected={progressSource === 'linked_account'}
          onPress={() => setProgressSource('linked_account')}
        />
      </View>
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
      </View>

      <View className={`mt-4 ${DESKTOP_PANEL_CLASS}`}>
      <Text className="mb-2 text-lg text-inkMuted-light dark:text-inkMuted-dark">
        {formatILS(resolvedCurrentAgorot)} / {formatILS(goal.target_agorot)}
      </Text>
      <View className="mb-6">
        <ProgressBar percent={percent} positiveAtLimit />
      </View>
      {resolvedIsCompleted && (
        <Text className="mb-6 text-base font-semibold text-accent-light dark:text-accent-dark">
          {t('savings.completed')}
        </Text>
      )}

      {/* Required-monthly-saving projection toward the target date —
          lib/engines/savings/calculateSavingsPace.ts. Hidden entirely
          (never a guess) when the goal has no target date at all, or once
          it's already complete. */}
      {showPace && pace && (
        <View className="mb-6 rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <View className="flex-row items-center justify-between web:flex-row">
            <View>
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('savings.pace.requiredMonthlyLabel')}
              </Text>
              <Text className="mt-0.5 text-heading font-semibold text-ink-light dark:text-ink-dark web:desktop:text-[19px]">
                {formatILS(pace.requiredMonthlyAgorot)}
              </Text>
            </View>
            <View
              className={`rounded-full px-2.5 py-1 ${
                pace.isOnTrack
                  ? 'bg-positive-light/15 dark:bg-positive-dark/15'
                  : 'bg-danger-light/15 dark:bg-danger-dark/15'
              }`}
            >
              <Text
                className={`text-caption font-medium ${
                  pace.isOnTrack ? 'text-positive-light dark:text-positive-dark' : 'text-danger-light dark:text-danger-dark'
                }`}
              >
                {t(pace.isOverdue ? 'savings.pace.overdue' : pace.isOnTrack ? 'savings.pace.onTrack' : 'savings.pace.behind')}
              </Text>
            </View>
          </View>
          <Text className="mt-2 text-caption text-inkMuted-light dark:text-inkMuted-dark">
            {t('savings.pace.remainingByDate', {
              amount: formatILS(pace.remainingAgorot),
              date: goal.target_date ? formatDateDisplay(goal.target_date) : '',
            })}
          </Text>
        </View>
      )}

      {goal.progress_source === 'linked_account' ? (
        <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">
          {t('savings.detail.linkedProgressNote')}
        </Text>
      ) : (
        <>
          <View className="web:desktop:flex-row web:desktop:items-end web:desktop:gap-4">
            <View className="web:desktop:flex-1">
              <Input
                label={t('savings.detail.updateProgressLabel')}
                value={progressText}
                onChangeText={setProgressText}
                placeholder={t('transactions.form.amountPlaceholder')}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="web:desktop:w-[160px]">
              <Button
                title={t('savings.detail.updateProgressSubmit')}
                onPress={handleUpdateProgress}
                loading={updateProgress.isPending}
              />
            </View>
          </View>
          {(validationError || updateProgress.isError) && (
            <ErrorMessage message={validationError ?? t('savings.errors.generic')} />
          )}
        </>
      )}
      </View>

      <View className="mt-4">
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
