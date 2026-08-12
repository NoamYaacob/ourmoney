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

module.exports = withNativeWind(config, { input: './global.css' })
