import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

describe('supabase client', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('throws a clear, actionable error when EXPO_PUBLIC_SUPABASE_URL is missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    // require(), not import() — Jest's dynamic import() needs
    // --experimental-vm-modules, which this project doesn't enable; require()
    // still re-evaluates the module fresh under jest.resetModules() above.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('./client')).toThrow(/EXPO_PUBLIC_SUPABASE_URL/)
  })

  it('throws a clear, actionable error when EXPO_PUBLIC_SUPABASE_ANON_KEY is missing', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('./client')).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('creates a client when both env vars are present', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('./client')
    expect(supabase).toBeDefined()
  })
})
