import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useRecurringTransactions } from '@/features/recurring/hooks/useRecurringTransactions'
import { useUpdateRecurringTransaction } from '@/features/recurring/hooks/useUpdateRecurringTransaction'
import { useSetRecurringTransactionActive } from '@/features/recurring/hooks/useSetRecurringTransactionActive'
import { useSkipRecurringOccurrence } from '@/features/recurring/hooks/useSkipRecurringOccurrence'
import { useDeleteRecurringTransaction } from '@/features/recurring/hooks/useDeleteRecurringTransaction'
import { signedAmountAgorot } from '@/features/transactions/lib/transactionSign'
import { isConflictError, isNotFoundError } from '@/lib/mutations/concurrencyError'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import { ConflictModal } from '@/components/ui/ConflictModal'
import { DESKTOP_PANEL_CLASS } from '@/constants/layout'
import type { RecurringFrequency, RecurringTransaction } from '@/types/app'

const FREQUENCIES: RecurringFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']
const DAY_OF_MONTH_FREQUENCIES: RecurringFrequency[] = ['monthly', 'quarterly', 'yearly']

export default function RecurringDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const { recurringTransactions, isLoading: isRecurringLoading, refetch } = useRecurringTransactions(householdId)
  const updateRecurring = useUpdateRecurringTransaction(householdId)
  const setActive = useSetRecurringTransactionActive(householdId)
  const skipOccurrence = useSkipRecurringOccurrence(householdId)
  const deleteRecurring = useDeleteRecurringTransaction(householdId)

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [amountText, setAmountText] = useState('')
  const [isIncome, setIsIncome] = useState(false)
  const [description, setDescription] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [isShared, setIsShared] = useState(true)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [editError, setEditError] = useState<string | null>(null)
  // Pinned at the exact moment startEditing() snapshots the other fields —
  // never re-read from the live query result at submit time (ADR-036).
  const [editingVersion, setEditingVersion] = useState<number | null>(null)

  const [conflict, setConflict] = useState<{ kind: 'conflict' | 'not_found' } | null>(null)
  const [reloading, setReloading] = useState(false)

  const item = recurringTransactions.find((r) => r.id === id)

  // Folds in isHouseholdLoading/isAccountsLoading/isCategoriesLoading: the
  // account/category Select pickers in the edit form below are gated on
  // householdId, so without this the pickers would briefly render with zero
  // options while those queries are still resolving (same reasoning as
  // transactions/[id].tsx's identical guard).
  if (isHouseholdLoading || isAccountsLoading || isCategoriesLoading || isRecurringLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!item) {
    return (
      <Screen center>
        <ErrorMessage message={t('recurring.errors.notFound')} />
      </Screen>
    )
  }

  function startEditing(source: RecurringTransaction) {
    setEditError(null)
    setAmountText(String(Math.abs(source.amount_agorot) / 100))
    setIsIncome(source.amount_agorot > 0)
    setDescription(source.description)
    setAccountId(source.account_id)
    setCategoryId(source.category_id)
    setIsShared(source.is_shared)
    setFrequency(source.frequency)
    setEditingVersion(source.version)
    setIsEditing(true)
  }

  function handleSave() {
    if (updateRecurring.isPending || !item || editingVersion === null) return
    setEditError(null)

    if (!accountId) {
      setEditError(t('recurring.form.errors.missingAccount'))
      return
    }
    if (!description.trim()) {
      setEditError(t('recurring.form.errors.missingDescription'))
      return
    }
    const parsed = agorotFromILS(amountText)
    if (!parsed.ok || parsed.agorot === null) {
      setEditError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }

    // day_of_month must track the SELECTED frequency, not the template's
    // stored value — sending the old value unchanged when switching e.g.
    // daily (day_of_month always null) -> monthly persists a null
    // day_of_month against a monthly template. advance_recurring_due_date()
    // (migration 003) computes LEAST(NULL, x) = NULL, so the very next
    // generate/skip silently sets next_due_date to NULL forever — the
    // template stops generating with no error anywhere and no way to
    // recover from the UI (bug found in the UX-completeness audit). Falls
    // back to deriving from the template's own next_due_date, mirroring
    // create's derivation (recurring/index.tsx) exactly, since the edit
    // form has no separate date field to derive from directly.
    const dayOfMonth = DAY_OF_MONTH_FREQUENCIES.includes(frequency)
      ? (item.day_of_month ?? Number(item.next_due_date.slice(8, 10)))
      : null

    updateRecurring.mutate(
      {
        id: item.id,
        expectedVersion: editingVersion,
        accountId,
        categoryId,
        amountAgorot: signedAmountAgorot(parsed.agorot, isIncome),
        description: description.trim(),
        isShared,
        frequency,
        dayOfMonth,
      },
      {
        onSuccess: () => setIsEditing(false),
        onError: (error) => {
          if (isConflictError(error)) {
            setConflict({ kind: 'conflict' })
          } else if (isNotFoundError(error)) {
            setConflict({ kind: 'not_found' })
          } else {
            setEditError(t('recurring.errors.generic'))
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

    const freshItem = fresh?.find((r) => r.id === id)
    if (isEditing && freshItem) {
      startEditing(freshItem)
    } else {
      setIsEditing(false)
    }
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.name_he}` }))
  const frequencyOptions = FREQUENCIES.map((f) => ({ value: f, label: t(`recurring.frequency.${f}`) }))

  return (
    <Screen keyboardAvoiding width="form">
      {/* architecture-reviewer finding: this base size was briefly swapped
          to `text-title` (22px), unconditionally shrinking the existing
          mobile header from 24px — kept as `text-2xl` (the original
          mobile/tablet size) with only the desktop size added. */}
      <Text className="mb-2 text-2xl font-bold text-ink-light dark:text-ink-dark web:desktop:text-[26px]">
        {item.description}
      </Text>
      <Text className="mb-1 text-lg text-inkMuted-light dark:text-inkMuted-dark">
        {formatILS(item.amount_agorot)}
      </Text>
      <Text className="mb-6 text-sm text-inkMuted-light dark:text-inkMuted-dark">
        {t(`recurring.frequency.${item.frequency}`)} · {t('recurring.nextDue')} {formatDateDisplay(item.next_due_date)}
      </Text>

      {/* Visual QA + Desktop Polish pass: the whole detail/edit panel now
          shares the same bounded desktop panel token as every other screen
          (DESKTOP_PANEL_CLASS), and the edit form's amount/description and
          account/category fields pair into rows at desktop — this screen
          had zero responsive treatment before this pass, reading as a
          stretched single-column mobile form on a wide desktop viewport.
          Mobile/tablet are untouched. */}
      <View className={DESKTOP_PANEL_CLASS}>
      {isEditing ? (
        <View className="mb-2">
          <View className="mb-4 flex-row gap-2">
            <Chip label={t('transactions.form.expense')} selected={!isIncome} onPress={() => setIsIncome(false)} />
            <Chip label={t('transactions.form.income')} selected={isIncome} onPress={() => setIsIncome(true)} />
          </View>

          <View className="web:desktop:flex-row web:desktop:gap-4">
            <View className="web:desktop:flex-1">
              <Input
                label={t('transactions.form.amountLabel')}
                value={amountText}
                onChangeText={setAmountText}
                placeholder={t('transactions.form.amountPlaceholder')}
                keyboardType="decimal-pad"
              />
            </View>
            <View className="web:desktop:flex-1">
              <Input
                label={t('transactions.form.descriptionLabel')}
                value={description}
                onChangeText={setDescription}
                placeholder={t('transactions.form.descriptionPlaceholder')}
              />
            </View>
          </View>
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
          <Select
            label={t('recurring.form.frequencyLabel')}
            options={frequencyOptions}
            value={frequency}
            onChange={(value) => setFrequency(value as RecurringFrequency)}
            placeholder={t('recurring.form.frequencyLabel')}
          />

          <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('transactions.form.sharedLabel')}</Text>
          <View className="mb-4 flex-row gap-2">
            <Chip label={t('transactions.form.shared')} selected={isShared} onPress={() => setIsShared(true)} />
            <Chip label={t('transactions.form.personal')} selected={!isShared} onPress={() => setIsShared(false)} />
          </View>

          {(editError || updateRecurring.isError) && (
            <ErrorMessage message={editError ?? t('recurring.errors.generic')} />
          )}

          <View className="web:desktop:flex-row web:desktop:gap-2">
          <View className="web:desktop:flex-1">
          <Button title={t('recurring.detail.save')} onPress={handleSave} loading={updateRecurring.isPending} />
          </View>
          <View className="mt-3 web:desktop:mt-0 web:desktop:flex-1">
            <Button
              title={t('common.cancel')}
              variant="secondary"
              disabled={updateRecurring.isPending}
              onPress={() => {
                setEditError(null)
                setIsEditing(false)
              }}
            />
          </View>
          </View>
        </View>
      ) : (
        <>
          <View className="mb-3 web:desktop:flex-row web:desktop:gap-2">
            <View className="web:desktop:flex-1">
            <Button title={t('recurring.detail.edit')} variant="secondary" onPress={() => startEditing(item)} />
            </View>

            {item.is_active && (
              <View className="mt-3 web:desktop:mt-0 web:desktop:flex-1">
              <Button
                title={t('recurring.detail.skip')}
                variant="secondary"
                loading={skipOccurrence.isPending}
                onPress={() => {
                  setActionError(null)
                  skipOccurrence.mutate(item.id, { onError: () => setActionError(t('recurring.errors.generic')) })
                }}
              />
              </View>
            )}
          </View>

          <View className="mt-3">
            <Button
              title={item.is_active ? t('recurring.detail.pause') : t('recurring.detail.resume')}
              variant="secondary"
              loading={setActive.isPending}
              onPress={() => {
                setActionError(null)
                setActive.mutate(
                  { id: item.id, expectedVersion: item.version, isActive: !item.is_active },
                  {
                    onError: (error) => {
                      if (isConflictError(error)) {
                        setConflict({ kind: 'conflict' })
                      } else if (isNotFoundError(error)) {
                        setConflict({ kind: 'not_found' })
                      } else {
                        setActionError(t('recurring.errors.generic'))
                      }
                    },
                  }
                )
              }}
            />
          </View>

          <View className="mt-3">
            <Button
              title={t('recurring.detail.delete')}
              variant="ghost"
              onPress={() => setConfirmDeleteVisible(true)}
            />
          </View>

          {actionError && <ErrorMessage message={actionError} />}
        </>
      )}
      </View>

      <Modal
        visible={confirmDeleteVisible}
        title={t('recurring.detail.deleteConfirmTitle')}
        message={t('recurring.detail.deleteConfirmMessage')}
        confirmLabel={t('recurring.detail.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deleteRecurring.isPending}
        onCancel={() => setConfirmDeleteVisible(false)}
        onConfirm={() =>
          deleteRecurring.mutate(
            { id: item.id, expectedVersion: item.version },
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
                  setActionError(t('recurring.errors.generic'))
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
