import { ActivityIndicator, Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useInviteAcceptance } from '@/features/household/hooks/useInviteAcceptance'

// Thin: all branching (unauthenticated store-and-redirect, authenticated
// direct accept, error mapping) lives in useInviteAcceptance — this screen
// only renders based on its status/error, per CLAUDE.md's "screens are thin"
// rule.
export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const { status, errorMessageKey } = useInviteAcceptance(token)
  const { t } = useTranslation()

  if (status === 'error') {
    return (
      <View className="flex-1 items-center justify-center bg-surface-light px-6 dark:bg-surface-dark">
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('invite.title')}
        </Text>
        <Text className="mb-6 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t(errorMessageKey ?? 'invite.errors.generic')}
        </Text>
        {/* Always safe to hardcode: the auth guard re-evaluates real household
            state on arrival and self-corrects to onboarding if the user
            doesn't actually have one yet — this link never needs to know
            which of the two applies. */}
        <Link href="/dashboard" className="text-sm font-semibold text-accent-light dark:text-accent-dark">
          {t('invite.backToDashboard')}
        </Link>
      </View>
    )
  }

  return (
    <View className="flex-1 items-center justify-center bg-surface-light px-6 dark:bg-surface-dark">
      <ActivityIndicator />
      <Text className="mt-4 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
        {t(`invite.status.${status}`)}
      </Text>
    </View>
  )
}
