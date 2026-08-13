import { describe, expect, it } from '@jest/globals'
import { decodeCsvBytes } from './decodeCsvBytes'

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('decodeCsvBytes', () => {
  it('decodes an ASCII-only CSV as utf-8 (never inferred as windows-1255)', () => {
    const text = 'date,description,amount\n01/01/2026,Test,100'
    const result = decodeCsvBytes(utf8Bytes(text))
    expect(result.detectedEncoding).toBe('utf-8')
    expect(result.text).toBe(text)
  })

  it('decodes a real UTF-8 Hebrew file with no BOM as utf-8', () => {
    const text = 'תיאור,סכום\nקניות בסופר,100'
    const result = decodeCsvBytes(utf8Bytes(text))
    expect(result.detectedEncoding).toBe('utf-8')
    expect(result.text).toBe(text)
  })

  it('decodes a UTF-8 Hebrew file with a BOM as utf-8-bom, stripping the BOM from the output', () => {
    const text = 'תיאור,סכום\nקניות בסופר,100'
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8Bytes(text)])
    const result = decodeCsvBytes(withBom)
    expect(result.detectedEncoding).toBe('utf-8-bom')
    expect(result.text).toBe(text)
  })

  it('decodes real Windows-1255 bytes (invalid as UTF-8) as windows-1255', () => {
    // Hebrew א ב ג (Aleph, Bet, Gimel) encoded in Windows-1255 as 0xE0 0xE1 0xE2.
    // These three bytes are NOT valid UTF-8 (0xE0 starts a 3-byte sequence
    // whose continuation bytes must be 0x80-0xBF; 0xE1/0xE2 aren't), so
    // strict UTF-8 validation correctly rejects them before falling back.
    const bytes = new Uint8Array([0xe0, 0xe1, 0xe2])
    const result = decodeCsvBytes(bytes)
    expect(result.detectedEncoding).toBe('windows-1255')
    expect(result.text).toBe('אבג')
  })

  it('never infers windows-1255 for bytes that are valid UTF-8, even with high-bit bytes present', () => {
    // A 2-byte UTF-8 sequence (e.g. Hebrew via real UTF-8, not Windows-1255)
    // must decode as utf-8, not be misdetected.
    const text = 'א'
    const result = decodeCsvBytes(utf8Bytes(text))
    expect(result.detectedEncoding).toBe('utf-8')
    expect(result.text).toBe(text)
  })

  // A BOM is an unambiguous UTF-8 declaration — genuinely malformed content
  // after one (e.g. a truncated/corrupted upload, or a non-UTF-8 file with a
  // stray BOM-like prefix) must be reported as an error, never silently
  // reinterpreted as Windows-1255. The caller (handlePickFile in
  // app/(app)/transactions/import.tsx) turns this throw into a visible file
  // error, never a silent/partial import.
  it('throws for bytes that are invalid UTF-8 immediately after a BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0xe0, 0xe1, 0xe2])
    expect(() => decodeCsvBytes(bytes)).toThrow('csv_invalid_utf8_after_bom')
  })
})
