// Establishes a Supabase session from the ourmoney://reset-password deep
// link so app/reset-password.tsx's supabase.auth.updateUser() call has a
// session to operate on (adversarial + mobile review finding — without this,
// the entire forgot-password flow was non-functional: resetPasswordForEmail
// sends the email correctly, but nothing ever turned the resulting deep link
// into a session, so updateUser always failed with "Auth session missing").
//
// lib/supabase/client.ts sets detectSessionInUrl: false, which is correct
// for React Native (there is no browser URL bar to auto-read) but means this
// has to be done by hand: catch the incoming URL (cold start via
// getInitialURL, or a warm-start 'url' event), pull access_token/
// refresh_token out of it, and call supabase.auth.setSession() explicitly.
// The client's flowType is unset, so auth-js defaults to 'implicit', which
// delivers these in the URL fragment (#access_token=...&refresh_token=...
// &type=recovery) — unlike a web browser fragment, this IS part of the
// string a native deep link handler receives, so a manual URLSearchParams
// parse over the substring after '#' is sufficient; expo-linking's own
// Linking.parse() only reads the query string and would silently miss these.
// The '?' fallback below is defensive only, not PKCE support: if flowType is
// ever switched to 'pkce', the link instead carries a `code` query param
// that must be exchanged via supabase.auth.exchangeCodeForSession(code), a
// different call entirely — this hook would need updating, not just the
// parsing branch, and would otherwise fail closed (status 'error') rather
// than silently mishandling the token.
//
// setSession() replaces whatever session was previously active, which is the
// correct behavior here: a recovery link must always win over any prior
// session on the device, never silently update an unrelated signed-in user.

import { useEffect, useState } from 'react'
import * as Linking from 'expo-linking'
import { supabase } from '@/lib/supabase/client'

export type RecoverySessionStatus = 'loading' | 'ready' | 'error'

function extractTokensFromUrl(url: string): { accessToken: string; refreshToken: string } | null {
  const hashIndex = url.indexOf('#')
  const queryIndex = url.indexOf('?')
  const paramsString =
    hashIndex >= 0 ? url.slice(hashIndex + 1) : queryIndex >= 0 ? url.slice(queryIndex + 1) : ''
  const params = new URLSearchParams(paramsString)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken }
}

export function useRecoverySession(): RecoverySessionStatus {
  const [status, setStatus] = useState<RecoverySessionStatus>('loading')

  useEffect(() => {
    let isMounted = true

    async function establish(url: string | null) {
      const tokens = url ? extractTokensFromUrl(url) : null
      if (!tokens) {
        if (isMounted) setStatus('error')
        return
      }
      const { error } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      })
      if (isMounted) setStatus(error ? 'error' : 'ready')
    }

    void Linking.getInitialURL().then(establish)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void establish(url)
    })

    return () => {
      isMounted = false
      subscription.remove()
    }
  }, [])

  return status
}
