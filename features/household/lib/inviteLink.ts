// Pure — no Supabase, no Share API — so the deep-link shape and share copy
// are testable without mocking anything. See ADR-009 (token + native share
// sheet, no transactional email).

import type { TFunction } from 'i18next'

export function buildInviteDeepLink(token: string): string {
  return `ourmoney://invite/${token}`
}

export function buildInviteShareMessage(t: TFunction, token: string): string {
  return t('onboarding.invitePartner.shareMessage', { link: buildInviteDeepLink(token) })
}
