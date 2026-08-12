// Reached from Settings, not a tab (docs/ARCHITECTURE.md).

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCreateAccount } from '@/features/accounts/hooks/useCreateAccount'
import { formatILS } from '@/lib/money/format'
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
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading, error } = useAccounts(householdId)
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
    <Screen>
      <Text className="mb-6 text-2xl font-bold text-ink-light dark:text-ink-dark">{t('accounts.title')}</Text>

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
          {accounts.length === 0 && <EmptyState icon="💳" message={t('accounts.empty')} />}
          {accounts.map((account) => (
            <Pressable
              key={account.id}
              onPress={() => router.push(`/accounts/${account.id}`)}
              accessibilityRole="button"
              className="mb-2"
            >
              <Card>
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">{account.name}</Text>
                  <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">
                    {formatILS(account.balance_agorot)}
                  </Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </>
      )}

      {isAdding ? (
        <View className="mt-4">
          <Input label={t('accounts.form.nameLabel')} value={name} onChangeText={setName} />
          <Select
            label={t('accounts.form.typeLabel')}
            options={ACCOUNT_TYPE_OPTIONS.map((value) => ({ value, label: t(`accounts.types.${value}`) }))}
            value={type}
            onChange={(value) => setType(value as AccountType)}
            placeholder={t('accounts.form.typeLabel')}
          />
          {createAccount.isError && <ErrorMessage message={t('accounts.errors.generic')} />}
          <Button title={t('accounts.form.submit')} onPress={handleCreate} loading={createAccount.isPending} />
        </View>
      ) : (
        <View className="mt-4">
          <Button title={t('accounts.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
