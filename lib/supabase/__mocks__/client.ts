// Manual mock for lib/supabase/client.ts. Activated per-test-file via
// `jest.mock('@/lib/supabase/client')` (per Jest's convention: manual mocks
// for local, non-node_modules files are never applied automatically). No
// test using this mock touches a real Supabase project or the network.
//
// createQueryBuilderMock lets a test configure what a `.from(...)` chain
// resolves to without hand-building the real PostgrestFilterBuilder API —
// select/eq/limit/insert/single/maybeSingle all return the same chainable
// object, and the object is thenable so `await` on the chain resolves to
// the configured result, mirroring how the real query builder works
// regardless of call order.

import { jest } from '@jest/globals'

export function createQueryBuilderMock(result: { data: unknown; error: unknown }) {
  const builder: {
    select: jest.Mock
    eq: jest.Mock
    // Milestone 6 additions: transactions/budgets queries chain these too.
    gte: jest.Mock
    lte: jest.Mock
    lt: jest.Mock
    gt: jest.Mock
    is: jest.Mock
    or: jest.Mock
    // Bulk Categorization milestone: bulk update/select queries chain this.
    in: jest.Mock
    order: jest.Mock
    limit: jest.Mock
    insert: jest.Mock
    update: jest.Mock
    delete: jest.Mock
    single: jest.Mock
    maybeSingle: jest.Mock
    then: (
      onfulfilled?: ((value: typeof result) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null
    ) => Promise<unknown>
  } = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    lt: jest.fn(() => builder),
    gt: jest.fn(() => builder),
    is: jest.fn(() => builder),
    or: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    single: jest.fn(() => builder),
    maybeSingle: jest.fn(() => builder),
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
  rpc: jest.fn(),
  // Milestone 6: minimal chainable Realtime channel mock —
  // useTransactionsRealtimeSync.ts's own test configures `.on()`'s captured
  // callback and asserts `.subscribe()`/`removeChannel()` lifecycle calls.
  channel: jest.fn(() => {
    const chain = {
      on: jest.fn(() => chain),
      subscribe: jest.fn(() => chain),
    }
    return chain
  }),
  removeChannel: jest.fn(),
}
