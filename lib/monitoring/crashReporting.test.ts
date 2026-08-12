import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockInit = jest.fn()
const mockCaptureException = jest.fn()
const mockAddBreadcrumb = jest.fn()

jest.mock('@sentry/react-native', () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
}))

import {
  addBreadcrumb,
  beforeBreadcrumb,
  beforeSend,
  captureException,
  initCrashReporting,
} from './crashReporting'

describe('crashReporting', () => {
  const ORIGINAL_DEV = (globalThis as unknown as { __DEV__: boolean }).__DEV__

  // Deliberately NOT `process.env = { ...ORIGINAL_ENV }` — in this
  // jest-expo test environment (unlike plain Node), wholesale-reassigning
  // process.env silently breaks subsequent property reads within the same
  // test (confirmed empirically: assign-then-read-in-the-same-test returns
  // undefined). Mutating/deleting the one key under test and restoring it
  // afterward is the pattern that actually works.
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN
    ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = ORIGINAL_DEV
  })

  describe('beforeBreadcrumb', () => {
    it('drops console-category breadcrumbs entirely', () => {
      const result = beforeBreadcrumb({
        category: 'console',
        message: 'debug: amountAgorot=12000',
      })
      expect(result).toBeNull()
    })

    it('strips data/body and query string from http-category breadcrumbs', () => {
      const result = beforeBreadcrumb({
        category: 'http',
        data: {
          url: 'https://x.supabase.co/rest/v1/transactions?household_id=abc-123',
          body: '{"amount_agorot":12000}',
          method: 'POST',
          status_code: 200,
        },
      })
      expect(result?.data?.url).toBe('https://x.supabase.co/rest/v1/transactions')
      expect(result?.data?.body).toBeUndefined()
      expect(result?.data?.data).toBeUndefined()
      expect(result?.data?.method).toBe('POST')
      expect(result?.data?.status_code).toBe(200)
    })

    it('strips fetch/xhr categories the same way as http', () => {
      const fetchResult = beforeBreadcrumb({
        category: 'fetch',
        data: { url: 'https://x.supabase.co/rest/v1/accounts?id=eq.1', method: 'GET' },
      })
      expect(fetchResult?.data?.url).toBe('https://x.supabase.co/rest/v1/accounts')

      const xhrResult = beforeBreadcrumb({
        category: 'xhr',
        data: { url: 'https://x.supabase.co/rest/v1/budgets', body: '{"amount_agorot":500}' },
      })
      expect(xhrResult?.data?.body).toBeUndefined()
    })

    it('passes benign breadcrumbs through unchanged', () => {
      const breadcrumb = { category: 'navigation', message: 'dashboard -> settings' }
      expect(beforeBreadcrumb(breadcrumb)).toEqual(breadcrumb)
    })

    it('deep-scrubs data on non-HTTP breadcrumb categories too, not just http/fetch/xhr', () => {
      const result = beforeBreadcrumb({
        category: 'ui.click',
        data: { label: 'pay button', amountAgorot: 5000, screen: 'dashboard' },
      })
      expect(result?.data).toEqual({ label: 'pay button', screen: 'dashboard' })
    })

    it('redacts a breadcrumb message that matches the deny-list', () => {
      const result = beforeBreadcrumb({ category: 'navigation', message: 'amountAgorot=12000' })
      expect(result?.message).toBe('[redacted by crash-reporting scrub rules — see ADR-033]')
    })

    it('redacts breadcrumb data.<key> VALUES that match the deny-list, not just the keys themselves (final-review finding)', () => {
      // A benignly-named key ("label") holding a sensitive value must still
      // be caught — key-based filtering alone would let this through.
      const result = beforeBreadcrumb({
        category: 'ui.click',
        data: { label: 'Paid amountAgorot 50000 to merchant Rami Levy' },
      })
      expect(result?.data?.label).toBe('[redacted by crash-reporting scrub rules — see ADR-033]')
    })
  })

  describe('beforeSend', () => {
    it('strips top-level extra keys matching the deny-list', () => {
      const result = beforeSend({
        type: undefined,
        extra: { amountAgorot: 5000, screen: 'dashboard' },
      })
      expect(result?.extra).toEqual({ screen: 'dashboard' })
    })

    it('strips context keys matching the deny-list', () => {
      const result = beforeSend({
        type: undefined,
        contexts: { household: { id: 'h1', name: 'Cohen family' }, device: { model: 'iPhone 15' } },
      })
      expect(result?.contexts).toEqual({ device: { model: 'iPhone 15' } })
    })

    it('recurses into nested objects, not just top-level keys', () => {
      const result = beforeSend({
        type: undefined,
        extra: { foo: { email: 'user@example.com', safe: 'ok' } },
      })
      expect(result?.extra).toEqual({ foo: { safe: 'ok' } })
    })

    it('leaves an event with no matching keys unchanged', () => {
      const event = { type: undefined, extra: { screen: 'dashboard', action: 'tap' } }
      expect(beforeSend(event)).toEqual(event)
    })

    it('redacts an extra VALUE matching the deny-list even under a benign key name (final-review finding)', () => {
      // Key-only filtering would miss this: "debugInfo" isn't on the
      // deny-list, but its string value contains "amountAgorot"/"household".
      const result = beforeSend({
        type: undefined,
        extra: { debugInfo: 'Failed to sync: amountAgorot=1234500 household=abc-123 for user@example.com' },
      })
      expect(result?.extra).toEqual({
        debugInfo: '[redacted by crash-reporting scrub rules — see ADR-033]',
      })
    })

    it('redacts a nested context VALUE matching the deny-list even under a benign key name (final-review finding)', () => {
      const result = beforeSend({
        type: undefined,
        contexts: { debugState: { info: 'household abc-123 balance 500000 agorot' } },
      })
      expect(result?.contexts).toEqual({
        debugState: { info: '[redacted by crash-reporting scrub rules — see ADR-033]' },
      })
    })

    it('applies the breadcrumb scrub to every breadcrumb on the event', () => {
      const result = beforeSend({
        type: undefined,
        breadcrumbs: [
          { category: 'console', message: 'debug' },
          { category: 'navigation', message: 'a -> b' },
        ],
      })
      expect(result?.breadcrumbs).toEqual([{ category: 'navigation', message: 'a -> b' }])
    })

    it('redacts an exception message that interpolates a domain value (the real-world leak path)', () => {
      const result = beforeSend({
        type: undefined,
        exception: {
          values: [
            {
              type: 'Error',
              value: 'insufficient funds: amountAgorot=1234500, account=he-checking-01',
            },
          ],
        },
      })
      expect(result?.exception?.values?.[0]?.value).toBe(
        '[redacted by crash-reporting scrub rules — see ADR-033]'
      )
      // The exception type itself is not sensitive and stays untouched.
      expect(result?.exception?.values?.[0]?.type).toBe('Error')
    })

    it('leaves a benign exception message untouched', () => {
      const result = beforeSend({
        type: undefined,
        exception: { values: [{ type: 'TypeError', value: "Cannot read property 'x' of undefined" }] },
      })
      expect(result?.exception?.values?.[0]?.value).toBe("Cannot read property 'x' of undefined")
    })

    it('redacts event.message when it matches the deny-list', () => {
      const result = beforeSend({ type: undefined, message: 'household abc-123 not found' })
      expect(result?.message).toBe('[redacted by crash-reporting scrub rules — see ADR-033]')
    })

    it('strips the expanded deny-list keys the review pass added (user, description, note, csv)', () => {
      const result = beforeSend({
        type: undefined,
        extra: {
          userId: 'user-uuid-999',
          description: 'Whole Foods weekly groceries run',
          note: 'private note',
          displayName: 'Noam Cohen',
          csvContent: 'date,amount\n2026-01-01,500',
          safe: 'ok',
        },
      })
      expect(result?.extra).toEqual({ safe: 'ok' })
    })
  })

  describe('initCrashReporting', () => {
    it('does not call Sentry.init when the DSN is unset', () => {
      delete process.env.EXPO_PUBLIC_SENTRY_DSN
      expect(() => initCrashReporting()).not.toThrow()
      expect(mockInit).not.toHaveBeenCalled()
    })

    it('calls Sentry.init with the expected data-minimization shape when the DSN is set', () => {
      process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0'
      initCrashReporting()

      expect(mockInit).toHaveBeenCalledTimes(1)
      const options = mockInit.mock.calls[0]![0] as Record<string, unknown>
      expect(options.dsn).toBe('https://example@o0.ingest.sentry.io/0')
      expect(options.sendDefaultPii).toBe(false)
      expect(options.tracesSampleRate).toBe(0)
      expect(options.integrations).toEqual([])
      expect(typeof options.beforeSend).toBe('function')
      expect(typeof options.beforeBreadcrumb).toBe('function')
    })

    it('passes enabled: false when __DEV__ is true', () => {
      ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true
      process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0'
      initCrashReporting()

      const options = mockInit.mock.calls[0]![0] as Record<string, unknown>
      expect(options.enabled).toBe(false)
      expect(options.environment).toBe('development')
    })

    it('passes enabled: true when __DEV__ is false', () => {
      ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false
      process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0'
      initCrashReporting()

      const options = mockInit.mock.calls[0]![0] as Record<string, unknown>
      expect(options.enabled).toBe(true)
      expect(options.environment).toBe('production')
    })

    it('never throws even if Sentry.init itself throws', () => {
      mockInit.mockImplementationOnce(() => {
        throw new Error('native module not linked')
      })
      process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://example@o0.ingest.sentry.io/0'
      expect(() => initCrashReporting()).not.toThrow()
    })
  })

  describe('captureException', () => {
    it('calls Sentry.captureException exactly once with the error', () => {
      const error = new Error('boom')
      captureException(error)
      expect(mockCaptureException).toHaveBeenCalledTimes(1)
      expect(mockCaptureException).toHaveBeenCalledWith(error, undefined)
    })

    it('passes a flat string-keyed context through as extra', () => {
      const error = new Error('boom')
      captureException(error, { screen: 'dashboard' })
      expect(mockCaptureException).toHaveBeenCalledWith(error, { extra: { screen: 'dashboard' } })
    })

    it('never throws even if Sentry.captureException itself throws — called from componentDidCatch, which nothing else protects', () => {
      mockCaptureException.mockImplementationOnce(() => {
        throw new Error('SDK internal failure')
      })
      expect(() => captureException(new Error('boom'))).not.toThrow()
    })
  })

  describe('addBreadcrumb', () => {
    it('calls Sentry.addBreadcrumb with message and category', () => {
      addBreadcrumb('splash timeout fired', 'startup')
      expect(mockAddBreadcrumb).toHaveBeenCalledWith({
        message: 'splash timeout fired',
        category: 'startup',
      })
    })

    it('never throws even if Sentry.addBreadcrumb itself throws', () => {
      mockAddBreadcrumb.mockImplementationOnce(() => {
        throw new Error('SDK internal failure')
      })
      expect(() => addBreadcrumb('x')).not.toThrow()
    })
  })
})
