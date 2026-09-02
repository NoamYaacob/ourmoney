import { describe, expect, it, jest } from '@jest/globals'
import { act, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { OfflineBanner } from './OfflineBanner'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}))

describe('OfflineBanner', () => {
  it('renders nothing while online', async () => {
    Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true })
    const { queryByText } = await render(<OfflineBanner />)
    expect(queryByText(i18n.t('common.offline'))).toBeNull()
  })

  it('renders the offline message when the browser reports no connection at mount', async () => {
    Object.defineProperty(global.navigator, 'onLine', { value: false, configurable: true })
    const { getByText } = await render(<OfflineBanner />)
    expect(getByText(i18n.t('common.offline'))).toBeTruthy()
    Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true })
  })

  it('reacts to the browser online/offline events after mount', async () => {
    // This test environment's `window` has no real DOM event dispatch
    // machinery (no jsdom here — see this component's own header comment on
    // why it only ever fully works under react-native-web), so the
    // listeners the effect registers are captured directly and invoked by
    // hand rather than through a real dispatchEvent.
    // This environment's `window` has no `addEventListener` of its own at
    // all (confirming the component's own guard around it is load-bearing,
    // not defensive filler) — assigned directly rather than jest.spyOn,
    // which requires the property to already exist.
    const listeners: Record<string, () => void> = {}
    const originalAdd = (window as { addEventListener?: unknown }).addEventListener
    const originalRemove = (window as { removeEventListener?: unknown }).removeEventListener
    ;(window as unknown as { addEventListener: (type: string, listener: () => void) => void }).addEventListener = (
      type,
      listener
    ) => {
      listeners[type] = listener
    }
    ;(window as unknown as { removeEventListener: () => void }).removeEventListener = () => {}

    Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true })
    const { queryByText, unmount } = await render(<OfflineBanner />)
    expect(queryByText(i18n.t('common.offline'))).toBeNull()

    await act(async () => {
      listeners.offline?.()
    })
    expect(queryByText(i18n.t('common.offline'))).toBeTruthy()

    await act(async () => {
      listeners.online?.()
    })
    expect(queryByText(i18n.t('common.offline'))).toBeNull()

    // Unmounted (running the effect's own cleanup, which calls
    // removeEventListener) while the mock is still in place, before
    // restoring the original — real jsdom-less `window` has neither.
    await act(async () => {
      unmount()
    })
    ;(window as unknown as { addEventListener?: unknown }).addEventListener = originalAdd
    ;(window as unknown as { removeEventListener?: unknown }).removeEventListener = originalRemove
  })
})
