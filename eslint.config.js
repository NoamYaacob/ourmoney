// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/.temp and supabase/.branches are Supabase-CLI-managed local
    // runtime artifacts (already in supabase/.gitignore), not source code.
    ignores: ['dist/*', 'supabase/.temp/**', 'supabase/.branches/**'],

    rules: {
      // False positive from eslint-plugin-import:
      // Node + TypeScript resolve this installed native package correctly.
      'import/no-unresolved': [
        'error',
        {
          ignore: ['^@react-native-community/datetimepicker$'],
        },
      ],
    },
  },
]);
