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
import { Money } from '@/components/ui/Money'
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
  const { accounts, isLoading: isAccountsLoading, error, hasData, refetch } = useAccounts(householdId)
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

  // Both design files group accounts three ways — liquid (what counts
  // toward Safe-to-Spend), owed (credit cards, which come off the current
  // account at the next billing date), and everything not spendable today.
  // `OurMoney - Mobile.dc.html` screen 11 and the desktop Accounts frame use
  // the same three headings in the same order, so the grouping is shared
  // rather than a desktop-only arrangement over a flat phone list.
  //
  // Liquidity is `isEligibleCashAccount`'s own rule, not a second one
  // invented here — the "כסף נוזלי" heading claims these accounts are what
  // "פנוי באמת" is made of, and that claim has to stay literally true.
  const liquidAccounts = accounts.filter((a) => a.type === 'checking' || a.type === 'cash')
  const owedAccounts = accounts.filter((a) => a.type === 'credit_card')
  const illiquidAccounts = accounts.filter((a) => a.type !== 'checking' && a.type !== 'cash' && a.type !== 'credit_card')

  // One row for both platforms, one card per GROUP with hairlines between
  // rows — which is what both frames draw. It had been a bordered card per
  // account, so a household with six accounts read as six unrelated objects
  // instead of three groups.
  function renderAccountRow(account: Account, isLast: boolean) {
    const isOwed = account.type === 'credit_card'
    const balanceAgorot = balances[account.id] ?? 0

    return (
      <View key={account.id}>
        <Pressable
          onPress={() => router.push(`/accounts/${account.id}`)}
          accessibilityRole="button"
          accessibilityLabel={account.name}
          className="min-h-[44px] flex-row items-center gap-3 py-3.5"
        >
          <RowIcon tone={isOwed ? 'danger' : 'neutral'}>
            <Ionicons
              name={accountIconName(account.type)}
              size={ICON.row}
              color={isOwed ? (scheme === 'dark' ? colors.dangerStrong.dark : colors.dangerStrong.light) : iconColor}
            />
          </RowIcon>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
                {account.name}
              </Text>
              {!account.is_active && <StatusChip label={t('accounts.detail.archived')} />}
            </View>
            <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
              <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {t(`accounts.types.${account.type}`)}
              </Text>
              {/* The design's connection pill. Every account in the product
                  today is entered by hand — the Open Banking integration
                  does not exist yet — so this states that rather than
                  implying a sync that isn't happening. */}
              <StatusChip label={t('accounts.manuallyManaged')} dot />
            </View>
          </View>
          {/* account.balance_agorot is a dead column nothing ever updates —
              the balance shown here is computed live from transactions
              instead (features/accounts/lib/computeAccountBalances.ts).
              Blank while it loads rather than flashing ₪0 as if that were a
              real computed answer. */}
          {isBalancesLoading ? (
            <View className="h-5 w-24" />
          ) : (
            <Money agorot={balanceAgorot} size="row" tone={isOwed ? 'danger' : 'default'} />
          )}
          <Ionicons name="chevron-back" size={ICON.row} color={iconColor} />
        </Pressable>
        {!isLast && <View className="h-px bg-divider-light dark:bg-divider-dark" />}
      </View>
    )
  }

  function renderGroup(group: Account[], labelKey: string, labelClass: string, cardClass: string) {
    if (group.length === 0) return null
    return (
      <View className="mt-4">
        <Text className={`mb-2 text-meta font-sansSemibold tracking-[0.06em] ${labelClass}`}>{t(labelKey)}</Text>
        <View className={`overflow-hidden rounded-card border px-4 ${cardClass}`}>
          {group.map((account, index) => renderAccountRow(account, index === group.length - 1))}
        </View>
      </View>
    )
  }

  return (
    <Screen onBack={() => router.back()} width="wide" scroll>
      <Text className="mb-4 text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('accounts.title')}
      </Text>

      {!isLoading && hasData && accounts.length > 0 && (
        // The hero both frames open with: what is actually spendable, and
        // the one sentence that stops a household reading it as "all our
        // money". Net worth sits under it as context, never as the headline
        // — the whole point of the grouping below is that those are
        // different numbers.
        <View className="rounded-card border border-border-light bg-surfaceMuted-light p-5 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Text className="text-meta font-sansSemibold tracking-[0.06em] text-positiveStrong-light dark:text-positiveStrong-dark">
            {t('accounts.availableToSpend')}
          </Text>
          {isBalancesLoading ? <View className="h-11" /> : <Money agorot={availableCashAgorot} size="display" />}
          <Text className="mt-0.5 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
            {t('accounts.availableExplainer')}
          </Text>
          <Text className="mt-2 border-t border-divider-light pt-2 text-meta font-sans text-inkMuted-light dark:border-divider-dark dark:text-inkMuted-dark">
            {isBalancesLoading ? '' : t('accounts.netWorth', { amount: formatILS(totalBalanceAgorot) })}
            {' · '}
            {t('accounts.activeAccountCount', { count: activeAccountBalances.length })}
          </Text>
        </View>
      )}

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : !hasData ? (
        <ErrorMessage message={t('accounts.errors.generic')} onRetry={refetch} />
      ) : (
        <>
          {error && (
            <View className="mb-3">
              <ErrorMessage message={t('accounts.errors.generic')} onRetry={refetch} />
            </View>
          )}
          {/* No actionLabel/onAction here — the persistent "Add account"
              button below already covers it; a second identical CTA stacked
              directly above it was confusing, not helpful. */}
          {accounts.length === 0 && <EmptyState iconName="wallet-outline" message={t('accounts.empty')} hint={t('accounts.emptyHint')} />}

          {renderGroup(
            liquidAccounts,
            'accounts.groups.liquid',
            'text-positiveStrong-light dark:text-positiveStrong-dark',
            'border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark'
          )}
          {renderGroup(
            owedAccounts,
            'accounts.groups.owed',
            'text-dangerStrong-light dark:text-dangerStrong-dark',
            // The credit group carries a tinted border in both frames: what
            // is owed is not the same kind of thing as what is held.
            'border-dangerBorder-light bg-surfaceMuted-light dark:border-dangerBorder-dark dark:bg-surfaceMuted-dark'
          )}
          {renderGroup(
            illiquidAccounts,
            'accounts.groups.illiquid',
            'text-inkMuted-light dark:text-inkMuted-dark',
            // Recessed rather than white: not money to plan against today.
            'border-border-light bg-surface-light dark:border-border-dark dark:bg-surface-dark'
          )}

          {accounts.length > 0 && (
            <View className="mt-4 rounded-card border border-border-light bg-surfaceMuted-light p-5 dark:border-border-dark dark:bg-surfaceMuted-dark">
              <Text className="text-caption font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
                {t('accounts.availableExplainerTitle')}
              </Text>
              <Text className="mt-2 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {t('accounts.availableExplainerLong', { amount: formatILS(availableCashAgorot) })}
              </Text>
            </View>
          )}
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
