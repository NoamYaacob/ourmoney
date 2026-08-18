// Deterministic unit tests for the guard clause client.ts delegates to.
// See validateSupabaseConfig.ts's own header for why this had to be
// extracted: babel-preset-expo's inline-env-vars plugin bakes
// process.env.EXPO_PUBLIC_* into literal strings at Babel-transform time,
// so a test mutating process.env at runtime and require()ing a file with a
// literal process.env.EXPO_PUBLIC_* reference could never actually exercise
// the "missing" branch (client.test.ts's former two throw-assertion tests
// silently tested nothing, on any machine where these vars happen to be
// exported to the shell — including every CI runner that sets them that
// way). This file supplies plain string/undefined arguments directly, with
// no process.env involved anywhere, so the throw/no-throw behavior is
// actually, deterministically proven.
import { describe, expect, it } from '@jest/globals'
import { validateSupabaseConfig } from './validateSupabaseConfig'

describe('validateSupabaseConfig', () => {
  it('throws a clear, actionable error when the URL is missing', () => {
    expect(() => validateSupabaseConfig(undefined, 'anon-key')).toThrow(/EXPO_PUBLIC_SUPABASE_URL/)
  })

  it('throws a clear, actionable error when the anon key is missing', () => {
    expect(() => validateSupabaseConfig('https://example.supabase.co', undefined)).toThrow(
      /EXPO_PUBLIC_SUPABASE_ANON_KEY/
    )
  })

  it('throws when both are missing', () => {
    expect(() => validateSupabaseConfig(undefined, undefined)).toThrow(/EXPO_PUBLIC_SUPABASE_URL/)
  })

  it('throws when the URL is an empty string', () => {
    expect(() => validateSupabaseConfig('', 'anon-key')).toThrow(/EXPO_PUBLIC_SUPABASE_URL/)
  })

  it('throws when the anon key is an empty string', () => {
    expect(() => validateSupabaseConfig('https://example.supabase.co', '')).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('returns the validated config when both are present', () => {
    const result = validateSupabaseConfig('https://example.supabase.co', 'anon-key')
    expect(result).toEqual({ url: 'https://example.supabase.co', anonKey: 'anon-key' })
  })
})
