import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Screen } from '@/components/ui/Screen'

// Empty placeholder — real budget tracking is MVP-2 (docs/ROADMAP.md).
export default function Budgets() {
  const { t } = useTranslation()

  return (
    <Screen>
      <Text className="text-2xl font-bold text-ink-light dark:text-ink-dark">{t('budgets.title')}</Text>
      <Text className="mt-4 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
        {t('common.comingSoon')}
      </Text>
    </Screen>
  )
}
