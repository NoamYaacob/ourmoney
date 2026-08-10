import { useState } from 'react'
import { ActivityIndicator, Pressable, Share, Text, useColorScheme, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { colors } from '@/constants/colors'
import { useHouseholdStore } from '@/store/householdStore'
import { useCreateInvitation } from '@/features/household/hooks/useCreateInvitation'
import { buildInviteShareMessage } from '@/features/household/lib/inviteLink'

export default function InvitePartner() {
  const { t } = useTranslation()
  const router = useRouter()
  const scheme = useColorScheme()
  const householdId = useHouseholdStore((state) => state.householdId)
  const createInvitation = useCreateInvitation(householdId ?? '')
  const [shareFailed, setShareFailed] = useState(false)

  function handleInvite() {
    if (!householdId || createInvitation.isPending) return
    setShareFailed(false)
    createInvitation.mutate(undefined, {
      onSuccess: async (token) => {
        // Share.share can reject (e.g. no app can handle the intent on
        // Android, or a native module error) — not just resolve with a
        // dismissed action on cancel. The invitation row already exists at
        // this point; only the share step itself needs its own error state
        // (mobile review finding — this was previously an unhandled
        // rejection with zero user-facing feedback on failure).
        try {
          await Share.share({ message: buildInviteShareMessage(t, token) })
        } catch {
          setShareFailed(true)
        }
      },
    })
  }

  function handleSkip() {
    router.replace('/dashboard')
  }

  return (
    <View className="flex-1 justify-center bg-surface-light px-6 dark:bg-surface-dark">
      <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('onboarding.invitePartner.title')}
      </Text>
      <Text className="mb-8 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
        {t('onboarding.invitePartner.description')}
      </Text>

      {createInvitation.isError && (
        <Text className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
          {t('household.errors.inviteFailed')}
        </Text>
      )}
      {shareFailed && (
        <Text className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
          {t('onboarding.invitePartner.shareError')}
        </Text>
      )}

      <Pressable
        onPress={handleInvite}
        disabled={createInvitation.isPending}
        className="mb-4 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-70 disabled:opacity-40 dark:bg-slate-100"
      >
        {createInvitation.isPending ? (
          <ActivityIndicator color={scheme === 'dark' ? colors.surface.dark : colors.surface.light} />
        ) : (
          <Text className="font-semibold text-white dark:text-slate-900">
            {t('onboarding.invitePartner.shareButton')}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={handleSkip} className="items-center px-4 py-3 active:opacity-70">
        <Text className="text-sm font-semibold text-accent-light dark:text-accent-dark">
          {t('onboarding.invitePartner.skipButton')}
        </Text>
      </Pressable>
    </View>
  )
}
