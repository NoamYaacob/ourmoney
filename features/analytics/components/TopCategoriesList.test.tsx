// Desktop/RTL polish pass (found while redesigning Dashboard's insights
// panel): the row was a plain flex-row, which native auto-mirrors via Yoga
// under the forced-RTL flag but NativeWind's web-compiled CSS does not —
// on web the category icon+name rendered on the left and the amount on the
// right, backwards for this app's established RTL row convention (name/icon
// right, amount left). First test coverage for this component.
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { TopCategoriesList } from './TopCategoriesList'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

describe('TopCategoriesList', () => {
  it('reverses each row on web so the category name renders on the right and the amount on the left', async () => {
    const { getByText } = await render(
      <TopCategoriesList
        entries={[{ categoryId: 'cat-1', spentAgorot: 10000 }]}
        categoryNameById={{ 'cat-1': 'מזון' }}
        categoryIconById={{ 'cat-1': '🍔' }}
      />
    )

    const row = getByText('מזון').parent
    expect(row?.props.className as string).toContain('web:flex-row-reverse')
  })
})
