// Native date picker (Milestone 7 — replaces free-form date text entry per
// the approved M7 design). Value/onChange are always plain YYYY-MM-DD local
// calendar-date strings, matching budgetPeriod.ts's convention — the Date
// object only ever exists transiently inside this component, parsed and
// re-serialized via local getters (never toISOString(), which is UTC and
// can shift the day near midnight in Asia/Jerusalem).
//
// Product-quality pass: the web branch previously rendered a raw
// `<input type="date">`. The surrounding field could be themed (border/
// fill/text/colorScheme), but the calendar POPUP itself is browser chrome —
// OS-native, not stylable beyond that one CSS property, and visibly
// unrelated to this app's own design system (different type, spacing,
// accent color) the moment it opens. Web now renders a real in-design-
// system calendar popover, following the exact same anchored-popover
// pattern components/ui/Select.tsx already established: same
// usePopoverAnchor hook, same bottom-sheet-below-desktop / anchored-
// popover-at-desktop split, same backdrop Pressable for click-outside +
// Modal-owned Escape-to-close, same "only the individual interactive rows
// are Pressables, nothing else intercepts the click" structure — no new
// click-interception mechanism invented here. iOS/Android are untouched.

import { useState } from 'react'
import { Modal, Platform, Pressable, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import {
  formatMonthLabel,
  getCurrentMonthPeriodStart,
  getPeriodStartForDate,
  localDateString,
  shiftMonth,
} from '@/features/budgets/lib/budgetPeriod'
import { formatDateDisplay } from '@/lib/dates/format'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useRTL } from '@/hooks/useRTL'
import { usePopoverAnchor } from '@/hooks/usePopoverAnchor'

interface DatePickerFieldProps {
  label: string
  value: string // YYYY-MM-DD
  onChange: (value: string) => void
}

export function DatePickerField({ label, value, onChange }: DatePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(Platform.OS === 'ios')

  // Parsed with an explicit local-midnight time component (no 'Z' suffix) —
  // `new Date('YYYY-MM-DD')` alone is parsed as UTC midnight per spec, which
  // is exactly the footgun this component exists to avoid.
  const dateValue = new Date(`${value}T00:00:00`)

  function handleChange(_event: unknown, selected?: Date) {
    if (Platform.OS === 'android') setIsOpen(false)
    if (selected) onChange(localDateString(selected))
  }

  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
      {Platform.OS === 'android' && (
        <Pressable
          onPress={() => setIsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: value }}
          className="rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 dark:border-border-dark dark:bg-surfaceMuted-dark"
        >
          <Text className="text-ink-light dark:text-ink-dark">{value}</Text>
        </Pressable>
      )}
      {Platform.OS === 'web' && <WebCalendarField label={label} value={value} onChange={onChange} />}
      {isOpen && Platform.OS !== 'web' && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handleChange}
        />
      )}
    </View>
  )
}

const POPOVER_WIDTH = 296
const POPOVER_MAX_HEIGHT = 372
const WEEKDAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

