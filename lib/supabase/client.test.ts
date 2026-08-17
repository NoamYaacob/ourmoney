import { afterEach, describe, expect, it } from '@jest/globals'

// The two "throws when a required env var is missing" cases used to live
// here, asserting on this module directly. They (and, it turns out, this
// file's own "creates a client" case) shared a bug that had nothing to do
// with Babel inlining: `beforeEach` reassigned the whole `process.env`
// object (`process.env = { ...ORIGINAL_ENV }`) before every test. Under
// babel-preset-expo's inline-env-vars plugin in non-production mode (i.e.
// under Jest), `process.env.EXPO_PUBLIC_*` in application code is rewritten
// to reference `env` imported from `expo/virtual/env` — whose own source is
// literally `export const env = process.env`, a captured reference to
// whichever object was `process.env` at the moment that module first
// loaded. Reassigning `process.env` to a brand-new object afterward leaves
// that captured `env` binding pointing at the OLD object forever — every
// subsequent `process.env.X = ...`/`delete process.env.X` in a test mutates
// the NEW object instead, invisible to `env`, so `client.ts`'s guard clause
// kept reading whatever the true ambient shell had at Jest startup
// regardless of what any individual test did. Confirmed by direct
// reproduction: property mutation IN PLACE (no reassignment of `process.env`
// itself) is correctly observed; reassigning the object is not. See
// validateSupabaseConfig.ts/.test.ts for the "missing" cases — the guard
// clause is now a pure function taking plain arguments, with no
// `process.env` access anywhere in its own source, so its throw/no-throw
// behavior needs no environment-mutation trick at all and is genuinely,
// deterministically tested there.
//
// What's left here is the one thing this module can still honestly prove:
// given a real, explicitly-set environment, requiring it produces a real
// client. Values are set as in-place property mutations (never
// `process.env = {...}`) and restored the same way afterward, so a CI
// runner with no ambient EXPO_PUBLIC_SUPABASE_* exported at all still
// passes this deterministically.
describe('supabase client', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

  afterEach(() => {
    // process.env coerces every assigned value to a string — assigning
    // `undefined` directly would leak the literal string "undefined" into
    // process.env for any test file sharing this worker afterward, rather
    // than genuinely restoring "unset."
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL
    else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl
    if (originalAnonKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey
  })

  it('creates a client when both env vars are present', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('./client')
    expect(supabase).toBeDefined()
  })
})
