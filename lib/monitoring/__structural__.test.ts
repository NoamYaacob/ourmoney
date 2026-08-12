// Executable form of the two permanent invariants ADR-033 and
// ARCHITECTURE.md's "crash-reporting constraint" section state in prose:
// no direct Sentry.* call outside this module, and Sentry.setUser() is never
// called anywhere. Mirrors the existing WhatsApp-grep invariant
// (docs/ARCHITECTURE.md), brought to the client/TypeScript layer for the
// first time — supabase/rls_tests.sql is the only prior structural-guard
// precedent in this codebase, at the database layer.

import { describe, expect, it } from '@jest/globals'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../../')

function grep(args: string[]): string {
  try {
    return execFileSync('grep', args, { cwd: REPO_ROOT, encoding: 'utf-8' })
  } catch (error) {
    // grep exits 1 when there are no matches — that's the expected "pass"
    // case for both invariants below, not a real error.
    const execError = error as { status?: number; stdout?: string }
    if (execError.status === 1) return ''
    throw error
  }
}

describe('crash-reporting structural invariants (ADR-033)', () => {
  it('no direct Sentry.* call exists outside lib/monitoring/', () => {
    // hooks/ and store/ are real, actively-used top-level directories
    // (CLAUDE.md's project structure) — a stray Sentry.* call placed there
    // would silently pass this check if they were omitted, so both are
    // included alongside features/app/lib/components.
    const matches = grep([
      '-rn',
      'Sentry\\.',
      'features/',
      'app/',
      'lib/',
      'components/',
      'hooks/',
      'store/',
      '--exclude-dir=monitoring',
    ])
    expect(matches).toBe('')
  })

  it('Sentry.setUser() is never called anywhere in lib/monitoring/', () => {
    // --exclude=*.test.ts: this invariant is about real call sites, not the
    // string "Sentry.setUser(" appearing in this describe block's own title
    // or in crashReporting.test.ts's assertions about the mock.
    const matches = grep(['-rn', 'Sentry\\.setUser(', 'lib/monitoring/', '--exclude=*.test.ts'])
    expect(matches).toBe('')
  })
})