// Sunday-first week grid, days always laid out chronologically left-to-right
// (column 0 = Sunday) regardless of document direction — the same
// international convention every calendar UI uses even in RTL languages;
// only the surrounding text/labels follow RTL, never the date grid itself.
// One row per week, `null` for the leading/trailing blanks outside the
// month.
function buildCalendarWeeks(periodStart: string): (number | null)[][] {
  const [year, month] = periodStart.split('-').map(Number)
  const firstWeekday = new Date(year!, month! - 1, 1).getDay() // 0=Sun..6=Sat
  const daysInMonth = new Date(year!, month!, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function WebCalendarField({ label, value, onChange }: DatePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [viewPeriodStart, setViewPeriodStart] = useState(() =>
    value ? getPeriodStartForDate(value) : getCurrentMonthPeriodStart()
  )
  const { triggerRef, isDesktopWeb, measure, style: anchorStyle } = usePopoverAnchor()
  const { colorScheme: scheme } = useColorScheme()
  const { flip } = useRTL()
  const { t } = useTranslation()
  const isDark = scheme === 'dark'

  const today = localDateString()
  const currentMonthKey = viewPeriodStart.slice(0, 7)
  const selectedDay = value.slice(0, 7) === currentMonthKey ? Number(value.slice(8, 10)) : null
  const todayDay = today.slice(0, 7) === currentMonthKey ? Number(today.slice(8, 10)) : null
  const weeks = buildCalendarWeeks(viewPeriodStart)

  function open() {
    setViewPeriodStart(value ? getPeriodStartForDate(value) : getCurrentMonthPeriodStart())
    setIsOpen(true)
    measure()
  }

  function selectDay(day: number) {
    const [year, month] = viewPeriodStart.split('-')
    onChange(`${year}-${month}-${String(day).padStart(2, '0')}`)
    setIsOpen(false)
  }

  const inkColor = isDark ? colors.ink.dark : colors.ink.light
  const inkMuted = isDark ? colors.inkMuted.dark : colors.inkMuted.light
  const accent = isDark ? colors.accent.dark : colors.accent.light
  const heroInk = isDark ? colors.hero.light : '#ffffff'

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value }}
        className="flex-row items-center justify-between rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 dark:border-border-dark dark:bg-surfaceMuted-dark"
      >
        <Text className="text-ink-light dark:text-ink-dark">{formatDateDisplay(value)}</Text>
        <Ionicons name="calendar-outline" size={ICON.row} color={inkMuted} />
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType={isDesktopWeb ? 'fade' : 'slide'}
        onRequestClose={() => setIsOpen(false)}
      >
        {isDesktopWeb ? (
          // Anchored popover — identical structure to Select.tsx's own
          // desktop branch: a full-screen backdrop Pressable owns click-
          // outside-to-close, and nothing inside re-intercepts the click;
          // only the individually interactive rows (month-nav buttons, day
          // cells, "today") are their own Pressables/buttons, which capture
          // their own presses before the backdrop ever sees them.
          <Pressable className="flex-1" onPress={() => setIsOpen(false)}>
            <View
              style={anchorStyle(POPOVER_WIDTH, POPOVER_MAX_HEIGHT)}
              className="rounded-xl border border-border-light bg-surface-light p-3 shadow-lg dark:border-border-dark dark:bg-surface-dark"
            >
              <CalendarBody
                viewPeriodStart={viewPeriodStart}
                setViewPeriodStart={setViewPeriodStart}
                weeks={weeks}
                selectedDay={selectedDay}
                todayDay={todayDay}
                selectDay={selectDay}
                onToday={() => {
                  onChange(today)
                  setViewPeriodStart(getCurrentMonthPeriodStart())
                  setIsOpen(false)
                }}
                colors={{ inkColor, inkMuted, accent, heroInk }}
                flip={flip}
                t={t}
              />
            </View>
          </Pressable>
        ) : (
          <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setIsOpen(false)}>
            <View className="w-full rounded-t-2xl bg-surface-light p-4 pb-8 dark:bg-surface-dark">
              <View className="mb-2 items-center">
                <View className="h-1 w-9 rounded-full bg-border-light dark:bg-border-dark" />
              </View>
              <CalendarBody
                viewPeriodStart={viewPeriodStart}
                setViewPeriodStart={setViewPeriodStart}
                weeks={weeks}
                selectedDay={selectedDay}
                todayDay={todayDay}
                selectDay={selectDay}
                onToday={() => {
                  onChange(today)
                  setViewPeriodStart(getCurrentMonthPeriodStart())
                  setIsOpen(false)
                }}
                colors={{ inkColor, inkMuted, accent, heroInk }}
                flip={flip}
                t={t}
              />
            </View>
          </Pressable>
        )}
      </Modal>
    </>
  )
}

interface CalendarBodyProps {
  viewPeriodStart: string
  setViewPeriodStart: (updater: (p: string) => string) => void
  weeks: (number | null)[][]
  selectedDay: number | null
  todayDay: number | null
  selectDay: (day: number) => void
  onToday: () => void
  colors: { inkColor: string; inkMuted: string; accent: string; heroInk: string }
  flip: <T>(left: T, right: T) => T
  t: (key: string) => string
}

