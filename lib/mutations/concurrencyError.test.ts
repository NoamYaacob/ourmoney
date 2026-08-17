import { describe, expect, it } from '@jest/globals'
import { ConcurrencyError, isConflictError, isNotFoundError, throwOnMutationFailure } from './concurrencyError'

describe('throwOnMutationFailure', () => {
  it('does not throw for an ok:true result', () => {
    expect(() => throwOnMutationFailure({ ok: true, version: 2 })).not.toThrow()
  })

  it('throws a ConcurrencyError with kind conflict for error:"conflict"', () => {
    try {
      throwOnMutationFailure({ ok: false, error: 'conflict' })
      throw new Error('expected throwOnMutationFailure to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ConcurrencyError)
      expect((error as ConcurrencyError).kind).toBe('conflict')
    }
  })

  it('throws a ConcurrencyError with kind not_found for error:"not_found"', () => {
    try {
      throwOnMutationFailure({ ok: false, error: 'not_found' })
      throw new Error('expected throwOnMutationFailure to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(ConcurrencyError)
      expect((error as ConcurrencyError).kind).toBe('not_found')
    }
  })

  it('throws a plain Error carrying the RPC error code for any other error', () => {
    try {
      throwOnMutationFailure({ ok: false, error: 'invalid_amount' })
      throw new Error('expected throwOnMutationFailure to throw')
    } catch (error) {
      expect(error).not.toBeInstanceOf(ConcurrencyError)
      expect(error).toEqual(expect.objectContaining({ message: 'invalid_amount' }))
    }
  })

  it('throws a plain Error with a fallback message when error is missing', () => {
    try {
      throwOnMutationFailure({ ok: false })
      throw new Error('expected throwOnMutationFailure to throw')
    } catch (error) {
      expect(error).toEqual(expect.objectContaining({ message: 'unknown_error' }))
    }
  })
})

describe('isConflictError / isNotFoundError', () => {
  it('distinguish conflict from not_found and from unrelated errors', () => {
    const conflict = new ConcurrencyError('conflict')
    const notFound = new ConcurrencyError('not_found')
    const generic = new Error('invalid_amount')

    expect(isConflictError(conflict)).toBe(true)
    expect(isConflictError(notFound)).toBe(false)
    expect(isConflictError(generic)).toBe(false)

    expect(isNotFoundError(notFound)).toBe(true)
    expect(isNotFoundError(conflict)).toBe(false)
    expect(isNotFoundError(generic)).toBe(false)
  })
})
