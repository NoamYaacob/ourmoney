import { useState } from 'react'
import { Share, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useHouseholdStore } from '@/store/householdStore'
import { useCreateInvitation } from '@/features/household/hooks/useCreateInvitation'
import { buildInviteShareMessage } from '@/features/household/lib/inviteLink'
import { Screen } from '@/components/ui/Screen'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export default function InvitePartner() {
  const { t } = useTranslation()
  const router = useRouter()
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
    <Screen center>
      <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('onboarding.invitePartner.title')}
      </Text>
      <Text className="mb-8 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
        {t('onboarding.invitePartner.description')}
      </Text>

      {createInvitation.isError && <ErrorMessage message={t('household.errors.inviteFailed')} />}
      {shareFailed && <ErrorMessage message={t('onboarding.invitePartner.shareError')} />}

      <View className="mb-4">
        <Button
          title={t('onboarding.invitePartner.shareButton')}
          onPress={handleInvite}
          loading={createInvitation.isPending}
        />
      </View>
      <Button title={t('onboarding.invitePartner.skipButton')} onPress={handleSkip} variant="ghost" />
    </Screen>
  )
}
