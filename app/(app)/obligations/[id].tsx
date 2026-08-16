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
import { useDeletePlannedObligation } from '@/features/obligations/hooks/useDeletePlannedObligation'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { DatePickerField } from '@/components/ui/DatePickerField'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'

export default function ObligationDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const { obligations, isLoading: isObligationsLoading } = usePlannedObligations(householdId)
  const updateObligation = useUpdatePlannedObligation(householdId)
  const deleteObligation = useDeletePlannedObligation(householdId)

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState('')
  const [amountText, setAmountText] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [isShared, setIsShared] = useState(true)
  const [notes, setNotes] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

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

  function startEditing() {
    if (!obligation) return
    setEditError(null)
    setName(obligation.name)
    setAmountText(String(obligation.amount_agorot / 100))
    setDueDate(obligation.due_date)
    setCategoryId(obligation.category_id)
    setAccountId(obligation.account_id)
    setIsShared(obligation.is_shared)
    setNotes(obligation.notes ?? '')
    setIsEditing(true)
  }

  function handleSave() {
    if (updateObligation.isPending || !obligation) return
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
        onError: () => setEditError(t('obligations.errors.generic')),
      }
    )
  }

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_he }))
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const category = obligation.category_id ? categories.find((c) => c.id === obligation.category_id) : undefined
  const account = obligation.account_id ? accounts.find((a) => a.id === obligation.account_id) : undefined

  return (
    <Screen keyboardAvoiding>
      <Text className="mb-2 text-2xl font-bold text-ink-light dark:text-ink-dark">{obligation.name}</Text>
      <Text className="mb-1 text-lg text-inkMuted-light dark:text-inkMuted-dark">{formatILS(obligation.amount_agorot)}</Text>
      <Text className="mb-6 text-sm text-inkMuted-light dark:text-inkMuted-dark">
        {obligation.due_date}
        {category ? ` · ${category.name_he}` : ''}
        {account ? ` · ${account.name}` : ''}
        {' · '}
        {obligation.is_shared ? t('transactions.form.shared') : t('transactions.form.personal')}
        {' · '}
        {t(`obligations.status.${obligation.status}`)}
      </Text>

      {isEditing ? (
        <View className="mb-2">
          <Input label={t('obligations.form.nameLabel')} value={name} onChangeText={setName} placeholder={t('obligations.form.namePlaceholder')} />
          <Input
            label={t('transactions.form.amountLabel')}
            value={amountText}
            onChangeText={setAmountText}
            placeholder={t('transactions.form.amountPlaceholder')}
            keyboardType="decimal-pad"
          />
          <DatePickerField label={t('obligations.form.dueDateLabel')} value={dueDate} onChange={setDueDate} />
          <Select
            label={t('transactions.form.categoryLabel')}
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            placeholder={t('transactions.form.categoryPlaceholder')}
          />
          <Select
            label={t('transactions.form.accountLabel')}
            options={accountOptions}
            value={accountId}
            onChange={setAccountId}
            placeholder={t('transactions.form.accountPlaceholder')}
          />

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

          <Button title={t('obligations.detail.save')} onPress={handleSave} loading={updateObligation.isPending} />
          <View className="mt-3">
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
      ) : (
        <>
          <View className="mb-3">
            <Button title={t('obligations.detail.edit')} variant="secondary" onPress={startEditing} />
          </View>

          {obligation.status === 'upcoming' && (
            <View className="mb-3">
              <Button
                title={t('obligations.detail.markPaid')}
                loading={updateObligation.isPending}
                onPress={() => {
                  setActionError(null)
                  updateObligation.mutate(
                    { id: obligation.id, status: 'completed' },
                    { onError: () => setActionError(t('obligations.errors.generic')) }
                  )
                }}
              />
            </View>
          )}

          {obligation.status === 'upcoming' && (
            <View className="mb-3">
              <Button
                title={t('obligations.detail.cancelObligation')}
                variant="secondary"
                loading={updateObligation.isPending}
                onPress={() => {
                  setActionError(null)
                  updateObligation.mutate(
                    { id: obligation.id, status: 'cancelled' },
                    { onError: () => setActionError(t('obligations.errors.generic')) }
                  )
                }}
              />
            </View>
          )}

          <Button title={t('obligations.detail.delete')} variant="ghost" onPress={() => setConfirmDeleteVisible(true)} />

          {actionError && <ErrorMessage message={actionError} />}
        </>
      )}

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
          deleteObligation.mutate(obligation.id, {
            onSuccess: () => {
              setConfirmDeleteVisible(false)
              router.back()
            },
            onError: () => {
              setConfirmDeleteVisible(false)
              setActionError(t('obligations.errors.generic'))
            },
          })
        }
      />
    </Screen>
  )
}
