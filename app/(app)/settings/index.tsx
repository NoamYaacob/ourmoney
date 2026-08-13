import { useRef, useState } from 'react'
import { Share, Switch, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import { colors } from '@/constants/colors'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useProfile } from '@/features/auth/hooks/useProfile'
import { useUpdateProfile } from '@/features/auth/hooks/useUpdateProfile'
import { useBiometricPreference } from '@/features/auth/hooks/useBiometricPreference'
import { useSignOut } from '@/features/auth/hooks/useSignOut'
import { useDeleteUserAccount } from '@/features/auth/hooks/useDeleteUserAccount'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useHouseholdMembers } from '@/features/household/hooks/useHouseholdMembers'
import { useUpdateHousehold } from '@/features/household/hooks/useUpdateHousehold'
import { useRemoveHouseholdMember } from '@/features/household/hooks/useRemoveHouseholdMember'
import { useCreateInvitation } from '@/features/household/hooks/useCreateInvitation'
import { buildInviteShareMessage } from '@/features/household/lib/inviteLink'
import { useTheme } from '@/features/settings/hooks/useTheme'
import type { AppearancePreference } from '@/features/settings/lib/appearancePreference'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { SkeletonList } from '@/components/ui/SkeletonList'
import type { HouseholdMemberWithProfile } from '@/types/app'

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
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const { user } = useAuth()
  const { displayName, avatarUrl, isLoading: isProfileLoading } = useProfile(user?.id)
  const {
    householdId,
    household,
    role,
    isLoading: isHouseholdLoading,
    error: householdError,
  } = useHousehold(user?.id)
  const { members, isLoading: isMembersLoading, error: membersError } = useHouseholdMembers(householdId)
  const createInvitation = useCreateInvitation(householdId ?? '')
  const [shareFailed, setShareFailed] = useState(false)
  const { preference, setPreference } = useTheme()
  const biometric = useBiometricPreference()
  const signOut = useSignOut()
  const deleteAccount = useDeleteUserAccount()
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false)

  // Profile display-name edit (Fix 4 — PROJECT_SPEC.md § Settings, "Profile
  // (display name, avatar)"; avatar upload is out of scope, no Storage
  // infrastructure exists yet). profiles_update RLS (id = auth.uid()) is the
  // real gate; this is just the inline edit affordance.
  const updateProfile = useUpdateProfile(user?.id)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileNameDraft, setProfileNameDraft] = useState('')

  function handleStartEditProfile() {
    setProfileNameDraft(displayName ?? '')
    setIsEditingProfile(true)
  }

  function handleSaveProfileName() {
    const trimmed = profileNameDraft.trim()
    if (!trimmed || updateProfile.isPending) return
    updateProfile.mutate(trimmed, { onSuccess: () => setIsEditingProfile(false) })
  }

  // Household rename (Fix 1 — admin-only, PROJECT_SPEC.md § Household,
  // "Admin can rename the household"). households_update RLS
  // (is_household_admin(id)) is the real gate; role === 'admin' here is
  // purely to avoid showing a control the backend would reject.
  const updateHousehold = useUpdateHousehold(householdId, user?.id)
  const [isRenamingHousehold, setIsRenamingHousehold] = useState(false)
  const [householdNameDraft, setHouseholdNameDraft] = useState('')

  function handleStartRenameHousehold() {
    setHouseholdNameDraft(household?.name ?? '')
    setIsRenamingHousehold(true)
  }

  function handleSaveHouseholdName() {
    const trimmed = householdNameDraft.trim()
    if (!trimmed || updateHousehold.isPending) return
    updateHousehold.mutate(trimmed, { onSuccess: () => setIsRenamingHousehold(false) })
  }

  // Remove member (Fix 2, admin-only, non-admin target only) and leave
  // household (Fix 3, member-only, self-targeted) share the same underlying
  // delete mutation — see useRemoveHouseholdMember.ts's header comment for
  // why both are safe subsets of household_members_delete's RLS policy, and
  // why an admin never reaches either path here (self-leave for an admin
  // needs real succession logic this hook does not provide — deferred, see
  // useRemoveHouseholdMember.ts).
  const removeMember = useRemoveHouseholdMember(householdId)
  const [removeMemberTarget, setRemoveMemberTarget] = useState<HouseholdMemberWithProfile | null>(null)
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(null)
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  function handleConfirmRemoveMember() {
    if (!householdId || !removeMemberTarget || removeMember.isPending) return
    removeMember.mutate(
      { householdId, userId: removeMemberTarget.userId },
      {
        onSuccess: () => {
          setRemoveMemberTarget(null)
          setRemoveMemberError(null)
        },
        onError: () => {
          setRemoveMemberTarget(null)
          setRemoveMemberError(t('settings.household.removeMemberErrors.generic'))
        },
      }
    )
  }

  function handleConfirmLeaveHousehold() {
    if (!householdId || !user?.id || removeMember.isPending) return
    removeMember.mutate(
      { householdId, userId: user.id },
      {
        onSuccess: () => {
          setLeaveConfirmVisible(false)
          setLeaveError(null)
        },
        onError: () => {
          setLeaveConfirmVisible(false)
          setLeaveError(t('settings.household.leaveErrors.generic'))
        },
      }
    )
  }
  // deleteAccount.isPending only updates after a real render — TanStack
  // Query's notifyManager batches mutation-state notifications via a real
  // setTimeout, not synchronously (confirmed against @tanstack/query-core's
  // source). Two presses close enough together (a JS-thread stall, an
  // assistive-tech double-activate) can both read isPending=false and both
  // call mutate() before either re-render lands. This ref is checked and
  // set synchronously in the same tick, closing that gap for an
  // irreversible action (qa-adversarial-reviewer finding, Milestone 9) —
  // the RPC's own advisory lock is a second line of defense, not a
  // substitute for this.
  const isDeletingRef = useRef(false)

  function handleConfirmDelete() {
    if (isDeletingRef.current || deleteAccount.isPending) return
    isDeletingRef.current = true
    deleteAccount.mutate(undefined, {
      onSettled: () => {
        isDeletingRef.current = false
        setDeleteConfirmVisible(false)
      },
    })
  }

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
      ) : isEditingProfile ? (
        <View className="mb-6">
          <Input
            label={t('settings.profile.nameLabel')}
            value={profileNameDraft}
            onChangeText={setProfileNameDraft}
            autoFocus
          />
          {updateProfile.isError && <ErrorMessage message={t('settings.profile.errors.generic')} />}
          <View className="flex-row-reverse gap-2">
            <Button
              title={t('settings.profile.save')}
              onPress={handleSaveProfileName}
              loading={updateProfile.isPending}
              disabled={!profileNameDraft.trim()}
            />
            <Button
              title={t('settings.profile.cancel')}
              variant="ghost"
              onPress={() => setIsEditingProfile(false)}
              disabled={updateProfile.isPending}
            />
          </View>
        </View>
      ) : (
        <View className="mb-6 flex-row items-center gap-3">
          <Avatar displayName={displayName ?? ''} avatarUrl={avatarUrl} size={56} />
          <View className="flex-1">
            <Text className="text-lg font-semibold text-ink-light dark:text-ink-dark">{displayName}</Text>
            <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{user?.email}</Text>
          </View>
          <Button title={t('settings.profile.editLabel')} variant="ghost" onPress={handleStartEditProfile} />
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
            {isRenamingHousehold ? (
              <View>
                <Input
                  label={t('settings.household.nameLabel')}
                  value={householdNameDraft}
                  onChangeText={setHouseholdNameDraft}
                  autoFocus
                />
                {updateHousehold.isError && <ErrorMessage message={t('settings.household.renameErrors.generic')} />}
                <View className="flex-row-reverse gap-2">
                  <Button
                    title={t('settings.household.save')}
                    onPress={handleSaveHouseholdName}
                    loading={updateHousehold.isPending}
                    disabled={!householdNameDraft.trim()}
                  />
                  <Button
                    title={t('settings.household.cancel')}
                    variant="ghost"
                    onPress={() => setIsRenamingHousehold(false)}
                    disabled={updateHousehold.isPending}
                  />
                </View>
              </View>
            ) : (
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">{household?.name}</Text>
                {/* Admin-only (Fix 1) — households_update's RLS
                    (is_household_admin(id)) is the real gate; `role` here
                    just avoids showing a control the backend would reject. */}
                {role === 'admin' && (
                  <Button
                    title={t('settings.household.renameLabel')}
                    variant="ghost"
                    onPress={handleStartRenameHousehold}
                  />
                )}
              </View>
            )}
            <View className="my-3">
              <Divider />
            </View>
            <Text className="mb-2 text-xs text-inkMuted-light dark:text-inkMuted-dark">
              {t('settings.household.membersTitle')}
            </Text>
            {removeMemberError && <ErrorMessage message={removeMemberError} />}
            {membersError ? (
              <ErrorMessage message={t('household.errors.bug')} />
            ) : isMembersLoading ? (
              <SkeletonList rows={2} rowClassName="h-8 w-full rounded-md" />
            ) : (
              members.map((member) => (
                <View key={member.userId} className="mb-2 flex-row items-center gap-2">
                  <Avatar displayName={member.displayName} avatarUrl={member.avatarUrl} size={28} />
                  <Text className="flex-1 text-sm text-ink-light dark:text-ink-dark">{member.displayName}</Text>
                  <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">
                    {member.role === 'admin' ? t('settings.household.roleAdmin') : t('settings.household.roleMember')}
                  </Text>
                  {/* Fix 2: admin removing a MEMBER row only — never shown
                      for an admin row, and never shown to a non-admin viewer.
                      See useRemoveHouseholdMember.ts for why this is a safe
                      subset of household_members_delete's RLS policy. */}
                  {role === 'admin' && member.role !== 'admin' && (
                    <Button
                      title={t('settings.household.removeMember')}
                      variant="ghost"
                      onPress={() => {
                        setRemoveMemberError(null)
                        setRemoveMemberTarget(member)
                      }}
                    />
                  )}
                </View>
              ))
            )}
            {/* Fix 3: leave household — MEMBER (non-admin) self-removal
                only. An admin leaving needs real succession logic this hook
                does not provide (see useRemoveHouseholdMember.ts); no leave
                affordance is ever shown to an admin. */}
            {role === 'member' && (
              <View className="mt-3">
                {leaveError && <ErrorMessage message={leaveError} />}
                <Button
                  title={t('settings.household.leave')}
                  variant="ghost"
                  onPress={() => {
                    setLeaveError(null)
                    setLeaveConfirmVisible(true)
                  }}
                />
              </View>
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

      {/* Financial — Milestone 6, reached from Settings, not a tab */}
      <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('settings.financial.title')}
      </Text>
      <View className="gap-2">
        <Button title={t('settings.financial.accounts')} variant="secondary" onPress={() => router.push('/accounts')} />
        <Button
          title={t('settings.financial.categories')}
          variant="secondary"
          onPress={() => router.push('/settings/categories')}
        />
        <Button
          title={t('settings.financial.recurring')}
          variant="secondary"
          onPress={() => router.push('/recurring')}
        />
        <Button title={t('settings.financial.goals')} variant="secondary" onPress={() => router.push('/goals')} />
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

      {/* Delete account — store compliance requirement (PROJECT_SPEC.md
          § Settings). Destructive by construction: danger-styled trigger,
          explicit confirmation modal, disabled while pending so a
          double-tap can't fire two concurrent deletions. */}
      <View className="mt-3">
        {deleteAccount.isError && <ErrorMessage message={t('settings.deleteAccount.errors.generic')} />}
        <Button
          title={t('settings.deleteAccount.button')}
          onPress={() => setDeleteConfirmVisible(true)}
          variant="danger"
          disabled={deleteAccount.isPending}
        />
      </View>

      <Modal
        visible={deleteConfirmVisible}
        title={t('settings.deleteAccount.confirmTitle')}
        message={t('settings.deleteAccount.confirmMessage')}
        confirmLabel={t('settings.deleteAccount.confirmButton')}
        cancelLabel={t('settings.deleteAccount.cancelButton')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmVisible(false)}
        destructive
        loading={deleteAccount.isPending}
      />

      <Modal
        visible={!!removeMemberTarget}
        title={t('settings.household.removeMemberConfirmTitle')}
        message={
          removeMemberTarget
            ? t('settings.household.removeMemberConfirmMessage', { name: removeMemberTarget.displayName })
            : undefined
        }
        confirmLabel={t('settings.household.removeMemberConfirmButton')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setRemoveMemberTarget(null)}
        destructive
        loading={removeMember.isPending}
      />

      <Modal
        visible={leaveConfirmVisible}
        title={t('settings.household.leaveConfirmTitle')}
        message={t('settings.household.leaveConfirmMessage')}
        confirmLabel={t('settings.household.leaveConfirmButton')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmLeaveHousehold}
        onCancel={() => setLeaveConfirmVisible(false)}
        destructive
        loading={removeMember.isPending}
      />
    </Screen>
  )
}
