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
import { formatILS } from '@/lib/money/format'
import { colors } from '@/constants/colors'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import type { AccountType } from '@/types/app'

const ACCOUNT_TYPE_OPTIONS: AccountType[] = ['checking', 'savings', 'credit_card', 'cash', 'investment', 'other']

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

  function handleCreate() {
    if (!householdId || !name.trim() || createAccount.isPending) return
    createAccount.mutate(
      { householdId, name: name.trim(), type },
      {
        onSuccess: () => {
          setName('')
          setType('cash')
          setIsAdding(false)
        },
      }
    )
  }

  return (
    <Screen width="wide">
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark">{t('accounts.title')}</Text>

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
              than one account, desktop only. `w-[48%]` + `justify-between`
              on a `flex-row flex-wrap` container is a calc()-free way to get
              two even columns with a natural gap between them in Yoga/RN's
              flexbox (there is no CSS Grid on native). Mobile/tablet keep
              the original single-column list untouched. */}
          <View className={accounts.length > 1 ? 'web:desktop:flex-row-reverse web:desktop:flex-wrap web:desktop:justify-between' : undefined}>
          {accounts.map((account) => (
            <Pressable
              key={account.id}
              onPress={() => router.push(`/accounts/${account.id}`)}
              accessibilityRole="button"
              className={accounts.length > 1 ? 'mb-2 web:desktop:w-[48%]' : 'mb-2'}
            >
              <Card>
                <View className="flex-row items-center gap-3">
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                    <Ionicons name={accountIconName(account.type)} size={17} color={iconColor} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-body font-semibold text-ink-light dark:text-ink-dark">{account.name}</Text>
                      {!account.is_active && (
                        <View className="rounded-full border border-border-light bg-surface-light px-2 py-0.5 dark:border-border-dark dark:bg-surface-dark">
                          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                            {t('accounts.detail.archived')}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                      {t(`accounts.types.${account.type}`)}
                    </Text>
                  </View>
                  {/* account.balance_agorot is a dead column nothing ever
                      updates — the balance shown here is computed live from
                      transactions instead (see
                      features/accounts/lib/computeAccountBalances.ts).
                      Blank while it loads rather than flashing ₪0 as if
                      that were a real computed answer. */}
                  <Text className="text-body text-inkMuted-light dark:text-inkMuted-dark">
                    {isBalancesLoading ? '' : formatILS(balances[account.id] ?? 0)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}
          </View>
        </>
      )}

      {/* Add-account form/button stay narrow even on a wide desktop
          container — capped independently of the list above. */}
      {isAdding ? (
        <View className="web:desktop:max-w-[600px]">
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
                <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                  <Ionicons name={accountIconName(type)} size={17} color={iconColor} />
                </View>
              }
            />
            {createAccount.isError && <ErrorMessage message={t('accounts.errors.generic')} />}
            <View className="mt-2">
              <Button title={t('accounts.form.submit')} onPress={handleCreate} loading={createAccount.isPending} />
            </View>
          </Card>
        </View>
      ) : (
        <View className="mt-4 web:desktop:max-w-[600px]">
          <Button title={t('accounts.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
