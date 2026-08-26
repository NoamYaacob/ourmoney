import { useRef, useState } from 'react'
import { Share, Switch, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import { colors } from '@/constants/colors'
import { DESKTOP_PANEL_CLASS } from '@/constants/layout'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useProfile } from '@/features/auth/hooks/useProfile'
import { useUpdateProfile } from '@/features/auth/hooks/useUpdateProfile'
import { useBiometricPreference } from '@/features/auth/hooks/useBiometricPreference'
import { useBiometricAvailability } from '@/features/auth/hooks/useBiometricAvailability'
import { useSignOut } from '@/features/auth/hooks/useSignOut'
import { useDeleteUserAccount } from '@/features/auth/hooks/useDeleteUserAccount'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useHouseholdMembers } from '@/features/household/hooks/useHouseholdMembers'
import { useUpdateHousehold } from '@/features/household/hooks/useUpdateHousehold'
import { useRemoveHouseholdMember } from '@/features/household/hooks/useRemoveHouseholdMember'
import { useLeaveHousehold } from '@/features/household/hooks/useLeaveHousehold'
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
import { Skeleton } from '@/components/ui/Skeleton'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SettingsSection } from '@/components/ui/SettingsSection'
import { SettingsRow } from '@/components/ui/SettingsRow'
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
  const biometricAvailability = useBiometricAvailability()
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

  // Remove member (admin-only, non-admin target only) stays on the raw
  // household_members_delete path — see useRemoveHouseholdMember.ts's
  // header comment for why that case needs no succession logic and is safe
  // as-is. Leave household now goes through leave_household() (migration
  // 005) instead: a real SECURITY DEFINER RPC with the same admin-
  // succession / sole-member-cascade logic as delete_own_account(), so —
  // unlike before — an admin can safely leave a multi-member household too
  // (the RPC promotes the longest-tenured remaining member first). See
  // docs/DECISIONS.md ADR-034.
  const removeMember = useRemoveHouseholdMember(householdId)
  const leaveHousehold = useLeaveHousehold()
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

  // Distinguishes the one leave outcome that needs a stronger warning:
  // leave_household() (migration 005) deletes the household outright when
  // the caller is its sole member (ADR-034, same decision as
  // delete_own_account()'s sole-member branch) — the caller's own account
  // is never touched either way, but "leaving" a household you're alone in
  // means its data goes away too, not just your own membership.
  //
  // Deliberately derived from isMembersLoading, not just members.length:
  // useHouseholdMembers.ts defaults `members` to [] while its own query is
  // still pending, which would otherwise make isSoleMember read false for
  // an actually-sole-member household during that window — showing the
  // weaker multi-member confirm copy right before an action that's about
  // to delete the whole household (qa-adversarial-reviewer finding). The
  // Leave button itself is gated on the same flag below, so it simply
  // isn't shown at all until the real member count is known.
  const isSoleMember = !isMembersLoading && members.length === 1

  // Same synchronous double-tap guard as handleConfirmDelete just above —
  // see that function's comment for why isPending alone isn't enough for
  // an irreversible action (qa-adversarial-reviewer finding, carried over
  // from Milestone 9's identical account-deletion guard).
  const isLeavingRef = useRef(false)

  function handleConfirmLeaveHousehold() {
    if (isLeavingRef.current || leaveHousehold.isPending) return
    isLeavingRef.current = true
    leaveHousehold.mutate(undefined, {
      onSuccess: () => {
        isLeavingRef.current = false
        setLeaveConfirmVisible(false)
        setLeaveError(null)
      },
      onError: () => {
        isLeavingRef.current = false
        setLeaveConfirmVisible(false)
        setLeaveError(t('settings.household.leaveErrors.generic'))
      },
    })
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
    <Screen onBack={() => router.back()} width="wide">
      <Text className="mb-6 text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('settings.title')}
      </Text>

      {/* Responsive/desktop pass: profile+household in one column, the rest
          (money management/appearance/security/account) in a second column
          — desktop only (`web:desktop:flex-row`; see _layout.tsx's
          DesktopSideRail comment for why `-reverse` is needed on web).
          Reversing keeps source/DOM order as [profile+household, the rest]
          (primary content announced first) while visually placing
          profile+household on the right and the secondary column on the
          left — the correct RTL reading order. Visual QA + Desktop Polish
          pass: this had silently regressed to plain `flex-row` — the
          dedicated regression test only checked
          `.toContain('web:desktop:flex-row')`, satisfied by both forms, so
          the drift went uncaught. Restored to `-reverse` and the test
          tightened to exact-token matching. Mobile/tablet stay a single
          stacked column in the original order.
          Desktop polish pass (round 2): each column previously reflowed the
          exact same unbounded mobile sections side by side — a real-browser
          visual review found this read as "two independent mobile columns
          placed next to each other," not one desktop settings page. Each
          column got one shared bounded panel (`DESKTOP_PANEL_CLASS` — the
          same border/radius/fill token as Dashboard/Budgets' panels).
          Desktop Visual/Responsive Design pass: that single monolithic
          panel per column is what then made the columns' natural height
          difference (profile+household is short; financial-nav+appearance+
          security+account is long) read as one giant blank gap under the
          shorter column's single box. Split each column into its own
          existing sub-groups as separate panels instead (`items-start`
          already prevents forced-equal-height columns — see below) — the
          height mismatch is still there, but distributed across several
          natural breaks instead of concentrated in one, so it reads as an
          intentional multi-panel column rather than a rendering gap. */}
      <View className="web:desktop:flex-row web:desktop:items-start web:desktop:gap-6">
      <View className="web:desktop:flex-1">
      <View className={DESKTOP_PANEL_CLASS}>
      {/* Profile */}
      {isProfileLoading ? (
        // Release-readiness pass: was a bare LoadingSpinner, unlike every
        // other section on this screen (the members list below already
        // uses SkeletonList) — an unsized spinner replaced by the resolved
        // avatar+name+button Card caused a visible layout jump. Shaped to
        // roughly the resolved Card's own height instead.
        <View className="mb-6">
          <SkeletonList rows={1} rowClassName="h-20 w-full rounded-card" />
        </View>
      ) : isEditingProfile ? (
        <Card>
          <Input
            label={t('settings.profile.nameLabel')}
            value={profileNameDraft}
            onChangeText={setProfileNameDraft}
            autoFocus
          />
          {updateProfile.isError && <ErrorMessage message={t('settings.profile.errors.generic')} />}
          {/* Visual QA pass: was flex-row-reverse — see components/ui/
              Modal.tsx's identical fix. Plain flex-row keeps Save (first
              child) on the right under global.css's direction: rtl. */}
          <View className="flex-row gap-2">
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
        </Card>
      ) : (
        <Card>
          <View className="flex-row items-center gap-3 web:flex-row">
            <Avatar displayName={displayName ?? ''} avatarUrl={avatarUrl} size={56} />
            <View className="flex-1">
              <Text className="text-heading font-semibold text-ink-light dark:text-ink-dark">{displayName}</Text>
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{user?.email}</Text>
            </View>
            <Button title={t('settings.profile.editLabel')} variant="ghost" onPress={handleStartEditProfile} />
          </View>
        </Card>
      )}
      </View>

      {/* Household — own panel at desktop (see the row's own comment above
          for why splitting the column pays off); mobile is unaffected,
          since the wrapping Views carry no unprefixed spacing of their
          own — the mt-6 below is exactly the same margin this heading
          already had before the split. */}
      <View className="web:desktop:mt-4">
      <View className={DESKTOP_PANEL_CLASS}>
      <Text className="mb-2 mt-6 web:desktop:mt-0 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('settings.household.title')}
      </Text>
      <Card>
        {householdError ? (
          <ErrorMessage message={t('household.errors.bug')} />
        ) : isHouseholdLoading ? (
          // Release-readiness pass: same LoadingSpinner-vs-SkeletonList gap
          // as Profile above — this block resolves to a name row plus a
          // short members list, not one spinner-sized shape.
          <View className="gap-3">
            <Skeleton className="h-6 w-1/2 rounded-md" />
            <SkeletonList rows={2} rowClassName="h-8 w-full rounded-md" />
          </View>
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
                {/* Visual QA pass: was flex-row-reverse — see components/ui/
                    Modal.tsx's identical fix. */}
                <View className="flex-row gap-2">
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
              <View className="flex-row items-center justify-between web:flex-row">
                <Text className="text-body font-semibold text-ink-light dark:text-ink-dark">{household?.name}</Text>
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
            <Text className="mb-2 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('settings.household.membersTitle')}
            </Text>
            {removeMemberError && <ErrorMessage message={removeMemberError} />}
            {membersError ? (
              <ErrorMessage message={t('household.errors.bug')} />
            ) : isMembersLoading ? (
              <SkeletonList rows={2} rowClassName="h-8 w-full rounded-md" />
            ) : (
              members.map((member) => (
                <View key={member.userId} className="mb-2 flex-row items-center gap-2 web:flex-row">
                  <Avatar displayName={member.displayName} avatarUrl={member.avatarUrl} size={28} />
                  <Text className="flex-1 text-body text-ink-light dark:text-ink-dark">{member.displayName}</Text>
                  <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                    {member.role === 'admin' ? t('settings.household.roleAdmin') : t('settings.household.roleMember')}
                  </Text>
                  {/* Admin removing a MEMBER row only — never shown for an
                      admin row, and never shown to a non-admin viewer. See
                      useRemoveHouseholdMember.ts for why this is a safe
                      subset of household_members_delete's RLS policy;
                      unlike leave, this case never needs succession logic
                      since it can never remove the household's one admin. */}
                  {role === 'admin' && member.role !== 'admin' && (
                    <Button
                      title={t('settings.household.removeMember')}
                      accessibilityLabel={t('settings.household.removeMemberLabel', { name: member.displayName })}
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
            {/* Leave household — available to both roles now that
                leave_household() (migration 005) handles admin succession
                server-side; an admin leaving a multi-member household no
                longer needs to be blocked, only a sole member/admin leaving
                needs a clearer warning (see isSoleMember above, and the
                distinct confirm message it selects) since that specific
                case deletes the household itself, not just the caller's
                membership. Also gated on !isMembersLoading — showing this
                before the real member count is known is exactly the window
                where isSoleMember could read stale/wrong (see its own
                comment above). */}
            {!isMembersLoading && (role === 'admin' || role === 'member') && (
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
      </View>
      </View>
      </View>

      <View className="web:desktop:flex-1">
      <View className={DESKTOP_PANEL_CLASS}>
      {/* Money management — Milestone 6, reached from Settings, not a tab */}
      <SettingsSection title={t('settings.financial.title')}>
        <SettingsRow iconName="wallet-outline" label={t('settings.financial.accounts')} onPress={() => router.push('/accounts')} />
        <SettingsRow
          iconName="pricetag-outline"
          label={t('settings.financial.categories')}
          onPress={() => router.push('/settings/categories')}
        />
        <SettingsRow iconName="repeat-outline" label={t('settings.financial.recurring')} onPress={() => router.push('/recurring')} />
        <SettingsRow iconName="flag-outline" label={t('settings.financial.goals')} onPress={() => router.push('/goals')} />
        <SettingsRow
          iconName="calendar-outline"
          label={t('settings.financial.obligations')}
          onPress={() => router.push('/obligations')}
        />
        <SettingsRow
          iconName="layers-outline"
          label={t('settings.financial.installments')}
          onPress={() => router.push('/installments')}
        />
      </SettingsSection>
      </View>

      {/* Appearance — own panel at desktop, same rationale as the right
          column's split above. */}
      <View className="web:desktop:mt-4">
      <View className={DESKTOP_PANEL_CLASS}>
      <Text className="mb-2 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('settings.appearance.title')}
      </Text>
      <View className="mb-6 web:desktop:mb-0">
        <SegmentedControl
          accessibilityLabel={t('settings.appearance.title')}
          options={APPEARANCE_OPTIONS.map((option) => ({
            value: option,
            label: option === 'system' ? t('appearance.system') : option === 'light' ? t('theme.light') : t('theme.dark'),
          }))}
          value={preference}
          onChange={(next) => void setPreference(next)}
        />
      </View>
      </View>
      </View>

      {/* Security + Account — grouped into one panel (both short) rather
          than three separate panels, so the left column doesn't fragment
          into more, tinier boxes than the height mismatch actually needs. */}
      <View className="web:desktop:mt-4">
      <View className={DESKTOP_PANEL_CLASS}>
      <SettingsSection title={t('settings.security.title')}>
        <SettingsRow
          iconName="finger-print-outline"
          label={t('settings.security.biometricToggle')}
          value={
            !biometricAvailability.isLoading && !biometricAvailability.isAvailable
              ? t('settings.security.biometricUnavailable')
              : undefined
          }
          trailing={
            <Switch
              value={biometric.enabled}
              onValueChange={biometric.setEnabled}
              disabled={biometric.isLoading || biometricAvailability.isLoading || !biometricAvailability.isAvailable}
              accessibilityLabel={t('settings.security.biometricToggle')}
              trackColor={{
                false: scheme === 'dark' ? colors.border.dark : colors.border.light,
                true: scheme === 'dark' ? colors.accent.dark : colors.accent.light,
              }}
            />
          }
        />
      </SettingsSection>

      {/* Account — sign out / delete. Delete is destructive by construction:
          danger-styled row, explicit confirmation modal, disabled while
          pending so a double-tap can't fire two concurrent deletions (store
          compliance requirement, PROJECT_SPEC.md § Settings). */}
      {deleteAccount.isError && <ErrorMessage message={t('settings.deleteAccount.errors.generic')} />}
      <SettingsSection title={t('settings.account.title')}>
        <SettingsRow iconName="log-out-outline" label={t('settings.signOut')} onPress={() => signOut.mutate()} />
        <SettingsRow
          iconName="trash-outline"
          label={t('settings.deleteAccount.button')}
          onPress={() => setDeleteConfirmVisible(true)}
          disabled={deleteAccount.isPending}
          destructive
        />
      </SettingsSection>
      </View>
      </View>
      </View>
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
        message={
          isSoleMember
            ? t('settings.household.leaveConfirmMessageSoleMember')
            : t('settings.household.leaveConfirmMessage')
        }
        confirmLabel={t('settings.household.leaveConfirmButton')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmLeaveHousehold}
        onCancel={() => setLeaveConfirmVisible(false)}
        destructive
        loading={leaveHousehold.isPending}
      />
    </Screen>
  )
}
