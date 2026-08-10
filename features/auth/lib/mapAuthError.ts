// Maps any Supabase Auth failure to one generic, per-flow i18n key. Never
// surfaces a raw Supabase error string, and deliberately does not branch on
// error.message/status/code: a flow-specific generic message (e.g. "wrong
// email or password") is itself already the least specific answer a given
// flow can give. Distinguishing "email already registered" from other
// sign-up failures would turn the sign-up form into a user-enumeration
// oracle — the same posture accept_invitation takes for token validity
// (ADR-010 condition 9).

export type AuthFlow = 'signIn' | 'signUp' | 'forgotPassword' | 'resetPassword'

const GENERIC_KEY_BY_FLOW: Record<AuthFlow, string> = {
  signIn: 'auth.errors.signInFailed',
  signUp: 'auth.errors.signUpFailed',
  forgotPassword: 'auth.errors.generic',
  resetPassword: 'auth.errors.resetPasswordFailed',
}

export function mapAuthError(flow: AuthFlow, _error: unknown): string {
  return GENERIC_KEY_BY_FLOW[flow]
}
