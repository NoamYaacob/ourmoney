const { withNativeWind } = require('nativewind/metro')
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

// getSentryExpoConfig (not the generic withSentryConfig(getDefaultConfig(...))
// composition) is Sentry's Expo-specific integration path — it calls
// expo/metro-config's getDefaultConfig() internally and wires debug-ID
// injection through Metro's newer unstable_beforeAssetSerializationPlugins
// hook. The generic withSentryConfig() wraps Metro's legacy customSerializer
// instead, which crashes during `expo export --platform web`
// (TypeError: Cannot read properties of undefined (reading 'match') in
// determineDebugIdFromBundleSource — bundleCode comes back undefined for a
// web production bundle under this Metro/Expo version combination). The
// Expo-specific path does not hit that code path. See ADR-033.
const config = getSentryExpoConfig(__dirname)

// Expo Router's require.context for app/ has no built-in exclusion for the
// *.test.ts(x) naming convention this repo uses (only __tests__/ directories
// and +api/+html/+middleware are excluded by default — see node_modules/
// expo-router/_ctx.*.js). A *_layout.test.tsx living next to its real
// _layout.tsx therefore got swept in as a route file and bundled into the
// app, pulling in expo-router/testing-library's Node-only `path` import —
// which fails to resolve for `expo export --platform ios` (native has no
// browser polyfill for it, unlike web). Extending the default blockList
// (already excludes __tests__/) to the *.test./*.spec. convention keeps
// every test file out of every platform's bundle, regardless of where in
// the tree it lives; Jest itself never reads metro.config.js, so this has
// no effect on `npm test`.
config.resolver.blockList = [...config.resolver.blockList, /\.(test|spec)\.[jt]sx?$/]

// Design QA data source (docs/DESIGN_QA_MODE.md): when DESIGN_QA is set to
// one of the modes below, resolve the Supabase client to the matching
// dev/designQa*Client.ts fixture instead, so screens can be rendered
// against mock data for visual/functional comparison without any Supabase
// project configured. Off by default — a normal `expo start`/`expo export`
// never sets this, so this branch never runs outside a developer explicitly
// opting in on their own machine.
//
//   DESIGN_QA=1          the original fixture: authenticated, with a
//                        household and its full financial data.
//   DESIGN_QA=signedout  no session at all — for sign-in/sign-up/
//                        forgot-password, which the `1` fixture's always-
//                        authenticated session redirected straight past.
//   DESIGN_QA=onboarding authenticated, but with no household yet — for
//                        the onboarding flow, which `1`'s existing
//                        household also redirected straight past.
//   DESIGN_QA=empty      authenticated, with a household, but zero
//                        accounts/transactions/budgets/recurring/
//                        obligations/goals/instalments — the first-time-
//                        user state right after onboarding finishes.
//   DESIGN_QA=stress     authenticated, with a household carrying 10
//                        accounts, 20+ categories, 130+ transactions,
//                        several recurring charges, instalment plans and
//                        savings goals — a used-for-a-year household.
const DESIGN_QA_CLIENT_FILES = {
  '1': 'dev/designQaClient.ts',
  signedout: 'dev/designQaSignedOutClient.ts',
  onboarding: 'dev/designQaOnboardingClient.ts',
  empty: 'dev/designQaEmptyClient.ts',
  stress: 'dev/designQaStressClient.ts',
  // CP8E — Financial Pulse deterministic snapshot states. Each is
  // DESIGN_QA=1's own household/financial fixture (pulse-secondary reuses
  // `stress` instead, for its already-existing Netflix price-increase
  // history), overriding only the financial_pulse_snapshots row — see each
  // file's own header for the exact scenario and figures.
  'pulse-first': 'dev/designQaPulseFirstClient.ts',
  'pulse-negative': 'dev/designQaPulseNegativeClient.ts',
  'pulse-positive': 'dev/designQaPulsePositiveClient.ts',
  'pulse-nochange': 'dev/designQaPulseNoChangeClient.ts',
  'pulse-secondary': 'dev/designQaPulseSecondaryClient.ts',
}
const designQaTargetFile = DESIGN_QA_CLIENT_FILES[process.env.DESIGN_QA]
if (designQaTargetFile) {
  const path = require('path')
  const original = config.resolver.resolveRequest
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolved = (original ?? context.resolveRequest)(context, moduleName, platform)
    if (resolved && typeof resolved.filePath === 'string' && /lib[\\/]supabase[\\/]client\.ts$/.test(resolved.filePath)) {
      return { type: 'sourceFile', filePath: path.join(__dirname, designQaTargetFile) }
    }
    return resolved
  }
}

module.exports = withNativeWind(config, { input: './global.css' })
