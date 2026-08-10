// Manual mock for lib/supabase/client.ts. Activated per-test-file via
// `jest.mock('@/lib/supabase/client')` (per Jest's convention: manual mocks
// for local, non-node_modules files are never applied automatically). No
// test using this mock touches a real Supabase project or the network.
//
// createQueryBuilderMock lets a test configure what a `.from(...)` chain
// resolves to without hand-building the real PostgrestFilterBuilder API —
// select/eq/limit all return the same chainable object, and the object is
// thenable so `await` on the chain resolves to the configured result,
// mirroring how the real query builder works regardless of call order.

import { jest } from '@jest/globals'

export function createQueryBuilderMock(result: { data: unknown; error: unknown }) {
  const builder: {
    select: jest.Mock
    eq: jest.Mock
    limit: jest.Mock
    then: (
      onfulfilled?: ((value: typeof result) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null
    ) => Promise<unknown>
  } = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    then: (onfulfilled, onrejected) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return builder
}

export const supabase = {
  auth: {
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(),
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    updateUser: jest.fn(),
    setSession: jest.fn(),
    signOut: jest.fn(),
  },
  from: jest.fn(),
}
