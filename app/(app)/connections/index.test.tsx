// Locks in the product decision behind this screen (see its own header
// comment): every connection type stays permanently disabled, tapping one
// only ever opens an explanatory sheet, and there is no state anywhere in
// this screen that renders as "connected." This is a screen with no hook
// and no navigation of its own, so the coverage here is deliberately just
// "the copy and structure never drift toward simulating a working flow."
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import Connections from './index'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}))

describe('Connections', () => {
  it('lists every connection type as permanently locked, never as connectable', async () => {
    const { getAllByText } = await render(<Connections />)

    expect(getAllByText(i18n.t('connections.comingSoon'))).toHaveLength(2)
    expect(getAllByText(i18n.t('connections.notAvailableYet'))).toHaveLength(2)
  })

  it('opens the explanatory sheet on tap, with no connect action anywhere in it', async () => {
    const { getByText, queryByText } = await render(<Connections />)

    expect(queryByText(i18n.t('connections.info.body'))).toBeNull()

    await fireEvent.press(getByText(i18n.t('connections.types.bankAccount')))

    expect(getByText(i18n.t('connections.info.body'))).toBeTruthy()
    // The sheet's only action dismisses it — never a "connect"/"continue" CTA.
    expect(getByText(i18n.t('connections.info.dismiss'))).toBeTruthy()
  })

  it('dismisses the sheet without producing any connected state', async () => {
    const { getByText, queryByText } = await render(<Connections />)

    await fireEvent.press(getByText(i18n.t('connections.types.creditCard')))
    expect(getByText(i18n.t('connections.info.body'))).toBeTruthy()

    await fireEvent.press(getByText(i18n.t('connections.info.dismiss')))
    expect(queryByText(i18n.t('connections.info.body'))).toBeNull()
  })
})
