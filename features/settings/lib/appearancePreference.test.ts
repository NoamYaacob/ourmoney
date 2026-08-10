import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as SecureStore from 'expo-secure-store'
import {
  APPEARANCE_SECURE_STORE_KEY,
  readAppearancePreference,
  writeAppearancePreference,
} from './appearancePreference'

jest.mock('expo-secure-store')

describe('appearancePreference', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('defaults to "system" when nothing is stored', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    expect(await readAppearancePreference()).toBe('system')
  })

  it('returns the stored preference when valid', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('dark')
    expect(await readAppearancePreference()).toBe('dark')
  })

  it('defaults to "system" for a malformed/unexpected stored value', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('not-a-real-preference')
    expect(await readAppearancePreference()).toBe('system')
  })

  it('writes the preference under the expected key', async () => {
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)
    await writeAppearancePreference('light')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(APPEARANCE_SECURE_STORE_KEY, 'light')
  })
})
