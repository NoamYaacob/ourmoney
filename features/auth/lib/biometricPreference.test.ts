import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as SecureStore from 'expo-secure-store'
import {
  BIOMETRIC_ENABLED_SECURE_STORE_KEY,
  readBiometricPreference,
  writeBiometricPreference,
} from './biometricPreference'

jest.mock('expo-secure-store')

describe('biometricPreference', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('defaults to enabled (true) when nothing is stored — fail closed', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    expect(await readBiometricPreference()).toBe(true)
  })

  it('defaults to enabled (true) for a malformed stored value — fail closed', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('not-a-boolean')
    expect(await readBiometricPreference()).toBe(true)
  })

  it('returns false only when explicitly stored as "false"', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('false')
    expect(await readBiometricPreference()).toBe(false)
  })

  it('returns true when explicitly stored as "true"', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('true')
    expect(await readBiometricPreference()).toBe(true)
  })

  it('writes the preference under the expected key', async () => {
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)
    await writeBiometricPreference(false)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(BIOMETRIC_ENABLED_SECURE_STORE_KEY, 'false')
  })
})
