// Regression coverage for a real production bug, not a hypothetical one:
// this repo shipped for several commits with no vercel.json at all, so
// Vercel's static file server 404'd on every direct navigation to an
// internal route (e.g. /dashboard, /diagnostics) — the app only ever
// worked when reached via client-side navigation from "/", never via a
// hard refresh, a pasted link, or a bookmark. Root cause: Expo Router's
// web export (app.json has no `expo.web.output`, so it defaults to
// `"single"`) produces exactly one `index.html` at the export root plus
// hashed static assets — there is no `dashboard/index.html` on disk for
// Vercel to serve directly. The fix is Vercel's own documented SPA
// fallback pattern (vercel.json's `rewrites`), which only takes effect in
// production — nothing in this repo's normal `npm test`/`tsc`/local
// `expo start` run ever exercises Vercel's routing layer, which is
// exactly how this shipped unnoticed. This test can't run a real Vercel
// deployment, but it can guarantee the config that fixed it doesn't
// silently disappear or get merged into something that stops matching.
//
// For actual end-to-end proof beyond this shape check — a genuinely cold,
// direct HTTP load of /dashboard booting the real app and rendering the
// right route, not a client-side transition — build a web export
// (`npx expo export --platform web`) and serve `dist/` through a server
// that implements exactly vercel.json's two rules (serve a literal file
// if one exists on disk, else return index.html), the same way
// https://vercel.com/docs/project-configuration/vercel-json's own
// "Configure SPA catch-all rewrite" example is documented to behave —
// `vercel dev` would be the more direct way to verify this but requires
// Vercel authentication.

import { describe, expect, it } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('vercel.json — SPA fallback for direct navigation to an internal route', () => {
  const raw = readFileSync(join(__dirname, 'vercel.json'), 'utf-8')
  const config: { rewrites?: { source: string; destination: string }[]; routes?: unknown; builds?: unknown } =
    JSON.parse(raw)

  it('is valid JSON with a rewrites array', () => {
    expect(Array.isArray(config.rewrites)).toBe(true)
    expect(config.rewrites!.length).toBeGreaterThan(0)
  })

  it('has a catch-all rewrite to /index.html, so a hard refresh or a pasted link to any internal route (e.g. /dashboard, /diagnostics) is served the app shell instead of a 404', () => {
    const catchAll = config.rewrites!.find((r) => r.destination === '/index.html')
    expect(catchAll).toBeDefined()
    // The exact pattern matters: it must match an arbitrary path
    // (Expo Router's routes, including nested ones like
    // /transactions/new), not just the root or one specific segment.
    expect(catchAll!.source).toMatch(/\(\.\*\)/)
    // Every real internal route this app has must actually satisfy that
    // pattern — this is what would have caught the original bug directly.
    const sourceRegex = new RegExp(`^${catchAll!.source}$`)
    for (const route of ['/dashboard', '/diagnostics', '/cash-flow', '/transactions/new', '/settings']) {
      expect(route).toMatch(sourceRegex)
    }
  })

  it('does not mix in the legacy builds/routes config, which would override rewrites entirely', () => {
    // Vercel docs: a vercel.json using the legacy `builds`/`routes` shape
    // does not process `rewrites` the same way — mixing them is a
    // documented footgun, not a supported combination.
    expect(config.builds).toBeUndefined()
    expect(config.routes).toBeUndefined()
  })
})