// RN primitives throughout (Pressable/Text), matching every other
// interactive list in this app (see Select.tsx's own option rows) — not
// raw HTML elements. react-native-web still renders these to real,
// individually focusable/tabbable DOM nodes with working accessibility
// metadata at runtime; the difference is `accessibilityRole`/
// `accessibilityLabel`/`accessibilityState` instead of raw `role`/
// `aria-*`, which is what every test in this codebase (this file's own
// tests included) can actually exercise via
// @testing-library/react-native's queries. RN has no "grid"/"gridcell"
// accessibilityRole, so each day is announced as a selected/unselected
// button with its full date as the label — one step short of the WAI-ARIA
// APG date-grid pattern's roving-tabindex/arrow-key navigation, but fully
// operable by tab+Enter and by a screen reader either way.
function CalendarBody({
  viewPeriodStart,
  setViewPeriodStart,
  weeks,
  selectedDay,
  todayDay,
  selectDay,
  onToday,
  colors: c,
  flip,
  t,
}: CalendarBodyProps) {
  return (
    <>
      <View className="mb-2 flex-row items-center justify-between px-1">
        <Pressable
          onPress={() => setViewPeriodStart((p) => shiftMonth(p, -1))}
          accessibilityRole="button"
          accessibilityLabel={t('common.datePicker.previousMonth')}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-surfaceMuted-light dark:active:bg-surfaceMuted-dark"
        >
          <Ionicons name={flip('chevron-back', 'chevron-forward')} size={ICON.row} color={c.inkMuted} />
        </Pressable>
        <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
          {formatMonthLabel(viewPeriodStart)}
        </Text>
        <Pressable
          onPress={() => setViewPeriodStart((p) => shiftMonth(p, 1))}
          accessibilityRole="button"
          accessibilityLabel={t('common.datePicker.nextMonth')}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-surfaceMuted-light dark:active:bg-surfaceMuted-dark"
        >
          <Ionicons name={flip('chevron-forward', 'chevron-back')} size={ICON.row} color={c.inkMuted} />
        </Pressable>
      </View>

      {/* Rendered in REVERSE JSX order on purpose, both here and in the day
          grid below — not a stray bug. This app's document root is
          dir="rtl" (app/_layout.tsx), and a plain (non-reversed) flex-row
          under dir="rtl" places the FIRST child at the visual RIGHT edge —
          confirmed by measuring actual rendered positions with Playwright,
          exactly the "don't judge RTL from class names" standard this
          fix was built to. A calendar grid's days must still increase
          chronologically LEFT to RIGHT regardless of document direction —
          the same international convention every calendar UI uses even in
          Hebrew/Arabic (only the surrounding text/labels follow RTL, never
          the date grid itself) — so WEEKDAY_LABELS/each week's cells are
          reversed before mapping, making Sunday (index 0) the LAST JSX
          child and therefore the LEFTMOST rendered cell. */}
      <View className="flex-row px-1">
        {[...WEEKDAY_LABELS].reverse().map((wd, i) => (
          <View key={i} className="w-9 items-center py-1">
            <Text className="text-meta font-sansMedium text-inkMuted-light dark:text-inkMuted-dark">{wd}</Text>
          </View>
        ))}
      </View>

      <View accessibilityLabel={formatMonthLabel(viewPeriodStart)}>
        {weeks.map((week, wi) => (
          <View key={wi} className="flex-row">
            {[...week].reverse().map((day, di) => {
              if (day === null) return <View key={di} style={{ width: 36, height: 36 }} />
              const isSelected = day === selectedDay
              const isToday = day === todayDay
              const fullDate = new Date(
                Number(viewPeriodStart.slice(0, 4)),
                Number(viewPeriodStart.slice(5, 7)) - 1,
                day
              )
              return (
                <Pressable
                  key={di}
                  onPress={() => selectDay(day)}
                  accessibilityRole="button"
                  accessibilityLabel={DAY_LABEL_FORMATTER.format(fullDate)}
                  accessibilityState={{ selected: isSelected }}
                  // RRR §16 P0-4: see SegmentedControl.tsx's note —
                  // aria-selected reaches the DOM directly.
                  aria-selected={isSelected}
                  style={{
                    width: 36,
                    height: 36,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: isToday && !isSelected ? c.accent : 'transparent',
                    backgroundColor: isSelected ? c.accent : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: isSelected || isToday ? '600' : '400',
                      color: isSelected ? c.heroInk : c.inkColor,
                    }}
                  >
                    {day}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>

      <Pressable
        onPress={onToday}
        accessibilityRole="button"
        className="mt-2 items-center border-t border-border-light py-2.5 dark:border-border-dark"
      >
        <Text className="text-caption font-sansSemibold" style={{ color: c.accent }}>
          {t('common.datePicker.today')}
        </Text>
      </Pressable>
    </>
  )
}
