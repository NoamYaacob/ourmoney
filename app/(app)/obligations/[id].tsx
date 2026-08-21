import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { usePlannedObligations } from '@/features/obligations/hooks/usePlannedObligations'
import { useUpdatePlannedObligation } from '@/features/obligations/hooks/useUpdatePlannedObligation'
import { useSetPlannedObligationStatus } from '@/features/obligations/hooks/useSetPlannedObligationStatus'
import { useCompletePlannedObligationWithTransaction } from '@/features/obligations/hooks/useCompletePlannedObligationWithTransaction'
import { useDeletePlannedObligation } from '@/features/obligations/hooks/useDeletePlannedObligation'
import { isConflictError, isNotFoundError } from '@/lib/mutations/concurrencyError'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { DatePickerField } from '@/components/ui/DatePickerField'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import { ConflictModal } from '@/components/ui/ConflictModal'
import { DESKTOP_PANEL_CLASS } from '@/constants/layout'
import type { PlannedObligation } from '@/types/app'

export default function ObligationDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const { obligations, isLoading: isObligationsLoading, refetch } = usePlannedObligations(householdId)
  const updateObligation = useUpdatePlannedObligation(householdId)
  const setStatus = useSetPlannedObligationStatus(householdId)
  const completeWithTransaction = useCompletePlannedObligationWithTransaction(householdId)
  const deleteObligation = useDeletePlannedObligation(householdId)

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  // UX-completeness audit finding: mark-paid/cancel were the only status
  // transitions in the app with no confirmation — both are one-way from the
  // UI (the action buttons only render for status === 'upcoming', so there
  // is no way back once tapped) yet had less friction than deleting.
  // 'completed' no longer routes through this Modal (see isMarkingPaid
  // below) — only 'cancelled' still needs a plain confirm/cancel dialog.
  const [confirmStatusAction, setConfirmStatusAction] = useState<'cancelled' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Comprehensive upgrade pass §10: "mark paid" now offers to create a real,
  // linked transaction — richer than a plain confirm/cancel dialog can hold
  // (a toggle + a conditional account picker), so it's an inline panel on
  // the page itself, matching this app's own precedent for "confirm with
  // extra input" (goals/[id].tsx's update-progress row), not the generic
  // Modal used for delete/cancel above.
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)
  const [createTransactionOnPaid, setCreateTransactionOnPaid] = useState(true)
  const [paidAccountId, setPaidAccountId] = useState<string | null>(null)
  const [markPaidError, setMarkPaidError] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState('')
  const [amountText, setAmountText] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [isShared, setIsShared] = useState(true)
  const [notes, setNotes] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  // Pinned at the exact moment startEditing() snapshots the other fields —
  // never re-read from the live query result at submit time, or the whole
  // compare-and-swap is defeated (ADR-036).
  const [editingVersion, setEditingVersion] = useState<number | null>(null)

  const [conflict, setConflict] = useState<{ kind: 'conflict' | 'not_found' } | null>(null)
  const [reloading, setReloading] = useState(false)

  const obligation = obligations.find((o) => o.id === id)

  // Folds in isHouseholdLoading/isAccountsLoading/isCategoriesLoading: the
  // category/account Select pickers in the edit form below are gated on
  // householdId, so without this the pickers would briefly render with zero
  // options while those queries are still resolving (same reasoning as
  // recurring/[id].tsx's identical guard).
  if (isHouseholdLoading || isAccountsLoading || isCategoriesLoading || isObligationsLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!obligation) {
    return (
      <Screen center>
        <ErrorMessage message={t('obligations.errors.notFound')} />
      </Screen>
    )
  }

  function startEditing(source: PlannedObligation) {
    setEditError(null)
    setName(source.name)
    setAmountText(String(source.amount_agorot / 100))
    setDueDate(source.due_date)
    setCategoryId(source.category_id)
    setAccountId(source.account_id)
    setIsShared(source.is_shared)
    setNotes(source.notes ?? '')
    setEditingVersion(source.version)
    setIsEditing(true)
  }

  function handleSave() {
    if (updateObligation.isPending || !obligation || editingVersion === null) return
    setEditError(null)

    if (!name.trim()) {
      setEditError(t('obligations.form.errors.missingName'))
      return
    }
    const parsed = agorotFromILS(amountText)
    if (!parsed.ok || parsed.agorot === null) {
      setEditError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }
    if (!dueDate) {
      setEditError(t('obligations.form.errors.missingDueDate'))
      return
    }

    updateObligation.mutate(
      {
        id: obligation.id,
        expectedVersion: editingVersion,
        name: name.trim(),
        amountAgorot: parsed.agorot,
        dueDate,
        categoryId,
        accountId,
        isShared,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => setIsEditing(false),
        onError: (error) => {
          if (isConflictError(error)) {
            setConflict({ kind: 'conflict' })
          } else if (isNotFoundError(error)) {
            setConflict({ kind: 'not_found' })
          } else {
            setEditError(t('obligations.errors.generic'))
          }
        },
      }
    )
  }

  async function handleReloadFromConflict() {
    setReloading(true)
    const { data: fresh } = await refetch()
    setReloading(false)
    setConflict(null)

    const freshObligation = fresh?.find((o) => o.id === id)
    if (isEditing && freshObligation) {
      startEditing(freshObligation)
    } else {
      setIsEditing(false)
    }
  }

  function handleConfirmStatusChange() {
    if (!obligation || !confirmStatusAction || setStatus.isPending) return
    setActionError(null)
    setStatus.mutate(
      { id: obligation.id, expectedVersion: obligation.version, status: confirmStatusAction },
      {
        onSuccess: () => setConfirmStatusAction(null),
        onError: (error) => {
          setConfirmStatusAction(null)
          if (isConflictError(error)) {
            setConflict({ kind: 'conflict' })
          } else if (isNotFoundError(error)) {
            setConflict({ kind: 'not_found' })
          } else {
            setActionError(t('obligations.errors.generic'))
          }
        },
      }
    )
  }

  // Toggle OFF routes through the existing set_planned_obligation_status —
  // identical to today's behavior before this feature existed. Toggle ON
  // routes through complete_planned_obligation(), the new atomic RPC that
  // also inserts the linked transaction. Only one of the two ever fires per
  // confirm, so 'transaction.created' is only ever emitted when a
  // transaction is actually created (see the hook's own comment).
  function handleConfirmMarkPaid() {
    if (!obligation || completeWithTransaction.isPending || setStatus.isPending) return
    setMarkPaidError(null)

    if (createTransactionOnPaid) {
      if (!paidAccountId) {
        setMarkPaidError(t('obligations.detail.markPaidPanel.missingAccount'))
        return
      }
      completeWithTransaction.mutate(
        {
          id: obligation.id,
          expectedVersion: obligation.version,
          accountId: paidAccountId,
          categoryId: obligation.category_id,
          amountAgorot: obligation.amount_agorot,
          isShared: obligation.is_shared,
        },
        {
          onSuccess: () => setIsMarkingPaid(false),
          onError: (error) => {
            if (isConflictError(error)) {
              setConflict({ kind: 'conflict' })
            } else if (isNotFoundError(error)) {
              setConflict({ kind: 'not_found' })
            } else {
              setMarkPaidError(t('obligations.errors.generic'))
            }
          },
        }
      )
    } else {
      setStatus.mutate(
        { id: obligation.id, expectedVersion: obligation.version, status: 'completed' },
        {
          onSuccess: () => setIsMarkingPaid(false),
          onError: (error) => {
            if (isConflictError(error)) {
              setConflict({ kind: 'conflict' })
            } else if (isNotFoundError(error)) {
              setConflict({ kind: 'not_found' })
            } else {
              setMarkPaidError(t('obligations.errors.generic'))
            }
          },
        }
      )
    }
  }

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_he }))
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const category = obligation.category_id ? categories.find((c) => c.id === obligation.category_id) : undefined
  const account = obligation.account_id ? accounts.find((a) => a.id === obligation.account_id) : undefined

  return (
    <Screen keyboardAvoiding width="form">
      {/* architecture-reviewer finding: this base size was briefly swapped
          to `text-title` (22px), unconditionally shrinking the existing
          mobile header from 24px — kept as `text-2xl` (the original
          mobile/tablet size) with only the desktop size added. */}
      <Text className="mb-2 text-2xl font-bold text-ink-light dark:text-ink-dark web:desktop:text-[26px]">
        {obligation.name}
      </Text>
      <Text className="mb-1 text-lg text-inkMuted-light dark:text-inkMuted-dark">{formatILS(obligation.amount_agorot)}</Text>
      <Text className="mb-6 text-sm text-inkMuted-light dark:text-inkMuted-dark">
        {formatDateDisplay(obligation.due_date)}
        {category ? ` · ${category.name_he}` : ''}
        {account ? ` · ${account.name}` : ''}
        {' · '}
        {obligation.is_shared ? t('transactions.form.shared') : t('transactions.form.personal')}
        {' · '}
        {t(`obligations.status.${obligation.status}`)}
      </Text>

      {/* Visual QA + Desktop Polish pass: bounded desktop panel (same token
          as every other screen) plus paired field rows — this screen had
          zero responsive treatment before this pass. Mobile/tablet
          untouched. */}
      <View className={DESKTOP_PANEL_CLASS}>
      {isEditing ? (
        <View className="mb-2">
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
                value={accountId}
                onChange={setAccountId}
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

          {(editError || updateObligation.isError) && (
            <ErrorMessage message={editError ?? t('obligations.errors.generic')} />
          )}

          <View className="web:desktop:flex-row-reverse web:desktop:gap-2">
          <View className="web:desktop:flex-1">
          <Button title={t('obligations.detail.save')} onPress={handleSave} loading={updateObligation.isPending} />
          </View>
          <View className="mt-3 web:desktop:mt-0 web:desktop:flex-1">
            <Button
              title={t('common.cancel')}
              variant="secondary"
              disabled={updateObligation.isPending}
              onPress={() => {
                setEditError(null)
                setIsEditing(false)
              }}
            />
          </View>
          </View>
        </View>
      ) : isMarkingPaid ? (
        <View className="mb-2">
          <Text className="mb-1 text-base font-semibold text-ink-light dark:text-ink-dark">
            {t('obligations.detail.markPaidConfirmTitle')}
          </Text>
          <Text className="mb-4 text-sm text-inkMuted-light dark:text-inkMuted-dark">
            {t('obligations.detail.markPaidConfirmMessage')}
          </Text>

          <Text className="mb-1 text-sm font-medium text-ink-light dark:text-ink-dark">
            {t('obligations.detail.markPaidPanel.createTransactionLabel')}
          </Text>
          <Text className="mb-2 text-xs text-inkMuted-light dark:text-inkMuted-dark">
            {t('obligations.detail.markPaidPanel.createTransactionHint')}
          </Text>
          <View className="mb-4 flex-row gap-2">
            <Chip
              label={t('obligations.detail.markPaidPanel.createTransactionYes')}
              selected={createTransactionOnPaid}
              onPress={() => setCreateTransactionOnPaid(true)}
            />
            <Chip
              label={t('obligations.detail.markPaidPanel.createTransactionNo')}
              selected={!createTransactionOnPaid}
              onPress={() => setCreateTransactionOnPaid(false)}
            />
          </View>

          {createTransactionOnPaid && (
            <Select
              label={t('transactions.form.accountLabel')}
              options={accountOptions}
              value={paidAccountId}
              onChange={setPaidAccountId}
              placeholder={t('transactions.form.accountPlaceholder')}
            />
          )}

          {(markPaidError || completeWithTransaction.isError || setStatus.isError) && (
            <ErrorMessage message={markPaidError ?? t('obligations.errors.generic')} />
          )}

          <View className="web:desktop:flex-row-reverse web:desktop:gap-2">
            <View className="web:desktop:flex-1">
              <Button
                title={t('obligations.detail.markPaidPanel.submit')}
                onPress={handleConfirmMarkPaid}
                loading={completeWithTransaction.isPending || setStatus.isPending}
              />
            </View>
            <View className="mt-3 web:desktop:mt-0 web:desktop:flex-1">
              <Button
                title={t('common.cancel')}
                variant="secondary"
                disabled={completeWithTransaction.isPending || setStatus.isPending}
                onPress={() => {
                  setMarkPaidError(null)
                  setIsMarkingPaid(false)
                }}
              />
            </View>
          </View>
        </View>
      ) : (
        <>
          <View className="mb-3 web:desktop:flex-row-reverse web:desktop:gap-2">
            <View className="web:desktop:flex-1">
            <Button title={t('obligations.detail.edit')} variant="secondary" onPress={() => startEditing(obligation)} />
            </View>

            {obligation.status === 'upcoming' && (
              <View className="mt-3 web:desktop:mt-0 web:desktop:flex-1">
                <Button
                  title={t('obligations.detail.markPaid')}
                  onPress={() => {
                    setMarkPaidError(null)
                    setCreateTransactionOnPaid(true)
                    setPaidAccountId(obligation.account_id)
                    setIsMarkingPaid(true)
                  }}
                />
              </View>
            )}
          </View>

          {obligation.status === 'upcoming' && (
            <View className="mb-3">
              <Button
                title={t('obligations.detail.cancelObligation')}
                variant="secondary"
                onPress={() => setConfirmStatusAction('cancelled')}
              />
            </View>
          )}

          <Button title={t('obligations.detail.delete')} variant="ghost" onPress={() => setConfirmDeleteVisible(true)} />

          {actionError && <ErrorMessage message={actionError} />}
        </>
      )}
      </View>

      <Modal
        visible={confirmDeleteVisible}
        title={t('obligations.detail.deleteConfirmTitle')}
        message={t('obligations.detail.deleteConfirmMessage')}
        confirmLabel={t('obligations.detail.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deleteObligation.isPending}
        onCancel={() => setConfirmDeleteVisible(false)}
        onConfirm={() =>
          deleteObligation.mutate(
            { id: obligation.id, expectedVersion: obligation.version },
            {
              onSuccess: () => {
                setConfirmDeleteVisible(false)
                router.back()
              },
              onError: (error) => {
                setConfirmDeleteVisible(false)
                if (isConflictError(error)) {
                  setConflict({ kind: 'conflict' })
                } else if (isNotFoundError(error)) {
                  setConflict({ kind: 'not_found' })
                } else {
                  setActionError(t('obligations.errors.generic'))
                }
              },
            }
          )
        }
      />

      <Modal
        visible={confirmStatusAction !== null}
        title={t('obligations.detail.cancelConfirmTitle')}
        message={t('obligations.detail.cancelConfirmMessage')}
        confirmLabel={t('obligations.detail.cancelObligation')}
        cancelLabel={t('common.cancel')}
        loading={setStatus.isPending}
        onCancel={() => setConfirmStatusAction(null)}
        onConfirm={handleConfirmStatusChange}
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
