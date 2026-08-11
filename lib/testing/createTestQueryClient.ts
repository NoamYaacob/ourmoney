// Shared factory for the QueryClient every hook test constructs to wrap its
// renderHook/render call in a <QueryClientProvider>. Exists specifically to
// fix the "worker process has failed to exit gracefully" warning that used
// to force jest.config.js's forceExit: true.
//
// Root cause (confirmed against @tanstack/query-core's actual source, not
// guessed): every test previously did `new QueryClient({ defaultOptions:
// { queries: { retry: false } } })` with no gcTime override, so each
// client's default gcTime (5 minutes) applied. @testing-library/react-native
// auto-unmounts the rendered tree after each test (its own afterEach(cleanup)),
// which correctly drops each query's last observer — but dropping the last
// observer is exactly what schedules query-core's real `setTimeout(...,
// gcTime)` garbage-collection timer (see Removable#scheduleGc in
// @tanstack/query-core). With a 5-minute gcTime, that timer is still live
// long after the test file finishes, which is the leaked handle Jest was
// warning about.
//
// gcTime: Infinity is the fix, not gcTime: 0 — query-core's own
// isValidTimeout() treats Infinity as "never schedule a timer" (returns
// false), so no setTimeout is ever created in the first place. gcTime: 0
// would still create a real (if immediate) timer, which is a race against
// the test process exiting rather than a guarantee.
import { QueryClient } from '@tanstack/react-query'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  })
}
