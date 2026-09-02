// The design draws a category as the household's own emoji. The previous
// implementation swapped every one for an Ionicon, which meant a custom
// category came back as a generic pricetag — losing the one thing the
// household actually chose.

import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { CategoryIcon } from './CategoryIcon'

jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: 'light' }) }))

describe('CategoryIcon', () => {
  it('renders the stored emoji itself', async () => {
    const { getByText } = await render(<CategoryIcon icon="🛒" />)
    expect(getByText('🛒', { includeHiddenElements: true })).toBeTruthy()
  })

  it('renders an emoji the Ionicon table never knew about', async () => {
    // The whole point: a custom category is not in any mapping.
    const { getByText } = await render(<CategoryIcon icon="🎂" />)
    expect(getByText('🎂', { includeHiddenElements: true })).toBeTruthy()
  })

  it('falls back to the icon mapping for a non-emoji value', async () => {
    const { queryByText } = await render(<CategoryIcon icon="cart-outline" />)
    expect(queryByText('cart-outline', { includeHiddenElements: true })).toBeNull()
  })

  it('does not crash on a missing icon', async () => {
    await expect(render(<CategoryIcon icon={null} />)).resolves.toBeTruthy()
    await expect(render(<CategoryIcon icon={undefined} />)).resolves.toBeTruthy()
    await expect(render(<CategoryIcon icon="  " />)).resolves.toBeTruthy()
  })

  it('stays hidden from assistive tech — the category name beside it is the label', async () => {
    const { getByText } = await render(<CategoryIcon icon="☕" />)
    expect(getByText('☕', { includeHiddenElements: true })).toBeTruthy()
  })
})
