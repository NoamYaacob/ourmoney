// See docs/DECISIONS.md ADR-031 for why jest-expo was chosen and how Supabase
// is mocked. moduleNameMapper mirrors tsconfig.json's "@/*" path alias;
// jest-expo's own preset already configures transformIgnorePatterns for RN
// modules, so it is left untouched here. forceExit is needed because
// TanStack Query's QueryClient schedules real gcTime setTimeout timers per
// query that otherwise keep the process alive well past test completion.
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  forceExit: true,
}
