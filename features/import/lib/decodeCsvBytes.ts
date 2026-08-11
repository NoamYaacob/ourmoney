// Byte-level decoding, deliberately separate from CSV structural parsing
// (features/import/lib/parseCsv.ts) so encoding handling is independently
// testable. `fetch(uri).text()` is never used here — the Fetch API's
// `.text()` always decodes as UTF-8 regardless of the source file's real
// encoding, which would silently corrupt a genuine Windows-1255 file into
// mojibake with no error. The caller reads raw bytes via expo-file-system
// (base64) and passes them here as a Uint8Array.
//
// Detection rule (exact, per the approved M7 design — do not infer
// Windows-1255 when the bytes are valid UTF-8, including ASCII-only
// content):
//   1. UTF-8 BOM (EF BB BF) present -> strip it, decode as UTF-8.
//   2. No BOM, strict UTF-8 decode succeeds (including plain ASCII, which
//      is always valid UTF-8) -> decode as UTF-8.
//   3. No BOM, strict UTF-8 decode fails -> decode as Windows-1255.
//
// Strict UTF-8 validation is hand-rolled (byte-sequence rules below), not
// delegated to the host's TextDecoder — RN/Hermes's TextDecoder support for
// `fatal: true` strict-mode validation is not guaranteed consistent across
// environments, and this decision is correctness-critical enough that it
// should not depend on runtime behavior differing between Jest (Node) and
// the deployed app (Hermes).

import { decodeWindows1255 } from './windows1255'

export type DetectedEncoding = 'utf-8' | 'utf-8-bom' | 'windows-1255'

export interface DecodeCsvBytesResult {
  text: string
  detectedEncoding: DetectedEncoding
}

const UTF8_BOM = [0xef, 0xbb, 0xbf]

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2]
}

// Returns the decoded string, or null if the bytes are not valid UTF-8 by
// the strict rules (rejects overlong encodings, unpaired continuation
// bytes, surrogate-range code points, and out-of-range 4-byte sequences).
function tryDecodeStrictUtf8(bytes: Uint8Array): string | null {
  let result = ''
  let i = 0
  while (i < bytes.length) {
    const b0 = bytes[i]!
    if (b0 <= 0x7f) {
      result += String.fromCodePoint(b0)
      i += 1
      continue
    }

    let length: number
    let codePoint: number
    let minCodePoint: number
    if ((b0 & 0xe0) === 0xc0) {
      length = 2
      codePoint = b0 & 0x1f
      minCodePoint = 0x80
    } else if ((b0 & 0xf0) === 0xe0) {
      length = 3
      codePoint = b0 & 0x0f
      minCodePoint = 0x800
    } else if ((b0 & 0xf8) === 0xf0) {
      length = 4
      codePoint = b0 & 0x07
      minCodePoint = 0x10000
    } else {
      return null // stray continuation byte or an invalid leading byte
    }

    if (i + length > bytes.length) return null
    for (let j = 1; j < length; j++) {
      const bn = bytes[i + j]!
      if ((bn & 0xc0) !== 0x80) return null // not a valid continuation byte
      codePoint = (codePoint << 6) | (bn & 0x3f)
    }

    if (codePoint < minCodePoint) return null // overlong encoding
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null // surrogate range, invalid in UTF-8
    if (codePoint > 0x10ffff) return null // outside the Unicode range

    result += String.fromCodePoint(codePoint)
    i += length
  }
  return result
}

export function decodeCsvBytes(bytes: Uint8Array): DecodeCsvBytesResult {
  if (hasUtf8Bom(bytes)) {
    const withoutBom = bytes.subarray(3)
    const decoded = tryDecodeStrictUtf8(withoutBom)
    // A BOM is an unambiguous UTF-8 declaration — if the body still fails
    // strict validation, that's a genuinely malformed file, not a signal to
    // silently fall back to guessing Windows-1255.
    if (decoded === null) {
      throw new Error('csv_invalid_utf8_after_bom')
    }
    return { text: decoded, detectedEncoding: 'utf-8-bom' }
  }

  const utf8Decoded = tryDecodeStrictUtf8(bytes)
  if (utf8Decoded !== null) {
    return { text: utf8Decoded, detectedEncoding: 'utf-8' }
  }

  return { text: decodeWindows1255(bytes), detectedEncoding: 'windows-1255' }
}
