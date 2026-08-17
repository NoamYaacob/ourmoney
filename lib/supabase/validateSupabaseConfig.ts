// Pure, parameter-driven validation — deliberately never reads
// `process.env` itself, so a test can supply defined/undefined values
// directly and deterministically, with no environment-mutation trickery
// involved at all. See client.test.ts's header for the full, verified
// account of why the previous approach (mutating `process.env` at Jest
// runtime and `require()`ing a file that reads `process.env.EXPO_PUBLIC_*`)
// was unreliable in this project's specific Jest setup — in short,
// `babel-preset-expo`'s inline-env-vars plugin rewrites
// `process.env.EXPO_PUBLIC_*` to a reference into `expo/virtual/env`
// (`export const env = process.env`) under Jest, and the previous test
// broke that reference by reassigning `process.env` to a new object in
// `beforeEach` rather than mutating it in place — not, as first assumed,
// because the plugin bakes a literal at Babel-transform time (it only does
// that for real production builds). `client.ts` still reads
// `process.env.EXPO_PUBLIC_*` directly at its own call site for the real
// app; this file just receives the resolved values as arguments instead of
// duplicating the read.
export interface SupabaseConfig {
  url: string
  anonKey: string
}

export function validateSupabaseConfig(url: string | undefined, anonKey: string | undefined): SupabaseConfig {
  // Fail loudly at startup rather than letting createClient() throw an
  // opaque "supabaseUrl is required" error, or worse, silently construct a
  // client that fails confusingly on its first real request.
  if (!url || !anonKey) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Set them in your .env before starting the app.'
    )
  }
  return { url, anonKey }
}
