import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'

// Milestone 1's ad-hoc dark-mode toggle button is gone — the real theme
// system now lives in Settings (features/settings/hooks/useTheme.ts,
// Milestone 5). Financial content (budgets, transactions) starts in MVP-2.
export default function Dashboard() {
  const { t } = useTranslation()

  return (
    <Screen>
      <Text className="text-2xl font-bold text-ink-light dark:text-ink-dark">{t('dashboard.title')}</Text>
      <View className="mt-6">
        <Card>
          <Text className="text-xs text-ink-light dark:text-ink-dark">{t('common.comingSoon')}</Text>
        </Card>
      </View>
    </Screen>
  )
}
