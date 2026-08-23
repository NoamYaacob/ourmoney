// Every transaction filter, in a sheet instead of on the page.
//
// On desktop these controls live permanently above the list, which is fine
// with the width to spare. On a phone they were costing about a third of
// the screen before a single transaction appeared, which is what the design
// brief singled out: filters open as a sheet, and what stays on the page is
// a compact row of the ones actually applied.
//
// The sheet edits a DRAFT and commits on "הצגת תוצאות". Applying each tap
// live would refetch on every touch and, worse, would slide the list around
// underneath a household that is still deciding. Cancelling by dismissing
// therefore discards, which is why the draft resets from `value` each time
// the sheet opens.

import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Select } from '@/components/ui/Select'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { TRANSACTION_PERIODS, type TransactionPeriod } from '@/features/transactions/lib/transactionPeriod'
import {
  DEFAULT_TRANSACTION_FILTER_STATE,
  type TransactionFilterState,
  type TransactionSharedFilter,
  type TransactionTypeFilter,
} from '@/features/transactions/lib/transactionFilters'
import type { Account, Category } from '@/types/app'

const TYPE_VALUES: TransactionTypeFilter[] = ['all', 'expense', 'income', 'transfer']
const SHARED_VALUES: TransactionSharedFilter[] = ['all', 'shared', 'personal']

interface TransactionFilterSheetProps {
  visible: boolean
  value: TransactionFilterState
  accounts: Account[]
  categories: Category[]
  onApply: (next: TransactionFilterState) => void
  onClose: () => void
}

export function TransactionFilterSheet({
  visible,
  value,
  accounts,
  categories,
  onApply,
  onClose,
}: TransactionFilterSheetProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<TransactionFilterState>(value)

  // Re-seed whenever the sheet is open and EITHER it just opened (so a
  // dismissed edit from the previous open is discarded, even if `value`
  // itself didn't change) OR `value` has moved on from what draft was last
  // seeded from (matching the useEffect this replaced, deps `[visible,
  // value]`, which re-fired on either). Adjusted during rendering — React's
  // documented pattern for resetting state on a prop change — rather than a
  // useEffect, matching transactions/[id].tsx's prefill and
  // settings/categories.tsx's deep-link-edit guard elsewhere in this app.
  // `value` is reference-stable from the caller's own useState (only a real
  // setFilters call changes it, and that always closes the sheet in the
  // same action — see MobileTransactions.tsx), so the `!==` here never
  // false-triggers on an unrelated re-render.
  const [wasVisible, setWasVisible] = useState(visible)
  const [seededFrom, setSeededFrom] = useState(value)
  if (visible && (!wasVisible || value !== seededFrom)) {
    setSeededFrom(value)
    setDraft(value)
  }
  if (visible !== wasVisible) {
    setWasVisible(visible)
  }

  function update(partial: Partial<TransactionFilterState>) {
    setDraft((current) => ({ ...current, ...partial }))
  }

  return (
    <BottomSheet
      visible={visible}
      title={t('transactions.mobile.filterSheetTitle')}
      onClose={onClose}
      testID="transaction-filter-sheet"
      actions={
        <>
          <View className="flex-1">
            <Button
              title={t('transactions.mobile.resetFilters')}
              variant="secondary"
              onPress={() => setDraft({ ...DEFAULT_TRANSACTION_FILTER_STATE, search: draft.search })}
            />
          </View>
          <View className="flex-[2]">
            <Button title={t('transactions.mobile.applyFilters')} onPress={() => onApply(draft)} />
          </View>
        </>
      }
    >
      <SectionLabel className="mb-2">{t('transactions.filters.type.all')}</SectionLabel>
      <View className="mb-5 flex-row flex-wrap gap-2">
        {TYPE_VALUES.map((type) => (
          <Chip
            key={type}
            label={t(`transactions.filters.type.${type}`)}
            selected={draft.type === type}
            onPress={() => update({ type })}
          />
        ))}
      </View>

      <SectionLabel className="mb-2">{t('transactions.form.sharedLabel')}</SectionLabel>
      <View className="mb-5 flex-row flex-wrap gap-2">
        {SHARED_VALUES.map((shared) => (
          <Chip
            key={shared}
            label={t(`transactions.filters.shared.${shared}`)}
            selected={draft.shared === shared}
            onPress={() => update({ shared })}
          />
        ))}
      </View>

      <View className="mb-4">
        <Select
          label={t('transactions.filters.periodLabel')}
          placeholder={t('transactions.filters.periodLabel')}
          value={draft.period}
          options={TRANSACTION_PERIODS.map((period) => ({
            value: period,
            label: t(`transactions.filters.period.${period}`),
          }))}
          onChange={(period) => update({ period: period as TransactionPeriod })}
        />
      </View>

      <View className="mb-4">
        <Select
          label={t('transactions.filters.accountLabel')}
          placeholder={t('transactions.filters.allAccounts')}
          value={draft.accountId ?? 'all'}
          options={[
            { value: 'all', label: t('transactions.filters.allAccounts') },
            ...accounts.map((account) => ({ value: account.id, label: account.name })),
          ]}
          onChange={(accountId) => update({ accountId: accountId === 'all' ? null : accountId })}
        />
      </View>

      <View className="mb-2">
        <Select
          label={t('transactions.filters.categoryLabel')}
          placeholder={t('transactions.filters.allCategories')}
          value={draft.categoryId ?? 'all'}
          options={[
            { value: 'all', label: t('transactions.filters.allCategories') },
            { value: 'uncategorized', label: t('transactions.filters.uncategorized') },
            ...categories.map((category) => ({ value: category.id, label: category.name_he })),
          ]}
          onChange={(categoryId) => update({ categoryId: categoryId === 'all' ? null : categoryId })}
        />
      </View>

      <Text className="mt-2 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
        {t('transactions.form.sharedHint')}
      </Text>
    </BottomSheet>
  )
}
