import { useState } from 'react'
import { Platform, Share, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import { useHouseholdStore } from '@/store/householdStore'
import { useCreateInvitation } from '@/features/household/hooks/useCreateInvitation'
import { buildInviteShareMessage } from '@/features/household/lib/inviteLink'
import { Screen } from '@/components/ui/Screen'
import { AuthHeader } from '@/components/ui/AuthHeader'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// RRR §16 P1-8: when Share.share() fails — routine on desktop web, where
// the Web Share API is frequently unavailable — the invitation row already
// exists in the DB at this point (created successfully before the share
// attempt) but the token was never surfaced anywhere else, so the household
// could create an invitation and never actually be able to hand it to a
// second person: "the entire premise of a couples app." Linking.createURL
// resolves per-platform (a real https:// URL to /invite/<token> on web, the
// same ourmoney:// deep link buildInviteShareMessage already uses on
// native) — this is only ever shown, never sent automatically, so it
// doesn't change the working native share path at all.
function buildInviteFallbackLink(token: string): string {
  return Linking.createURL(`/invite/${token}`)
}

// Hostile re-review correction (P1-8): navigator.clipboard.writeText can
// reject (permission denied, the page lost focus, an insecure context) —
// not just resolve. The original version fired the write with `void` and
// returned true synchronously regardless of the outcome, so a household
// could be told "copied!" with nothing actually on their clipboard. Now
// async and honest: the caller only shows the "copied" confirmation once
// the write has genuinely resolved.
async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
  return false
}

export default function InvitePartner() {
  const { t } = useTranslation()
  const router = useRouter()
  const householdId = useHouseholdStore((state) => state.householdId)
  const createInvitation = useCreateInvitation(householdId ?? '')
  const [shareFailed, setShareFailed] = useState(false)
  const [failedToken, setFailedToken] = useState<string | null>(null)
  const [justCopied, setJustCopied] = useState(false)

  function handleInvite() {
    if (!householdId || createInvitation.isPending) return
    setShareFailed(false)
    setFailedToken(null)
    setJustCopied(false)
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
          setFailedToken(token)
        }
      },
    })
  }

  async function handleCopyLink() {
    if (!failedToken) return
    const copied = await copyToClipboard(buildInviteFallbackLink(failedToken))
    if (copied) setJustCopied(true)
  }

  function handleSkip() {
    router.replace('/dashboard')
  }

  return (
    <Screen center>
      <AuthHeader title={t('onboarding.invitePartner.title')} />
      <Text className="-mt-4 mb-8 text-center text-body font-sans text-inkMuted-light dark:text-inkMuted-dark">
        {t('onboarding.invitePartner.description')}
      </Text>

      {createInvitation.isError && <ErrorMessage message={t('household.errors.inviteFailed')} />}

      {shareFailed && failedToken && (
        <View className="mb-4 gap-2.5">
          <ErrorMessage message={t('onboarding.invitePartner.shareError')} />
          {/* `selectable` gives native platforms a real recovery path too
              (long-press to copy) without a second, platform-specific
              clipboard dependency — the explicit button below is the web
              path, where navigator.clipboard is reliably available. */}
          <Text
            selectable
            accessibilityLabel={buildInviteFallbackLink(failedToken)}
            className="rounded-lg border border-border-light bg-surfaceMuted-light px-3 py-2.5 text-center text-caption text-ink-light dark:border-border-dark dark:bg-surfaceMuted-dark dark:text-ink-dark"
          >
            {buildInviteFallbackLink(failedToken)}
          </Text>
          <Button
            title={justCopied ? t('onboarding.invitePartner.copyLinkCopied') : t('onboarding.invitePartner.copyLink')}
            onPress={handleCopyLink}
            variant="secondary"
          />
        </View>
      )}

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
