// Desktop polish pass: Select's bottom-sheet Modal becomes a centered
// dialog at desktop web width (vertical centering, full corner rounding,
// hidden drag handle, fade instead of slide) while staying the original
// bottom sheet below that — verified for real in a headless browser
// (getBoundingClientRect/getComputedStyle) during this pass; these tests
// guard the structural inputs that produced those verified results
// (animationType is a real prop assertion, not just a class string).
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import { Select } from './Select'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

let mockWidth = 375
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 1, fontScale: 1 }),
}))

// The desktop-dialog branch in Select.tsx is explicitly `Platform.OS ===
// 'web' && width >= breakpoint` (native never gets the desktop treatment,
// even at a wide tablet width) — jest's RN preset otherwise resolves
// Platform.OS to 'ios', so this is mocked to 'web' to exercise that branch.
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: { OS: 'web', select: (obj: Record<string, unknown>) => obj.web ?? obj.default },
}))

const OPTIONS = [
  { value: '1', label: 'Option 1' },
  { value: '2', label: 'Option 2' },
]

interface TestInstanceLike {
  type: string
  props: Record<string, unknown>
}
// This RNTL version has no UNSAFE_getByType helper — the Modal only
// mounts once opened (RN's own Modal renders null while !visible), so
// every case below opens it via press first, then walks the render
// container for the instance of type 'Modal'. (`root` only covers the
// always-mounted trigger; `container` covers the whole rendered tree,
// including the Modal's portal-like content once opened.)
function findModal(container: { queryAll: (predicate: (i: TestInstanceLike) => boolean) => TestInstanceLike[] } | null) {
  return container?.queryAll((instance) => instance.type === 'Modal')[0]
}

async function renderOpenSelect(sheetTitle?: string) {
  const result = await render(
    <Select
      variant="row"
      label="pick"
      options={OPTIONS}
      value={null}
      onChange={jest.fn()}
      placeholder="choose"
      sheetTitle={sheetTitle}
    />,
  )
  await fireEvent.press(result.getByLabelText('pick'))
  return result
}

describe('Select desktop dialog conversion', () => {
  it('stays a bottom sheet (slide animation) below the desktop breakpoint', async () => {
    mockWidth = 900
    const { container } = await renderOpenSelect()

    const modal = findModal(container)
    expect(modal?.props.animationType).toBe('slide')
  })

  it('switches to a centered fade dialog at the desktop breakpoint', async () => {
    mockWidth = 1200
    const { container } = await renderOpenSelect()

    const modal = findModal(container)
    expect(modal?.props.animationType).toBe('fade')
  })

  it('carries the desktop vertical-centering class on the backdrop regardless of current width (CSS-scoped, not JS-branched)', async () => {
    mockWidth = 900
    const { container } = await renderOpenSelect()

    const modal = findModal(container)
    const backdrop = modal?.props.children as { props: { className: string } }
    expect(backdrop.props.className).toContain('web:desktop:justify-center')
  })

  it('rounds all four corners at desktop and hides the mobile drag-handle affordance there', async () => {
    mockWidth = 1440
    const { container } = await renderOpenSelect('Choose')

    const modal = findModal(container)
    const backdrop = modal?.props.children as { props: { children: { props: { className: string; children: unknown[] } } } }
    const sheet = backdrop.props.children
    expect(sheet.props.className).toContain('web:desktop:rounded-2xl')

    const handleWrapper = sheet.props.children[0] as { props: { className: string } }
    expect(handleWrapper.props.className).toContain('web:desktop:hidden')
  })
})
