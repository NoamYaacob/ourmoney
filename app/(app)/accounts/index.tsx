// Reached from Settings, not a tab (docs/ARCHITECTURE.md).
//
// Design Phase 3: visual language aligned with Dashboard/Add Transaction —
// account-type icon per row (accountIcon.ts, Phase 2), Select's 'row'
// variant + polished sheet for the type picker, Ionicon empty state. Every
// hook call and mutation payload below is unchanged from Phase 1.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { useCreateAccount } from '@/features/accounts/hooks/useCreateAccount'
import { accountIconName } from '@/features/accounts/lib/accountIcon'
import { sumEligibleCashAgorot } from '@/lib/engines/cashflow/eligibleCashAccounts'
import { formatILS } from '@/lib/money/format'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowIcon } from '@/components/ui/ListCard'
import { StatusChip } from '@/components/ui/StatusChip'
import { INLINE_FORM_WIDTH_CLASS } from '@/constants/layout'
import type { Account, AccountType } from '@/types/app'

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

export default function Accounts() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.ink.dark : colors.ink.light
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading, error } = useAccounts(householdId)
  const { balances, isLoading: isBalancesLoading } = useAccountBalances(householdId)
  // Folds in isHouseholdLoading (mobile-expo-reviewer finding — see
  // dashboard/index.tsx's identical comment for why this matters).
  const isLoading = isHouseholdLoading || isAccountsLoading
  const createAccount = useCreateAccount(householdId)

  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('cash')
  const [billingCycleDayText, setBillingCycleDayText] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  function handleCreate() {
    if (!householdId || !name.trim() || createAccount.isPending) return
    setCreateError(null)

    let billingCycleDay: number | null = null
    if (type === 'credit_card' && billingCycleDayText.trim()) {
      // Plain digits only — rejects "1e1"/"0x1"/whitespace-padded forms
      // Number(...) alone would silently accept, the same discipline
      // agorotFromILS's own stricter regex already applies to money.
      const trimmed = billingCycleDayText.trim()
      const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 28) {
        setCreateError(t('accounts.form.errors.invalidBillingCycleDay'))
        return
      }
      billingCycleDay = parsed
    }

    createAccount.mutate(
      { householdId, name: name.trim(), type, billingCycleDay },
      {
        onSuccess: () => {
          setName('')
          setType('cash')
          setBillingCycleDayText('')
          setIsAdding(false)
        },
      }
    )
  }

  // Visual QA + Desktop Polish pass: desktop-only total-balance summary —
  // Accounts previously had no top-level figure at all, reading as "just a
  // sparse list." Sums every ACTIVE account's already-computed live balance
  // (the same `balances` map every row below already reads from) — no new
  // data, no invented figure, and archived accounts are excluded the same
  // way they already are from every other financial total in this app.
  // Desktop-only (`hidden web:desktop:flex`): mobile's layout is untouched.
  const activeAccountBalances = accounts.filter((a) => a.is_active).map((a) => balances[a.id] ?? 0)
  const totalBalanceAgorot = activeAccountBalances.reduce((sum, agorot) => sum + agorot, 0)
  // Desktop Claude Design pass: the mockup's own "זמין להוצאה X · שווי נטו
  // Y" pairing on this card — the exact same isEligibleCashAccount
  // boundary Safe-to-Spend's own "available cash" already uses, not a
  // second liquidity rule invented for this screen.
  const availableCashAgorot = sumEligibleCashAgorot(accounts, balances)

  // Desktop Claude Design pass: the mockup groups accounts into three
  // sections by what they mean financially, not just a flat list — reusing
  // the exact same isEligibleCashAccount check for "liquid," account.type
  // for the other two. No new data: same `accounts`/`balances` the flat
  // mobile list below already renders, just bucketed. Desktop-only —
  // mobile keeps its original flat list untouched.
  const liquidAccounts = accounts.filter((a) => a.type === 'checking' || a.type === 'cash')
  const owedAccounts = accounts.filter((a) => a.type === 'credit_card')
  const illiquidAccounts = accounts.filter((a) => a.type !== 'checking' && a.type !== 'cash' && a.type !== 'credit_card')

  // Shared by the mobile flat list and the desktop grouped sections below —
  // one row implementation, two arrangements of the exact same accounts.
  function renderAccountRow(account: Account, twoColumn: boolean) {
    return (
      <Pressable
        key={account.id}
        onPress={() => router.push(`/accounts/${account.id}`)}
        accessibilityRole="button"
        className={twoColumn ? 'mb-2 web:desktop:w-[48%]' : 'mb-2'}
      >
        <Card>
          <View className="flex-row items-center gap-3">
            <RowIcon>
              <Ionicons name={accountIconName(account.type)} size={ICON.row} color={iconColor} />
            </RowIcon>
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">{account.name}</Text>
                {!account.is_active && <StatusChip label={t('accounts.detail.archived')} />}
              </View>
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t(`accounts.types.${account.type}`)}
              </Text>
            </View>
            {/* account.balance_agorot is a dead column nothing ever
                updates — the balance shown here is computed live from
                transactions instead (see
                features/accounts/lib/computeAccountBalances.ts). Blank
                while it loads rather than flashing ₪0 as if that were a
                real computed answer. */}
            <Text className="text-body text-inkMuted-light dark:text-inkMuted-dark">
              {isBalancesLoading ? '' : formatILS(balances[account.id] ?? 0)}
            </Text>
          </View>
        </Card>
      </Pressable>
    )
  }

  return (
    <Screen width="wide">
      <Text className="mb-6 text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('accounts.title')}
      </Text>

      {!error && !isLoading && accounts.length > 0 && (
        <View className="mb-6 hidden web:desktop:flex">
          <Card className="rounded-card border border-border-light bg-surfaceMuted-light p-4 web:desktop:p-6 dark:border-border-dark dark:bg-surfaceMuted-dark">
            <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('accounts.availableToSpend')}</Text>
            <Text className="mt-1 text-display font-bold text-ink-light dark:text-ink-dark web:desktop:text-[36px]">
              {isBalancesLoading ? '' : formatILS(availableCashAgorot)}
            </Text>
            <Text className="mt-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {isBalancesLoading ? '' : t('accounts.netWorth', { amount: formatILS(totalBalanceAgorot) })}
              {' · '}
              {t('accounts.activeAccountCount', { count: activeAccountBalances.length })}
            </Text>
          </Card>
        </View>
      )}

      {error ? (
        <ErrorMessage message={t('accounts.errors.generic')} />
      ) : isLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {/* No actionLabel/onAction here — the persistent "Add account"
              button below already covers it; a second identical CTA
              stacked directly above it was confusing, not helpful
              (mobile-expo-reviewer finding). */}
          {accounts.length === 0 && <EmptyState iconName="wallet-outline" message={t('accounts.empty')} compact />}
          {/* Responsive/desktop pass: a 2-column card grid once there's more
              than one account. Mobile/tablet keep this original flat list
              (`web:desktop:hidden` — Desktop Claude Design pass added the
              grouped desktop rendering below instead of restyling this one,
              since mobile's own flat list is untouched by that mockup). */}
          <View
            className={`web:desktop:hidden ${accounts.length > 1 ? 'web:desktop:flex-row web:desktop:flex-wrap web:desktop:justify-between' : ''}`}
          >
            {accounts.map((account) => renderAccountRow(account, accounts.length > 1))}
          </View>

          {/* Desktop Claude Design pass: the mockup's own three-way grouping
              — liquid (what counts toward Safe-to-Spend), owed (credit
              cards), illiquid (everything else) — each only rendered when
              it has accounts, so a household with no credit cards simply
              never sees an empty "owed" heading. */}
          <View className="hidden web:desktop:flex web:desktop:gap-1">
            {liquidAccounts.length > 0 && (
              <View className="web:desktop:mb-1">
                <Text className="web:desktop:mb-2 text-meta font-sansSemibold tracking-[0.08em] text-positiveStrong-light dark:text-positiveStrong-dark">
                  {t('accounts.groups.liquid')}
                </Text>
                {liquidAccounts.map((account) => renderAccountRow(account, false))}
              </View>
            )}
            {owedAccounts.length > 0 && (
              <View className="web:desktop:mb-1 web:desktop:mt-2">
                <Text className="web:desktop:mb-2 text-meta font-sansSemibold tracking-[0.08em] text-dangerStrong-light dark:text-dangerStrong-dark">
                  {t('accounts.groups.owed')}
                </Text>
                {owedAccounts.map((account) => renderAccountRow(account, false))}
              </View>
            )}
            {illiquidAccounts.length > 0 && (
              <View className="web:desktop:mt-2">
                <Text className="web:desktop:mb-2 text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('accounts.groups.illiquid')}
                </Text>
                {illiquidAccounts.map((account) => renderAccountRow(account, false))}
              </View>
            )}
          </View>
        </>
      )}

      {/* Add-account form/button stay narrow even on a wide desktop
          container — capped independently of the list above. */}
      {isAdding ? (
        <View className={INLINE_FORM_WIDTH_CLASS}>
          <Card>
            <Input label={t('accounts.form.nameLabel')} value={name} onChangeText={setName} />
            <Select
              variant="row"
              label={t('accounts.form.typeLabel')}
              options={ACCOUNT_TYPE_OPTIONS.map((value) => ({
                value,
                label: t(`accounts.types.${value}`),
                iconName: accountIconName(value),
              }))}
              value={type}
              onChange={(value) => setType(value as AccountType)}
              placeholder={t('accounts.form.typeLabel')}
              sheetTitle={t('accounts.form.typeLabel')}
              leadingIcon={
                <RowIcon>
                  <Ionicons name={accountIconName(type)} size={ICON.row} color={iconColor} />
                </RowIcon>
              }
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
            {(createError || createAccount.isError) && (
              <ErrorMessage message={createError ?? t('accounts.errors.generic')} />
            )}
            <View className="mt-2">
              <Button title={t('accounts.form.submit')} onPress={handleCreate} loading={createAccount.isPending} />
            </View>
          </Card>
        </View>
      ) : (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Button title={t('accounts.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
