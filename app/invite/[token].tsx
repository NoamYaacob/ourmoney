import { Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'

// Placeholder only — Milestone 4 wires the accept_invitation RPC (ADR-010).
// Reading the route param here proves the deep-link route itself resolves.
export default function AcceptInvite() {
  const { t } = useTranslation()
  const { token } = useLocalSearchParams<{ token: string }>()

  return (
    <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
      <Text className="text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('invite.title')}
      </Text>
      <Text className="mt-2 text-sm text-inkMuted-light dark:text-inkMuted-dark">
        {`${t('invite.tokenLabel')}: ${token}`}
      </Text>
      <Text className="mt-2 text-base text-inkMuted-light dark:text-inkMuted-dark">
        {t('common.comingSoon')}
      </Text>
    </View>
  )
}
