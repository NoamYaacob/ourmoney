// Desktop Visual/Responsive Design pass: Select's bottom-sheet Modal
// becomes an anchored popover (positioned/sized off the trigger, not the
// screen) at desktop web width, replacing the earlier centered-dialog
// treatment — still the original bottom sheet below that breakpoint.
import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import i18n from '@/i18n'
import { Select } from './Select'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

let mockWidth = 375
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 1, fontScale: 1 }),
}))

// The desktop-popover branch in Select.tsx is explicitly `Platform.OS ===
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

async function renderOpenSelect(
  sheetTitle?: string,
  overrides: Partial<{ options: typeof OPTIONS; emptyState: ComponentProps<typeof Select>['emptyState'] }> = {},
) {
  const result = await render(
    <Select
      variant="row"
      label="pick"
      options={overrides.options ?? OPTIONS}
      value={null}
      onChange={jest.fn()}
      placeholder="choose"
      sheetTitle={sheetTitle}
      emptyState={overrides.emptyState}
    />,
  )
  await fireEvent.press(result.getByLabelText('pick'))
  return result
}

describe('Select desktop popover', () => {
  it('stays a bottom sheet (slide animation) below the desktop breakpoint', async () => {
    mockWidth = 900
    const { container } = await renderOpenSelect()

    const modal = findModal(container)
    expect(modal?.props.animationType).toBe('slide')
  })

  it('switches to a fade-in anchored popover at the desktop breakpoint', async () => {
    mockWidth = 1200
    const { container } = await renderOpenSelect()

    const modal = findModal(container)
    expect(modal?.props.animationType).toBe('fade')
  })

  // The test renderer has no host view to measure (measureInWindow's
  // callback never fires there — see Select.tsx's openSelect() comment for
  // why opening never waits on it) — so the popover renders at its
  // documented null-anchor fallback position. What this test actually
  // guards is the real regression: opening must not silently no-op when
  // measurement doesn't resolve.
  it('still opens (renders the Modal visible) even when measureInWindow never resolves', async () => {
    mockWidth = 1200
    const { container } = await renderOpenSelect()

    const modal = findModal(container)
    expect(modal?.props.visible).toBe(true)
  })

  it('renders the options list inside a bounded, absolutely-positioned box, not a full-width/centered dialog', async () => {
    mockWidth = 1440
    const { container, getByText } = await renderOpenSelect('Choose')

    expect(getByText('Choose')).toBeTruthy()
    expect(getByText('Option 1')).toBeTruthy()

    const modal = findModal(container)
    const backdrop = modal?.props.children as { props: { children: { props: { style: Record<string, unknown> } } } }
    const box = backdrop.props.children
    expect(box.props.style).toMatchObject({ position: 'absolute' })
  })

  it('selecting an option still calls onChange with that value and closes the popover', async () => {
    mockWidth = 1440
    const onChange = jest.fn()
    const { getByLabelText, getByText, queryByText } = await render(
      <Select variant="row" label="pick" options={OPTIONS} value={null} onChange={onChange} placeholder="choose" />,
    )
    await fireEvent.press(getByLabelText('pick'))
    await fireEvent.press(getByText('Option 2'))

    expect(onChange).toHaveBeenCalledWith('2')
    expect(queryByText('Option 2')).toBeNull()
  })

  it('closes on backdrop press, same as the mobile bottom sheet', async () => {
    mockWidth = 1440
    const { getByLabelText, getByText, queryByText, container } = await renderOpenSelect()
    expect(getByText('Option 1')).toBeTruthy()

    const modal = findModal(container)
    const backdrop = (modal as unknown as { children: unknown[] }).children[0]
    await fireEvent.press(backdrop as Parameters<typeof fireEvent.press>[0])

    expect(queryByText('Option 1')).toBeNull()
    // Re-opens cleanly afterward — nothing about closing left the trigger
    // or open state stuck.
    await fireEvent.press(getByLabelText('pick'))
    expect(getByText('Option 1')).toBeTruthy()
  })
})

// RRR §16 P1-9: an empty `options` array previously rendered the sheet
// (desktop popover AND both mobile bottom-sheet variants) with nothing in
// it at all — no message, no way out. A brand-new household's very first
// "add a transaction" attempt dead-ends exactly here (no accounts yet).
describe('Select — empty options list', () => {
  it('renders a real message instead of a blank sheet, in the desktop popover', async () => {
    mockWidth = 1440
    const { getByText } = await renderOpenSelect('Choose', { options: [] })

    expect(getByText(i18n.t('common.select.empty'))).toBeTruthy()
  })

  it('renders a real message instead of a blank sheet, in the mobile row-variant bottom sheet', async () => {
    mockWidth = 375
    const { getByText } = await renderOpenSelect('Choose', { options: [] })

    expect(getByText(i18n.t('common.select.empty'))).toBeTruthy()
  })

  it('renders a real message instead of a blank sheet, in the mobile box-variant bottom sheet (no variant prop)', async () => {
    mockWidth = 375
    const { getByLabelText, getByText } = await render(
      <Select label="pick" options={[]} value={null} onChange={jest.fn()} placeholder="choose" />,
    )
    await fireEvent.press(getByLabelText('pick'))

    expect(getByText(i18n.t('common.select.empty'))).toBeTruthy()
  })

  it('renders the caller-provided message, hint, and a working recovery action when supplied', async () => {
    mockWidth = 1440
    const onAction = jest.fn()
    const { getByText } = await renderOpenSelect('Choose', {
      options: [],
      emptyState: { message: 'עדיין אין חשבונות.', hint: 'הוסיפו חשבון כדי להתחיל.', actionLabel: 'הוספת חשבון', onAction },
    })

    expect(getByText('עדיין אין חשבונות.')).toBeTruthy()
    expect(getByText('הוסיפו חשבון כדי להתחיל.')).toBeTruthy()
    await fireEvent.press(getByText('הוספת חשבון'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
