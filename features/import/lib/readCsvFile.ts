// File selection + raw-byte read, isolated from decoding/parsing so those
// stay unit-testable without touching the filesystem. Uses raw
// ArrayBuffer reads (never fetch(uri).text(), which always decodes as
// UTF-8 regardless of the source file's actual encoding — see
// decodeCsvBytes.ts's header for why that matters for Windows-1255 files).
//
// Two read paths, one per platform, feeding the exact same
// PickedCsvFile shape into the shared decode/parse/validate pipeline:
//
// Native (iOS/Android): expo-file-system's File.arrayBuffer(), reading the
// asset.uri the document picker copied into the cache directory. Unchanged
// from before this fix.
//
// Web: confirmed root cause of web CSV import being completely broken —
// expo-file-system has no real web implementation at all
// (node_modules/expo-file-system/src/ExpoFileSystem.web.ts's
// FileSystemFile is a bare stub constructor with a console.warn and no
// arrayBuffer method whatsoever), so `new File(asset.uri).arrayBuffer()`
// threw a TypeError on every web import attempt. expo-document-picker's
// web implementation already hands back the real browser File object on
// DocumentPickerAsset.file (node_modules/expo-document-picker/src/
// ExpoDocumentPicker.web.ts, `@platform web` in its own types) — that's
// the standard Web API File, whose own native arrayBuffer() method does
// the identical job with no extra dependency.
import * as DocumentPicker from 'expo-document-picker'
import { Platform } from 'react-native'
import { File } from 'expo-file-system'

export interface PickedCsvFile {
  name: string
  bytes: Uint8Array
}

// Returns null if the user cancels the picker — not an error.
export async function pickAndReadCsvFile(): Promise<PickedCsvFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
  })
  if (result.canceled || !result.assets?.[0]) return null

  const asset = result.assets[0]

  if (Platform.OS === 'web') {
    // asset.file is always present alongside a picked web asset (see the
    // header comment) — this check exists only so a future upstream
    // change to expo-document-picker fails loudly (caught by the caller's
    // try/catch, surfaced as a normal read error) instead of silently
    // reading zero bytes.
    if (!asset.file) throw new Error('csv_web_file_missing')
    const buffer = await asset.file.arrayBuffer()
    return { name: asset.name, bytes: new Uint8Array(buffer) }
  }

  const file = new File(asset.uri)
  const buffer = await file.arrayBuffer()
  return { name: asset.name, bytes: new Uint8Array(buffer) }
}
