// create_household/accept_invitation return typed success/failure JSONB —
// they don't throw for their "expected failure" cases, unlike Supabase Auth
// (features/auth/lib/mapAuthError.ts maps thrown exceptions; this switches
// over a known literal error code). invalid_invitation deliberately does not
// branch further — collapsing invalid/expired/reused/revoked into one
// generic message is what makes accept_invitation's ten conditions
// (ADR-010) actually non-enumerating on the client too.

export type CreateHouseholdErrorCode = 'invalid_name' | 'already_in_household' | 'unauthenticated'
export type AcceptInvitationErrorCode = 'already_in_household' | 'invalid_invitation' | 'unauthenticated'

export function mapCreateHouseholdError(code: CreateHouseholdErrorCode): string {
  switch (code) {
    case 'invalid_name':
      return 'household.errors.invalidName'
    case 'already_in_household':
      return 'household.errors.alreadyInHousehold'
    case 'unauthenticated':
      return 'household.errors.bug'
  }
}

export function mapAcceptInvitationError(code: AcceptInvitationErrorCode): string {
  switch (code) {
    case 'already_in_household':
      return 'household.errors.alreadyInHousehold'
    case 'invalid_invitation':
      return 'invite.errors.invalidInvitation'
    case 'unauthenticated':
      return 'household.errors.bug'
  }
}
