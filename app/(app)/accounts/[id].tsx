import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { useArchiveAccount } from '@/features/accounts/hooks/useArchiveAccount'
import { useDeleteAccount } from '@/features/accounts/hooks/useDeleteAccount'
import { useUpdateAccount } from '@/features/accounts/hooks/useUpdateAccount'
import { useCreditCardCycleSpend } from '@/features/accounts/hooks/useCreditCardCycleSpend'
import { mapAccountDeleteError } from '@/features/accounts/lib/mapAccountError'
import { formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { sumAgorot } from '@/lib/money/arithmetic'
import { getCurrentMonthPeriodStart, getPeriodEnd } from '@/features/budgets/lib/budgetPeriod'
import { Screen } from '@/components/ui/Screen'
import { HeroPanel, HeroLabel } from '@/components/ui/HeroPanel'
import { Money } from '@/components/ui/Money'
import { StatusChip } from '@/components/ui/StatusChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Modal } from '@/components/ui/Modal'
import type { AccountType } from '@/types/app'

// Enough activity to answer "what has been happening here" without turning
// a detail screen into a second, unfiltered transactions list.
const ACTIVITY_ROWS = 8

const ACCOUNT_TYPE_OPTIONS: AccountType[] = [
  'checking',
  'savings',
  'credit_card',
  'cash',
  'investment',
  'loan',
  'mortgage',
  'other',
]

export default function AccountDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { householdId, role, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading } = useAccounts(householdId)
  const { balances, isLoading: isBalancesLoading } = useAccountBalances(householdId)
  // This account's own transactions, newest first — the same query the
  // Transactions screen uses, narrowed by the filter it already supports.
  const { transactions: accountTransactions } = useTransactions(householdId, { accountId: id })
  const archiveAccount = useArchiveAccount(householdId)
  const deleteAccount = useDeleteAccount(householdId)
  const updateAccount = useUpdateAccount(householdId)

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmArchiveVisible, setConfirmArchiveVisible] = useState(false)

  const account = accounts.find((a) => a.id === id)

  // In and out for the current calendar month, from this account's own
  // transactions. Transfers are excluded from both: moving money between two
  // of the household's own accounts is not income here and not spending
  // there, and counting it would inflate both figures at once.
  const monthStart = getCurrentMonthPeriodStart()
  const monthEnd = getPeriodEnd(monthStart)
  const monthTransactions = accountTransactions.filter(
    (txn) => txn.transfer_id === null && txn.txn_date >= monthStart && txn.txn_date <= monthEnd
  )
  const monthInAgorot = sumAgorot(monthTransactions.filter((t) => t.amount_agorot > 0).map((t) => t.amount_agorot))
  const monthOutAgorot = Math.abs(
    sumAgorot(monthTransactions.filter((t) => t.amount_agorot < 0).map((t) => t.amount_agorot))
  )

  // Prefill the edit form once, when this account's data first loads —
  // adjusted during rendering (React's documented pattern for this, not a
  // useEffect) via a loaded-id guard, so it re-syncs only if the route's id
  // itself changes, never on every render. Mirrors
  // app/(app)/transactions/[id].tsx's identical pattern.
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('cash')
  const [billingCycleDayText, setBillingCycleDayText] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  if (account && account.id !== loadedAccountId) {
    setLoadedAccountId(account.id)
    setName(account.name)
    setType(account.type as AccountType)
    setBillingCycleDayText(account.billing_cycle_day !== null ? String(account.billing_cycle_day) : '')
  }

  const cycleSpend = useCreditCardCycleSpend(account?.id, account?.billing_cycle_day ?? null)

  // Folds in isHouseholdLoading — without it, a brief household-loading
  // window would fall straight through to the "account not found" state
  // below instead of showing a spinner (mobile-expo-reviewer finding).
  if (isHouseholdLoading || isAccountsLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (!account) {
    return (
      <Screen center>
        <ErrorMessage message={t('accounts.errors.notFound')} />
      </Screen>
    )
  }

  function handleSave() {
    if (!account || !name.trim() || updateAccount.isPending) return
    setSaveError(null)

    let billingCycleDay: number | null = null
    if (type === 'credit_card' && billingCycleDayText.trim()) {
      // Plain digits only — see useCreateAccount's create-form counterpart
      // for why Number(...) alone isn't strict enough.
      const trimmed = billingCycleDayText.trim()
      const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 28) {
        setSaveError(t('accounts.form.errors.invalidBillingCycleDay'))
        return
      }
      billingCycleDay = parsed
    }

    updateAccount.mutate({ id: account.id, name: name.trim(), type, billingCycleDay })
  }

  return (
    <Screen keyboardAvoiding scroll width="form">
      {/* The dark balance header the design opens this screen with
          ("כותרת כהה עם היתרה, אחר כך פעילות"). It had been a title and a
          muted line of text — a screen whose whole subject is one account
          was not showing that account's balance as anything.

          account.balance_agorot is a dead column nothing ever updates
          (features/accounts/lib/computeAccountBalances.ts's header), so the
          figure is computed live from transactions. Blank while it loads
          rather than flashing ₪0 as if that were a real computed answer. */}
      <View className="-mx-6 -mt-6 mb-4">
        <HeroPanel className="rounded-none rounded-b-hero px-6 pb-5 pt-6">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-body font-sansSemibold text-heroInk-light" numberOfLines={1}>
              {account.name}
            </Text>
            <Text className="text-meta font-sans text-heroInkMuted-light">{t(`accounts.types.${account.type}`)}</Text>
          </View>

          {/* Stated, not implied: every account in the product today is
              entered by hand. The design's frame shows a "מחובר אוטומטית"
              chip here because it assumes the Open Banking integration; the
              chip that is true right now is this one. */}
          <View className="mt-2 flex-row items-center gap-2">
            <StatusChip label={t('accounts.manuallyManaged')} tone="neutral" dot />
          </View>

          <View className="mt-3">
            <HeroLabel>{t('accounts.detail.balanceNow')}</HeroLabel>
          </View>
          {isBalancesLoading ? (
            <View className="h-11" />
          ) : (
            <Money agorot={balances[account.id] ?? 0} size="figure" tone="hero" />
          )}

          {/* This month, in and out — the same transactions the activity
              list below shows, summed. Not a third figure ("מחויב לחיוב
              אשראי" in the frame): nothing in the schema records which card
              settles from which account, so it could only be guessed. */}
          <View className="mt-3 flex-row gap-6 border-t border-heroBorder-light pt-3">
            <View className="flex-row items-baseline gap-1.5">
              <Text className="text-meta font-sans text-heroInkMuted-light">{t('accounts.detail.inThisMonth')}</Text>
              <Money agorot={monthInAgorot} size="caption" tone="heroMuted" signed />
            </View>
            <View className="flex-row items-baseline gap-1.5">
              <Text className="text-meta font-sans text-heroInkMuted-light">{t('accounts.detail.outThisMonth')}</Text>
              <Money agorot={monthOutAgorot} size="caption" tone="heroMuted" />
            </View>
          </View>
        </HeroPanel>
      </View>

      {/* Current-cycle spend — computed live from billing_cycle_day, never
          stored (migration 016/ADR-037: no card_statements table). Renders
          only when the account actually has a billing_cycle_day set — a
          credit_card account created before this field existed, or one left
          blank, has no cycle to show. */}
      {account.type === 'credit_card' && account.billing_cycle_day !== null && (
        <View className="mb-6 rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
            {t('accounts.detail.currentCycleSpend')}
          </Text>
          <Text className="mt-1 text-title font-bold text-ink-light dark:text-ink-dark">
            {cycleSpend.isLoading || cycleSpend.spendAgorot === null ? '' : formatILS(cycleSpend.spendAgorot)}
          </Text>
          {cycleSpend.range && (
            <Text className="mt-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {formatDateDisplay(cycleSpend.range.start)} – {formatDateDisplay(cycleSpend.range.end)}
            </Text>
          )}
        </View>
      )}

      {/* Activity. The design puts this directly under the header, ahead of
          anything editable — the question "what has been happening in this
          account" is why the screen gets opened; renaming it is not. */}
      <Text className="mb-2 text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
        {t('accounts.detail.activity')}
      </Text>
      {accountTransactions.length === 0 ? (
        <EmptyState
          iconName="receipt-outline"
          message={t('accounts.detail.activityEmpty')}
          hint={t('accounts.detail.activityEmptyHint')}
          compact
        />
      ) : (
        <View className="overflow-hidden rounded-card border border-border-light bg-surfaceMuted-light px-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
          {accountTransactions.slice(0, ACTIVITY_ROWS).map((txn, index) => (
            <Pressable
              key={txn.id}
              onPress={() => router.push(`/transactions/${txn.id}`)}
              accessibilityRole="button"
              accessibilityLabel={txn.description}
              className={`min-h-[44px] flex-row items-center gap-3 py-3 ${
                index > 0 ? 'border-t border-divider-light dark:border-divider-dark' : ''
              }`}
            >
              <Text
                className="w-12 font-heeboMedium text-meta text-inkMuted-light dark:text-inkMuted-dark"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {formatDateDisplay(txn.txn_date).slice(0, 5)}
              </Text>
              <View className="flex-1">
                <Text className="text-bodySm font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
                  {txn.description}
                </Text>
                <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                  {txn.transfer_id
                    ? t('transactions.mobile.transferLinked')
                    : txn.is_shared
                      ? t('transactions.form.shared')
                      : t('transactions.form.personal')}
                </Text>
              </View>
              <Money
                agorot={Math.abs(txn.amount_agorot)}
                size="row"
                tone={txn.amount_agorot > 0 ? 'positive' : 'default'}
              />
            </Pressable>
          ))}
        </View>
      )}

      <Text className="mb-2 mt-6 text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
        {t('accounts.detail.editSection')}
      </Text>
      <Input label={t('accounts.form.nameLabel')} value={name} onChangeText={setName} />
      <Select
        label={t('accounts.form.typeLabel')}
        options={ACCOUNT_TYPE_OPTIONS.map((value) => ({ value, label: t(`accounts.types.${value}`) }))}
        value={type}
        onChange={(value) => setType(value as AccountType)}
        placeholder={t('accounts.form.typeLabel')}
      />
      {type === 'credit_card' && (
        <Input
          label={t('accounts.form.billingCycleDayLabel')}
          value={billingCycleDayText}
          onChangeText={setBillingCycleDayText}
          placeholder={t('accounts.form.billingCycleDayPlaceholder')}
          keyboardType="number-pad"
        />
      )}
      {(saveError || updateAccount.isError) && <ErrorMessage message={saveError ?? t('accounts.errors.generic')} />}
      <View className="mb-3">
        <Button title={t('accounts.detail.save')} onPress={handleSave} loading={updateAccount.isPending} />
      </View>

      <Button
        title={account.is_active ? t('accounts.detail.archive') : t('accounts.detail.archived')}
        variant="secondary"
        disabled={!account.is_active}
        loading={archiveAccount.isPending}
        onPress={() => setConfirmArchiveVisible(true)}
      />

      {/* accounts_delete RLS (is_household_admin(household_id)) is the real
          gate — a non-admin's delete call is always rejected server-side.
          This mirrors Settings' existing admin-gating pattern (rename
          household, remove member): hiding a control the backend would
          reject anyway, rather than letting a non-admin discover the
          rejection through a failed destructive action. */}
      {role === 'admin' && (
        <View className="mt-3">
          <Button title={t('accounts.detail.delete')} variant="ghost" onPress={() => setConfirmDeleteVisible(true)} />
        </View>
      )}

      {deleteError && <ErrorMessage message={t(deleteError)} />}

      <Modal
        visible={confirmArchiveVisible}
        title={t('accounts.detail.archiveConfirmTitle')}
        message={t('accounts.detail.archiveConfirmMessage')}
        confirmLabel={t('accounts.detail.archive')}
        cancelLabel={t('common.cancel')}
        loading={archiveAccount.isPending}
        onCancel={() => setConfirmArchiveVisible(false)}
        onConfirm={() =>
          archiveAccount.mutate(account.id, {
            onSuccess: () => setConfirmArchiveVisible(false),
            onError: () => setConfirmArchiveVisible(false),
          })
        }
      />

      <Modal
        visible={confirmDeleteVisible}
        title={t('accounts.detail.deleteConfirmTitle')}
        message={t('accounts.detail.deleteConfirmMessage')}
        confirmLabel={t('accounts.detail.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={deleteAccount.isPending}
        onCancel={() => setConfirmDeleteVisible(false)}
        onConfirm={() =>
          deleteAccount.mutate(account.id, {
            onSuccess: () => {
              setConfirmDeleteVisible(false)
              router.back()
            },
            onError: (error) => {
              setConfirmDeleteVisible(false)
              setDeleteError(mapAccountDeleteError(error))
            },
          })
        }
      />
    </Screen>
  )
}
