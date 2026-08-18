// Regression test for the confirmed root cause of web CSV import being
// completely broken: expo-file-system has no real web implementation
// (node_modules/expo-file-system/src/ExpoFileSystem.web.ts's FileSystemFile
// is a bare stub constructor with no arrayBuffer method at all), so
// `new File(asset.uri).arrayBuffer()` threw a TypeError on every web pick.
// This tests the exact call site of that bug, not just downstream helpers —
// native must keep using expo-file-system's File, web must use the real
// browser File object expo-document-picker already hands back on
// DocumentPickerAsset.file.
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}))
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
}))

describe('pickAndReadCsvFile (native)', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('reads the picked file via expo-file-system.File.arrayBuffer()', async () => {
    const bytes = new TextEncoder().encode('date,description,amount\n01/01/2026,Test,100')
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ name: 'export.csv', uri: 'file:///cache/export.csv', mimeType: 'text/csv', size: bytes.length }],
    } as never)
    const arrayBuffer = jest.fn<() => Promise<ArrayBuffer>>().mockResolvedValue(bytes.buffer)
    jest.mocked(File).mockImplementation(() => ({ arrayBuffer }) as never)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { pickAndReadCsvFile } = require('./readCsvFile') as typeof import('./readCsvFile')
    const result = await pickAndReadCsvFile()

    expect(File).toHaveBeenCalledWith('file:///cache/export.csv')
    expect(arrayBuffer).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ name: 'export.csv', bytes })
  })

  it('returns null when the user cancels the picker, without touching expo-file-system', async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: true, assets: null } as never)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { pickAndReadCsvFile } = require('./readCsvFile') as typeof import('./readCsvFile')
    const result = await pickAndReadCsvFile()

    expect(result).toBeNull()
    expect(File).not.toHaveBeenCalled()
  })
})

describe('pickAndReadCsvFile (web)', () => {
  afterEach(() => {
    jest.clearAllMocks()
    jest.dontMock('react-native')
    jest.resetModules()
  })

  function loadWebModule() {
    jest.resetModules()
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }))
    jest.doMock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
    jest.doMock('expo-file-system', () => ({ File: jest.fn() }))
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./readCsvFile') as typeof import('./readCsvFile')
  }

  it('reads the picked file via the real browser File.arrayBuffer(), never expo-file-system', async () => {
    const mod = loadWebModule()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webDocumentPicker = require('expo-document-picker') as typeof DocumentPicker
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webFileSystem = require('expo-file-system') as { File: jest.Mock }

    const bytes = new TextEncoder().encode('date,description,amount\n01/01/2026,Test,100')
    const browserArrayBuffer = jest.fn<() => Promise<ArrayBuffer>>().mockResolvedValue(bytes.buffer)
    const browserFile = { arrayBuffer: browserArrayBuffer } as unknown as File

    jest.mocked(webDocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ name: 'export.csv', uri: 'blob:http://localhost/abc', file: browserFile }],
    } as never)

    const result = await mod.pickAndReadCsvFile()

    expect(browserArrayBuffer).toHaveBeenCalledTimes(1)
    expect(webFileSystem.File).not.toHaveBeenCalled()
    expect(result).toEqual({ name: 'export.csv', bytes })
  })

  it('returns null when the user cancels the browser file-input dialog, without crashing', async () => {
    const mod = loadWebModule()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webDocumentPicker = require('expo-document-picker') as typeof DocumentPicker
    jest.mocked(webDocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: true, assets: null } as never)

    const result = await mod.pickAndReadCsvFile()

    expect(result).toBeNull()
  })

  it('throws (never crashes silently) instead of reading zero bytes when the picked asset has no File object', async () => {
    const mod = loadWebModule()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webDocumentPicker = require('expo-document-picker') as typeof DocumentPicker
    jest.mocked(webDocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ name: 'export.csv', uri: 'blob:http://localhost/abc' }],
    } as never)

    await expect(mod.pickAndReadCsvFile()).rejects.toThrow()
  })

  it('propagates (does not swallow) a failed browser File.arrayBuffer() read', async () => {
    const mod = loadWebModule()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webDocumentPicker = require('expo-document-picker') as typeof DocumentPicker
    const browserFile = {
      arrayBuffer: jest.fn<() => Promise<ArrayBuffer>>().mockRejectedValue(new Error('NotReadableError')),
    } as unknown as File

    jest.mocked(webDocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ name: 'export.csv', uri: 'blob:http://localhost/abc', file: browserFile }],
    } as never)

    await expect(mod.pickAndReadCsvFile()).rejects.toThrow('NotReadableError')
  })
})
