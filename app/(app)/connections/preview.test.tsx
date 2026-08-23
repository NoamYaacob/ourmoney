// Screens 17-18 of the mobile design, built as a static, explicitly-labeled
// mockup (see the screen's own header comment for why: docs/OPEN_BANKING.md's
// licensing gate hasn't cleared, so nothing here may read as real). These
// tests lock in the two things that make that true: the "not real" banner is
// always present, and every name/figure on the screen is the fixed example
// data, never a real institution or a value sourced from any hook.
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import i18n from '@/i18n'
import ConnectionsPreview from './preview'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}))

describe('ConnectionsPreview', () => {
  it('always shows the "not real, preview only" banner', async () => {
    const { getByText } = await render(<ConnectionsPreview />)

    expect(getByText(i18n.t('connections.preview.bannerTitle'))).toBeTruthy()
    expect(getByText(i18n.t('connections.preview.bannerBody'))).toBeTruthy()
  })

  it('shows the example connected-account row with the fictional bank name, never a real institution', async () => {
    const { getByText } = await render(<ConnectionsPreview />)

    expect(getByText(i18n.t('connections.preview.exampleBankName'))).toBeTruthy()
    expect(getByText(i18n.t('connections.preview.connectedBadge'))).toBeTruthy()
    // Never a real Israeli bank's name — this screen exists specifically to
    // avoid that confusion.
    expect(() => getByText('בנק לאומי')).toThrow()
    expect(() => getByText('בנק הפועלים')).toThrow()
  })

  it('shows all three example status cards (connected, failed, expired)', async () => {
    const { getByText } = await render(<ConnectionsPreview />)

    expect(getByText(i18n.t('connections.preview.states.successTitle'))).toBeTruthy()
    expect(getByText(i18n.t('connections.preview.states.failedTitle'))).toBeTruthy()
    expect(getByText(i18n.t('connections.preview.states.expiredTitle'))).toBeTruthy()
  })
})
