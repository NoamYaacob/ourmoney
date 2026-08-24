import { useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useInstallmentPlans } from '@/features/installments/hooks/useInstallmentPlans'
import { useInstallmentMaterializedCounts } from '@/features/installments/hooks/useInstallmentMaterializedCounts'
import { useUpdateInstallmentPlan } from '@/features/installments/hooks/useUpdateInstallmentPlan'
import { useDeleteInstallmentPlan } from '@/features/installments/hooks/useDeleteInstallmentPlan'
import { isConflictError, isNotFoundError } from '@/lib/mutations/concurrencyError'
import { formatILS } from '@/lib/money/format'
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
import type { InstallmentPlan } from '@/types/app'

export default function InstallmentPlanDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const { plans, isLoading: isPlansLoading, refetch } = useInstallmentPlans(householdId)
  const { materializedCounts } = useInstallmentMaterializedCounts(householdId)
  const updatePlan = useUpdateInstallmentPlan(householdId)
  const deletePlan = useDeleteInstallmentPlan(householdId)

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [description, setDescription] = useState('')
  const [merchantName, setMerchantName] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [isShared, setIsShared] = useState(true)
  const [editError, setEditError] = useState<string | null>(null)
  // Pinned at the exact moment startEditing() snapshots the other fields —
  // never re-read from the live query result at submit time (ADR-036), same
  // discipline as obligations/[id].tsx.
  const [editingVersion, setEditingVersion] = useState<number | null>(null)

  const [conflict, setConflict] = useState<{ kind: 'conflict' | 'not_found' } | null>(null)
  const [reloading, setReloading] = useState(false)

  const plan = plans.find((p) => p.id === id)

  if (isHouseholdLoading || isAccountsLoading || isCategoriesLoading || isPlansLoading) {
    return (
      <Screen onBack={() => router.back()} center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!plan) {
    return (
      <Screen onBack={() => router.back()} center>
        <ErrorMessage message={t('installments.errors.notFound')} />
      </Screen>
    )
  }

  function startEditing(source: InstallmentPlan) {
    setEditError(null)
    setDescription(source.description)
    setMerchantName(source.merchant_name ?? '')
    setCategoryId(source.category_id)
    setIsShared(source.is_shared)
    setEditingVersion(source.version)
    setIsEditing(true)
  }

  function handleSave() {
    if (updatePlan.isPending || !plan || editingVersion === null) return
    setEditError(null)

    if (!description.trim()) {
      setEditError(t('installments.form.errors.missingDescription'))
      return
    }

    updatePlan.mutate(
      {
        id: plan.id,
        expectedVersion: editingVersion,
        description: description.trim(),
        merchantName: merchantName.trim() || null,
        categoryId,
        isShared,
      },
      {
        onSuccess: () => setIsEditing(false),
        onError: (error) => {
          if (isConflictError(error)) {
            setConflict({ kind: 'conflict' })
          } else if (isNotFoundError(error)) {
            setConflict({ kind: 'not_found' })
          } else {
            setEditError(t('installments.errors.generic'))
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

    const freshPlan = fresh?.find((p) => p.id === id)
    if (isEditing && freshPlan) {
      startEditing(freshPlan)
    } else {
      setIsEditing(false)
    }
  }

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name_he }))
  const category = plan.category_id ? categories.find((c) => c.id === plan.category_id) : undefined
  const account = accounts.find((a) => a.id === plan.account_id)
  const materialized = materializedCounts[plan.id] ?? 0
  const remainingAgorot = plan.total_agorot - plan.monthly_agorot * materialized

  return (
    <Screen onBack={() => router.back()} keyboardAvoiding width="form">
      <Text className="mb-2 text-2xl font-bold text-ink-light dark:text-ink-dark web:desktop:text-[26px]">
        {plan.description}
      </Text>
      <Text className="mb-1 text-lg text-inkMuted-light dark:text-inkMuted-dark">{formatILS(remainingAgorot)}</Text>
      <Text className="mb-6 text-sm text-inkMuted-light dark:text-inkMuted-dark">
        {t('installments.installmentProgress', { materialized, total: plan.installment_count })}
        {' · '}
        {t('installments.monthlyAmount')} {formatILS(plan.monthly_agorot)}
        {'\n'}
        {formatDateDisplay(plan.first_charge_date)}
        {category ? ` · ${category.name_he}` : ''}
        {account ? ` · ${account.name}` : ''}
        {' · '}
        {plan.is_shared ? t('transactions.form.shared') : t('transactions.form.personal')}
      </Text>

      <View className={DESKTOP_PANEL_CLASS}>
        {isEditing ? (
          <View className="mb-2">
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
            <Select
              label={t('transactions.form.categoryLabel')}
              options={categoryOptions}
              value={categoryId}
              onChange={setCategoryId}
              placeholder={t('transactions.form.categoryPlaceholder')}
            />

            <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('transactions.form.sharedLabel')}</Text>
            <View className="mb-4 flex-row gap-2">
              <Chip label={t('transactions.form.shared')} selected={isShared} onPress={() => setIsShared(true)} />
              <Chip label={t('transactions.form.personal')} selected={!isShared} onPress={() => setIsShared(false)} />
            </View>

            <Text className="mb-3 text-xs text-inkMuted-light dark:text-inkMuted-dark">
              {t('installments.detail.immutableNotice')}
            </Text>

            {(editError || updatePlan.isError) && (
              <ErrorMessage message={editError ?? t('installments.errors.generic')} />
            )}

            <View className="web:desktop:flex-row web:desktop:gap-2">
              <View className="web:desktop:flex-1">
                <Button title={t('installments.detail.save')} onPress={handleSave} loading={updatePlan.isPending} />
              </View>
              <View className="mt-3 web:desktop:mt-0 web:desktop:flex-1">
                <Button
                  title={t('common.cancel')}
                  variant="secondary"
                  disabled={updatePlan.isPending}
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
            <View className="mb-3">
              <Button title={t('installments.detail.edit')} variant="secondary" onPress={() => startEditing(plan)} />
            </View>
            <Button title={t('installments.detail.delete')} variant="ghost" onPress={() => setConfirmDeleteVisible(true)} />
            {actionError && <ErrorMessage message={actionError} />}
          </>
        )}
      </View>

      <Modal
        visible={confirmDeleteVisible}
        title={t('installments.detail.deleteConfirmTitle')}
        message={t('installments.detail.deleteConfirmMessage')}
        confirmLabel={t('installments.detail.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deletePlan.isPending}
        onCancel={() => setConfirmDeleteVisible(false)}
        onConfirm={() =>
          deletePlan.mutate(
            { id: plan.id, expectedVersion: plan.version },
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
                  setActionError(t('installments.errors.generic'))
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
