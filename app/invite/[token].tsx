import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Link, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useInviteAcceptance } from '@/features/household/hooks/useInviteAcceptance'

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

  // A deferred invitation (persisted while signed out, now resumed after
  // sign-in/sign-up on possibly a different account) must never be joined
  // just because authentication happened to succeed — the user confirms
  // explicitly, or cancels without ever calling accept_invitation.
  if (status === 'confirming') {
    return (
      <View className="flex-1 items-center justify-center bg-surface-light px-6 dark:bg-surface-dark">
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('invite.title')}
        </Text>
        <Text className="mb-8 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t('invite.confirm.message')}
        </Text>

        <Pressable
          onPress={confirm}
          className="mb-4 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-70 dark:bg-slate-100"
        >
          <Text className="font-semibold text-white dark:text-slate-900">
            {t('invite.confirm.confirmButton')}
          </Text>
        </Pressable>

        <Pressable onPress={cancel} className="items-center px-4 py-3 active:opacity-70">
          <Text className="text-sm font-semibold text-accent-light dark:text-accent-dark">
            {t('invite.confirm.cancelButton')}
          </Text>
        </Pressable>
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
