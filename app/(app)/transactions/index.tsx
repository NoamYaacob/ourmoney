import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Screen } from '@/components/ui/Screen'

// Empty-list placeholder — real transaction entry/listing is MVP-2
// (docs/ROADMAP.md). This folder (not a flat file) exists so [id].tsx and
// new.tsx can land later without restructuring (docs/ARCHITECTURE.md).
export default function Transactions() {
  const { t } = useTranslation()

  return (
    <Screen>
      <Text className="text-2xl font-bold text-ink-light dark:text-ink-dark">{t('transactions.title')}</Text>
      <Text className="mt-4 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
        {t('common.comingSoon')}
      </Text>
    </Screen>
  )
}
