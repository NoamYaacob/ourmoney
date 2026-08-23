import { useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { FlatList, Modal, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { DESKTOP_BREAKPOINT_PX, DIALOG_WIDTH_CLASS } from '@/constants/layout'

export interface SelectOption {
  value: string
  label: string
  // Design Phase 2: optional per-option leading icon for the bottom sheet
  // row (e.g. a category's icon). Omitted entirely by every pre-Phase-2
  // caller, so their sheet rows render exactly as before — plain label +
  // trailing checkmark, no icon column.
  iconName?: ComponentProps<typeof Ionicons>['name']
}

interface SelectProps {
  label: string
  options: SelectOption[]
  value: string | null
  onChange: (value: string) => void
  placeholder: string
  // Design Phase 2, both additive/opt-in — default 'box' is the original
  // trigger AND the original bottom-sheet chrome, pixel-identical to every
  // pre-Phase-2 caller (Accounts/Budgets/Recurring/Settings/Import/edit-
  // transaction — all untouched this phase). 'row' is the tappable-
  // selection-row trigger + polished sheet used only by Add Transaction's
  // account/category fields, so this phase's sheet polish (item 14) can't
  // leak into screens this phase isn't supposed to touch.
  variant?: 'box' | 'row'
  leadingIcon?: ReactNode
  sheetTitle?: string
}

// Desktop Visual/Responsive Design pass: what a desktop-only render measures
// from the trigger (via `measureInWindow` — real on-screen coordinates, cheap
// and correct regardless of RTL since it reflects wherever the trigger
// physically renders, not a logical left/right assumption) so the anchored
// popover that replaces the centered dialog at desktop can size/position
// itself off the control that opened it, not the screen.
interface Anchor {
  x: number
  y: number
  width: number
  height: number
}

const POPOVER_MAX_HEIGHT = 320
const POPOVER_MIN_WIDTH = 260
const POPOVER_MARGIN = 8

export function Select({
  label,
  options,
  value,
  onChange,
  placeholder,
  variant = 'box',
  leadingIcon,
  sheetTitle,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const triggerRef = useRef<View>(null)
  const { colorScheme: scheme } = useColorScheme()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const selectedOption = options.find((option) => option.value === value)
  const selectedLabel = selectedOption?.label
  const mutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  // Below `desktop`, this Modal stays the original bottom sheet (slide-up,
  // bottom-anchored, drag handle, top corners only) on both native and web —
  // unchanged from every pre-existing caller. At desktop width on web only,
  // it becomes an anchored popover instead: a centered dialog (and before
  // that, a bottom sheet) reads as a mobile pattern once there's a full
  // desktop viewport around it, and — for a short list especially — opens a
  // large box with no visual relationship to the control the user tapped.
  const isDesktopWeb = Platform.OS === 'web' && windowWidth >= DESKTOP_BREAKPOINT_PX

  function openSelect() {
    // Opening never waits on measurement — measureInWindow is a real
    // native-bridge call with no guaranteed-synchronous callback (and no
    // callback at all in a JS-only test renderer, which has no host view to
    // measure), so gating `setIsOpen(true)` on it firing would mean the
    // popover could silently never open. The anchor is instead applied
    // opportunistically: it starts null (popoverStyle()'s null-anchor
    // fallback below covers that render), and snaps to the trigger's real
    // position the moment the callback does resolve.
    setIsOpen(true)
    if (isDesktopWeb && triggerRef.current) {
      // measureInWindow gives real screen coordinates — used directly as
      // `left`/`top` below (see the Anchor comment above for why that's
      // correct regardless of RTL).
      triggerRef.current.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height })
      })
    }
  }

  // Clamped so the popover never renders off the bottom/right/left edge of
  // the viewport — flips above the trigger instead of below it when there
  // isn't room underneath, and slides horizontally back onto screen rather
  // than clipping. `anchor` is only ever set on a desktop-web open, so this
  // is only consulted from the desktop branch below.
  function popoverStyle() {
    const popoverWidth = anchor ? Math.max(anchor.width, POPOVER_MIN_WIDTH) : POPOVER_MIN_WIDTH
    if (!anchor) {
      return { position: 'absolute' as const, top: 80, left: windowWidth / 2 - popoverWidth / 2, width: popoverWidth }
    }
    const fitsBelow = anchor.y + anchor.height + POPOVER_MARGIN + POPOVER_MAX_HEIGHT <= windowHeight
    const top = fitsBelow
      ? anchor.y + anchor.height + 4
      : Math.max(POPOVER_MARGIN, anchor.y - POPOVER_MAX_HEIGHT - 4)
    // Visual QA pass: when the popover is wider than its trigger (every
    // compact filter Select — POPOVER_MIN_WIDTH is 260px, well past a
    // ~110-150px filter chip), left-anchoring at `anchor.x` let the extra
    // width spill to the trigger's right, reading as unrelated to the field
    // that opened it. This app never sets `dir="rtl"` on the DOM (see
    // _layout.tsx's DesktopSideRail comment), so alignment is plain
    // physical pixel math — a Hebrew-reading user's natural expectation is
    // still that the menu hugs the trigger's right (start) edge, matching
    // how every reversed two-region split in this app anchors its primary
    // content there. Right-align when the popover would otherwise overhang
    // to the right of a narrower trigger; a same-or-wider trigger (the
    // common case — most Selects fill their container) keeps left-anchoring
    // unchanged, since right-aligning there would just spill the other way.
    const preferredLeft = popoverWidth > anchor.width ? anchor.x + anchor.width - popoverWidth : anchor.x
    const left = Math.min(Math.max(preferredLeft, POPOVER_MARGIN), windowWidth - popoverWidth - POPOVER_MARGIN)
    return { position: 'absolute' as const, top, left, width: popoverWidth }
  }

  return (
    <>
      {variant === 'row' ? (
        <Pressable
          ref={triggerRef}
          onPress={openSelect}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: selectedLabel ?? placeholder }}
          className="flex-row items-center gap-3 py-3 active:opacity-70"
        >
          {leadingIcon}
          <View className="flex-1">
            <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
            <Text
              className={
                selectedLabel
                  ? 'mt-0.5 text-body text-ink-light dark:text-ink-dark'
                  : 'mt-0.5 text-body text-inkMuted-light dark:text-inkMuted-dark'
              }
            >
              {selectedLabel ?? placeholder}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={mutedColor} />
        </Pressable>
      ) : (
        <View className="mb-4">
          <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
          <Pressable
            ref={triggerRef}
            onPress={openSelect}
            accessibilityRole="button"
            accessibilityLabel={label}
            // An explicit accessibilityLabel overrides the accessible name RN
            // would otherwise compose from the child Text nodes below —
            // without accessibilityValue, a screen-reader user hears only
            // "<label>, button" with no way to tell what's currently selected
            // (mobile-expo-reviewer finding).
            accessibilityValue={{ text: selectedLabel ?? placeholder }}
            className="flex-row items-center justify-between rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 dark:border-border-dark dark:bg-surfaceMuted-dark"
          >
            <Text className={selectedLabel ? 'text-ink-light dark:text-ink-dark' : 'text-inkMuted-light dark:text-inkMuted-dark'}>
              {selectedLabel ?? placeholder}
            </Text>
            <Ionicons name="chevron-down" size={18} color={mutedColor} />
          </Pressable>
        </View>
      )}

      <Modal
        visible={isOpen}
        transparent
        animationType={isDesktopWeb ? 'fade' : 'slide'}
        onRequestClose={() => setIsOpen(false)}
      >
        {isDesktopWeb ? (
          // Anchored popover: the backdrop is still a full-screen Pressable
          // (click-outside-to-close, same mechanism every other caller
          // already relies on) and the Modal still owns Escape-to-close via
          // onRequestClose (react-native-web's Modal attaches this on web) —
          // both are inherited for free by staying inside the same Modal,
          // rather than reimplemented with raw DOM listeners. Only the
          // content's own position/size changes: anchored under (or, near
          // the bottom edge, above) the trigger and sized to it, not
          // centered/full-width like the mobile sheet or the old dialog.
          <Pressable className="flex-1" onPress={() => setIsOpen(false)}>
            <View
              style={popoverStyle()}
              className="max-h-[320px] rounded-xl border border-border-light bg-surface-light shadow-lg dark:border-border-dark dark:bg-surface-dark"
            >
              {sheetTitle && (
                <Text className="border-b border-border-light px-3 pb-2 pt-3 text-caption font-semibold text-ink-light dark:border-border-dark dark:text-ink-dark">
                  {sheetTitle}
                </Text>
              )}
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                ItemSeparatorComponent={() => <View className="h-px bg-border-light dark:bg-border-dark" />}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      onChange(item.value)
                      setIsOpen(false)
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: item.value === value }}
                    className="flex-row items-center gap-3 px-3 py-2.5"
                  >
                    {item.iconName && (
                      <View className="h-7 w-7 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                        <Ionicons name={item.iconName} size={15} color={mutedColor} />
                      </View>
                    )}
                    <Text className="flex-1 text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.value === value && <Ionicons name="checkmark" size={16} color={accentColor} />}
                  </Pressable>
                )}
              />
            </View>
          </Pressable>
        ) : (
          <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setIsOpen(false)}>
            {variant === 'row' ? (
              <View className={`max-h-[70%] w-full ${DIALOG_WIDTH_CLASS} rounded-t-2xl bg-surface-light dark:bg-surface-dark`}>
                {/* Drag-handle affordance — this Modal is a plain RN Modal, not
                    a real gesture-driven bottom sheet, so there is nothing to
                    wire up here beyond the visual cue (no new library added). */}
                <View className="items-center pb-1 pt-3">
                  <View className="h-1 w-9 rounded-full bg-border-light dark:bg-border-dark" />
                </View>
                {sheetTitle && (
                  <Text className="px-4 pb-2 pt-1 text-heading font-semibold text-ink-light dark:text-ink-dark">
                    {sheetTitle}
                  </Text>
                )}
                <FlatList
                  data={options}
                  keyExtractor={(item) => item.value}
                  contentContainerStyle={{ paddingBottom: Platform.OS === 'ios' ? 8 : 16 }}
                  ItemSeparatorComponent={() => <View className="h-px bg-border-light dark:bg-border-dark" />}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        onChange(item.value)
                        setIsOpen(false)
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: item.value === value }}
                      className="flex-row items-center gap-3 px-4 py-3.5"
                    >
                      {item.iconName && (
                        <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                          <Ionicons name={item.iconName} size={18} color={mutedColor} />
                        </View>
                      )}
                      <Text className="flex-1 text-body text-ink-light dark:text-ink-dark">{item.label}</Text>
                      {item.value === value && <Ionicons name="checkmark" size={18} color={accentColor} />}
                    </Pressable>
                  )}
                />
                <SafeAreaView edges={['bottom']} />
              </View>
            ) : (
              <View className={`max-h-96 w-full ${DIALOG_WIDTH_CLASS} rounded-t-2xl bg-surface-light p-4 dark:bg-surface-dark`}>
                <FlatList
                  data={options}
                  keyExtractor={(item) => item.value}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        onChange(item.value)
                        setIsOpen(false)
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: item.value === value }}
                      className="flex-row items-center gap-3 border-b border-border-light py-3 dark:border-border-dark"
                    >
                      {item.iconName && (
                        <View className="h-8 w-8 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                          <Ionicons name={item.iconName} size={16} color={mutedColor} />
                        </View>
                      )}
                      <Text className="flex-1 text-base text-ink-light dark:text-ink-dark">{item.label}</Text>
                      {item.value === value && <Ionicons name="checkmark" size={18} color={accentColor} />}
                    </Pressable>
                  )}
                />
              </View>
            )}
          </Pressable>
        )}
      </Modal>
    </>
  )
}
