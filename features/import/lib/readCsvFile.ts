// File selection + raw-byte read, isolated from decoding/parsing so those
// stay unit-testable without touching the filesystem. Uses expo-file-
// system's File.arrayBuffer() for real raw bytes — deliberately not
// fetch(uri).text(), which always decodes as UTF-8 regardless of the
// source file's actual encoding (see decodeCsvBytes.ts's header for why
// that matters for Windows-1255 files).

import * as DocumentPicker from 'expo-document-picker'
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
  const file = new File(asset.uri)
  const buffer = await file.arrayBuffer()
  return { name: asset.name, bytes: new Uint8Array(buffer) }
}
