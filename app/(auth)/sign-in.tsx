import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

// Placeholder only — Milestone 3 implements the real sign-in form.
export default function SignIn() {
  const { t } = useTranslation()

  return (
    <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
      <Text className="text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('auth.signIn.title')}
      </Text>
      <Text className="mt-2 text-base text-inkMuted-light dark:text-inkMuted-dark">
        {t('common.comingSoon')}
      </Text>
    </View>
  )
}
