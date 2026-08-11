// See docs/DECISIONS.md ADR-031 for why jest-expo was chosen and how Supabase
// is mocked. moduleNameMapper mirrors tsconfig.json's "@/*" path alias;
// jest-expo's own preset already configures transformIgnorePatterns for RN
// modules, so it is left untouched here.
//
// forceExit is NOT needed (Milestone 8 ship-quality fix; previously true).
// Root cause of the leaked-worker warning it was masking: every hook test
// constructed its own `new QueryClient({ defaultOptions: { queries: {
// retry: false } } })` with no gcTime override, so each client's default
// gcTime (5 minutes) applied. @testing-library/react-native's automatic
// per-test cleanup unmounts the rendered tree, which drops each query's
// last observer — and dropping the last observer is exactly what schedules
// query-core's real `setTimeout(..., gcTime)` garbage-collection timer. A
// 5-minute timer easily outlives the test file, which is what Jest was
// warning about. Every test now uses lib/testing/createTestQueryClient.ts,
// which sets gcTime: Infinity — query-core's own isValidTimeout() treats
// Infinity as "never schedule a timer," so no timer is ever created. See
// that file's header comment for the full explanation.
//
// A residual "Jest did not exit one second after the test run has
// completed" warning can still appear after this fix. Investigated via a
// custom reporter's onRunComplete hook logging process._getActiveHandles()
// and process._getActiveRequests() at the exact moment Jest finishes: both
// were empty - there is no leaked timer, socket, or handle in application
// or test code. The process still exits on its own afterward, just slower
// than Jest's 1-second heuristic allows in this sandboxed environment
// (most likely haste-map/cache I/O latency), which reads as a Jest-internal
// false positive here, not a real leak. Do not reintroduce forceExit to
// silence it - re-run the same onRunComplete handle-dump technique first
// if this needs revisiting.
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
}
