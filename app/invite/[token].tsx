import { Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useInviteAcceptance } from '@/features/household/hooks/useInviteAcceptance'
import { Screen } from '@/components/ui/Screen'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

// Thin: all branching (unauthenticated store-and-redirect, deferred-vs-direct
// detection, confirm/cancel, error mapping) lives in useInviteAcceptance —
// this screen only renders based on its status/error, per CLAUDE.md's
// "screens are thin" rule.
export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const { status, errorMessageKey, confirm, cancel } = useInviteAcceptance(token)
  const { t } = useTranslation()

  if (status === 'error') {
    return (
      <Screen center>
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
      </Screen>
    )
  }

  // A deferred invitation (persisted while signed out, now resumed after
  // sign-in/sign-up on possibly a different account) must never be joined
  // just because authentication happened to succeed — the user confirms
  // explicitly, or cancels without ever calling accept_invitation.
  if (status === 'confirming') {
    return (
      <Screen center>
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('invite.title')}
        </Text>
        <Text className="mb-8 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t('invite.confirm.message')}
        </Text>

        <View className="mb-4">
          <Button title={t('invite.confirm.confirmButton')} onPress={confirm} />
        </View>
        <Button title={t('invite.confirm.cancelButton')} onPress={cancel} variant="ghost" />
      </Screen>
    )
  }

  return (
    <Screen center>
      <LoadingSpinner />
      <Text className="mt-4 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
        {t(`invite.status.${status}`)}
      </Text>
    </Screen>
  )
}
