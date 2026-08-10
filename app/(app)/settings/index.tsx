import { useState } from 'react'
import { Share, Switch, Text, View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import { colors } from '@/constants/colors'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useProfile } from '@/features/auth/hooks/useProfile'
import { useBiometricPreference } from '@/features/auth/hooks/useBiometricPreference'
import { useSignOut } from '@/features/auth/hooks/useSignOut'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useHouseholdMembers } from '@/features/household/hooks/useHouseholdMembers'
import { useCreateInvitation } from '@/features/household/hooks/useCreateInvitation'
import { buildInviteShareMessage } from '@/features/household/lib/inviteLink'
import { useTheme } from '@/features/settings/hooks/useTheme'
import type { AppearancePreference } from '@/features/settings/lib/appearancePreference'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const APPEARANCE_OPTIONS: AppearancePreference[] = ['system', 'light', 'dark']

// Composes entirely from hooks + components/ui/* — no direct Supabase call
// in this screen (CLAUDE.md). householdId is sourced from useHousehold's
// live, session-scoped query result (never from store/householdStore.ts
// directly) so an account switch can never drive this screen's member-list
// fetch with a previous account's household id — see
// useHouseholdMembers.ts's header comment and useHousehold.test.tsx's
// account-switch regression test for the concrete guarantee this relies on.
export default function Settings() {
  const { t } = useTranslation()
  const { colorScheme: scheme } = useColorScheme()
  const { user } = useAuth()
  const { displayName, avatarUrl, isLoading: isProfileLoading } = useProfile(user?.id)
  const { householdId, household, isLoading: isHouseholdLoading, error: householdError } = useHousehold(user?.id)
  const { members, isLoading: isMembersLoading, error: membersError } = useHouseholdMembers(householdId)
  const createInvitation = useCreateInvitation(householdId ?? '')
  const [shareFailed, setShareFailed] = useState(false)
  const { preference, setPreference } = useTheme()
  const biometric = useBiometricPreference()
  const signOut = useSignOut()

  function handleInvite() {
    if (!householdId || createInvitation.isPending) return
    setShareFailed(false)
    createInvitation.mutate(undefined, {
      onSuccess: async (token) => {
        // Share.share can reject — see app/onboarding/invite-partner.tsx's
        // identical handling (mobile review finding from that screen).
        try {
          await Share.share({ message: buildInviteShareMessage(t, token) })
        } catch {
          setShareFailed(true)
        }
      },
    })
  }

  return (
    <Screen>
      <Text className="mb-6 text-2xl font-bold text-ink-light dark:text-ink-dark">{t('settings.title')}</Text>

      {/* Profile */}
      {isProfileLoading ? (
        <View className="mb-6">
          <LoadingSpinner />
        </View>
      ) : (
        <View className="mb-6 flex-row items-center gap-3">
          <Avatar displayName={displayName ?? ''} avatarUrl={avatarUrl} size={56} />
          <View>
            <Text className="text-lg font-semibold text-ink-light dark:text-ink-dark">{displayName}</Text>
            <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{user?.email}</Text>
          </View>
        </View>
      )}

      {/* Household */}
      <Text className="mb-2 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('settings.household.title')}
      </Text>
      <Card>
        {householdError ? (
          <ErrorMessage message={t('household.errors.bug')} />
        ) : isHouseholdLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">{household?.name}</Text>
            <View className="my-3">
              <Divider />
            </View>
            <Text className="mb-2 text-xs text-inkMuted-light dark:text-inkMuted-dark">
              {t('settings.household.membersTitle')}
            </Text>
            {membersError ? (
              <ErrorMessage message={t('household.errors.bug')} />
            ) : isMembersLoading ? (
              <LoadingSpinner />
            ) : (
              members.map((member) => (
                <View key={member.userId} className="mb-2 flex-row items-center gap-2">
                  <Avatar displayName={member.displayName} avatarUrl={member.avatarUrl} size={28} />
                  <Text className="flex-1 text-sm text-ink-light dark:text-ink-dark">{member.displayName}</Text>
                  <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">
                    {member.role === 'admin' ? t('settings.household.roleAdmin') : t('settings.household.roleMember')}
                  </Text>
                </View>
              ))
            )}
          </>
        )}
      </Card>

      <View className="mt-4">
        {createInvitation.isError && <ErrorMessage message={t('household.errors.inviteFailed')} />}
        {shareFailed && <ErrorMessage message={t('settings.invite.shareError')} />}
        <Button
          title={t('settings.invite.button')}
          onPress={handleInvite}
          loading={createInvitation.isPending}
          variant="secondary"
        />
      </View>

      {/* Appearance */}
      <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('settings.appearance.title')}
      </Text>
      <View className="flex-row gap-2">
        {APPEARANCE_OPTIONS.map((option) => (
          <Button
            key={option}
            title={
              option === 'system' ? t('appearance.system') : option === 'light' ? t('theme.light') : t('theme.dark')
            }
            onPress={() => void setPreference(option)}
            variant={preference === option ? 'primary' : 'secondary'}
            selected={preference === option}
          />
        ))}
      </View>

      {/* Security */}
      <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('settings.security.title')}
      </Text>
      <Card>
        <View className="flex-row items-center justify-between">
          <Text className="text-base text-ink-light dark:text-ink-dark">{t('settings.security.biometricToggle')}</Text>
          <Switch
            value={biometric.enabled}
            onValueChange={biometric.setEnabled}
            disabled={biometric.isLoading}
            accessibilityLabel={t('settings.security.biometricToggle')}
            trackColor={{
              false: scheme === 'dark' ? colors.border.dark : colors.border.light,
              true: scheme === 'dark' ? colors.accent.dark : colors.accent.light,
            }}
          />
        </View>
      </Card>

      {/* Sign out */}
      <View className="mt-6">
        <Button title={t('settings.signOut')} onPress={() => signOut.mutate()} variant="secondary" />
      </View>
    </Screen>
  )
}
