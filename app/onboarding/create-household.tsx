import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Placeholder only — Milestone 4 wires the create_household RPC (ADR-023).
export default function CreateHousehold() {
  const { t } = useTranslation()

  return (
    <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
      <Text className="text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('onboarding.createHousehold.title')}
      </Text>
      <Text className="mt-2 text-base text-inkMuted-light dark:text-inkMuted-dark">
        {t('common.comingSoon')}
      </Text>
    </View>
  )
}
