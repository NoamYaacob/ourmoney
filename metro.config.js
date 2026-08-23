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


// TEMPORARY visual-QA hook (not committed): when QA_FIXTURES=1, resolve the
// Supabase client to a local fixture module so authenticated screens can be
// rendered in a browser for design comparison. Off by default.
if (process.env.QA_FIXTURES === '1') {
  const path = require('path')
  const original = config.resolver.resolveRequest
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolved = (original ?? context.resolveRequest)(context, moduleName, platform)
    if (resolved && typeof resolved.filePath === 'string' && /lib[\\/]supabase[\\/]client\.ts$/.test(resolved.filePath)) {
      return { type: 'sourceFile', filePath: path.join(__dirname, '.qa/fixtureClient.ts') }
    }
    return resolved
  }
}

module.exports = withNativeWind(config, { input: './global.css' })
