// Direction D signature visualization — an ISOLATED prototype, built for the
// Home experience blueprint's design-lock review. Deliberately NOT wired
// into any screen: not CommitmentTimeline.tsx's replacement, not a new
// section on Home, not imported anywhere outside dev/diagnostics yet. See
// app/(app)/diagnostics/timeline-lab.tsx for the review harness this
// renders inside, and the accompanying architecture-reviewer verdict for
// whether this evolves CommitmentTimeline.tsx, replaces it, or stays a
// distinct component. Do not import this from a real screen before that
// decision is made and CLAUDE.md's own review gate (architecture-reviewer →
// product-scope-guardian → qa-adversarial-reviewer) has run on the result.
//
// It computes nothing (same discipline as ForecastChart.tsx and the
// /safe-to-spend screen): every balance shown is a `dailyPoints` entry from
// calculateCashFlowForecast, read directly, never re-summed here. The only
// arithmetic in this file is turning an existing balance into a pixel
// height and picking which of the horizon's many days are worth a step —
// the same category of work ForecastChart.tsx already does for its line,
// and this component deliberately reuses its domain/headroom heuristic
// (see `computeDomain` below) rather than inventing a second one that could
// disagree with the chart on what "close to zero" means.
//
// Why a new file instead of extending CommitmentTimeline.tsx directly: that
// component is a 14-day, amount-less, decorative dot strip with
// `pointerEvents="none"` labels — not interactive, not amount-aware, fixed
// to a window shorter than a full forecast horizon. Retrofitting amounts,
// arbitrary horizons, press handling and a zero-crossing baseline onto it
// would rewrite nearly everything it does; building the real target shape
// here and letting the reviewer decide whether the old file becomes this
// one or is retired keeps that decision honest instead of assumed.
//
// Design constraints this component holds itself to (Home Design Lock,
// round 2):
//   - The timeline is a scannable financial shape, not a transaction list.
//     A step shows a date and a balance; the underlying events are one tap
//     away in the detail panel below the strip, never inline as rows.
//   - RTL: array order is chronological (today first); this app's global
//     I18nManager RTL flip renders a plain flex-row in reading order
//     without this component reversing anything itself (verified visually
//     against the SVG-based siblings, which cannot rely on that flip and
//     do their own arithmetic mirror instead — see ForecastChart.tsx's own
//     header for why SVG is the one exception).
//   - Every string is i18n (`financialTimeline.*` in he.json) — nothing
//     hardcoded, unlike the throwaway diagnostics screen this renders in.

import { useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, Animated, Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { Ionicons } from '@expo/vector-icons'
import { Money } from '@/components/ui/Money'
import { formatDateShort } from '@/lib/dates/format'
import { formatILS } from '@/lib/money/format'
import type { CashFlowForecastEvent, CashFlowForecastResult } from '@/lib/engines/cashflow/calculateCashFlowForecast'

export interface FinancialTimelineProps {
  forecast: CashFlowForecastResult
  /** Called when a household taps "view details" inside an expanded step. */
  onEventPress?: (event: CashFlowForecastEvent) => void
  /** Called from the low-point step's own CTA — typically routes to /cash-flow. */
  onViewFullForecast?: () => void
  testID?: string
}

interface TimelineStep {
  date: string
  balanceAgorot: number
  events: CashFlowForecastEvent[]
  isToday: boolean
  isLowPoint: boolean
  isHorizonEnd: boolean
}

const STEP_HEIGHT = 128
const TOP_PAD = 22
// Wide enough for a six-figure ₪ amount at `text-meta` size without
// `numberOfLines={1}` falling back to an ellipsis — the design-lock lab's
// own "large currency values" and "stress" (many events, dense steps)
// scenarios both caught a truncated figure at the previous, narrower value.
const STEP_MIN_WIDTH = 84

// Same heuristic as ForecastChart.tsx's `staysComfortablyPositive`, restated
// for this component's own domain rather than imported, since the two
// components may show different subsets of dailyPoints (this one only
// steps with something to say) and must not be coupled by a shared mutable
// module — a pure, independently-verifiable copy of the same reasoning.
function computeDomain(balances: number[]): { min: number; max: number; showZero: boolean } {
  // Architecture-review fix: the first version forced 0 into rawMin/rawMax
  // before computing rawRange, which meant `staysComfortablyPositive` was
  // comparing against a zero-inflated range and almost never fired for a
  // household that stays healthily positive all horizon — exactly the case
  // ForecastChart.tsx's own heuristic exists to zoom in on. rawMin/rawMax
  // must be balance-only, matching ForecastChart.tsx's calculation exactly;
  // 0 only enters the domain in the non-comfortable branch below.
  const rawMin = Math.min(...balances)
  const rawMax = Math.max(...balances)
  const rawRange = rawMax - rawMin || 1
  const staysComfortablyPositive = rawMin > rawRange
  if (staysComfortablyPositive) {
    return { min: rawMin - rawRange * 0.15, max: rawMax + rawRange * 0.15, showZero: false }
  }
  return { min: Math.min(0, rawMin), max: Math.max(0, rawMax), showZero: true }
}

function buildSteps(forecast: CashFlowForecastResult): TimelineStep[] {
  const byDate = new Map(forecast.dailyPoints.map((p) => [p.date, p]))
  const eventsByDate = new Map<string, CashFlowForecastEvent[]>()
  for (const event of forecast.events) {
    const list = eventsByDate.get(event.date)
    if (list) list.push(event)
    else eventsByDate.set(event.date, [event])
  }

  const dates = new Set<string>(eventsByDate.keys())
  const firstDate = forecast.dailyPoints[0]?.date
  const lastDate = forecast.dailyPoints[forecast.dailyPoints.length - 1]?.date
  if (firstDate) dates.add(firstDate)
  if (lastDate) dates.add(lastDate)

  return Array.from(dates)
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({
      date,
      balanceAgorot: byDate.get(date)?.balanceAgorot ?? forecast.startingBalanceAgorot,
      events: (eventsByDate.get(date) ?? []).sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
      isToday: date === firstDate,
      isLowPoint: date === forecast.lowestBalanceDate,
      isHorizonEnd: date === lastDate,
    }))
}

function StepBar({
  step,
  domain,
  isDark,
  pinned,
  dimmed,
  onPress,
}: {
  step: TimelineStep
  domain: { min: number; max: number; showZero: boolean }
  isDark: boolean
  pinned: boolean
  dimmed: boolean
  onPress: () => void
}) {
  const { t } = useTranslation()
  const range = domain.max - domain.min || 1
  const usable = STEP_HEIGHT - TOP_PAD
  const yFor = (balance: number) => TOP_PAD + usable * (1 - (balance - domain.min) / range)
  const zeroY = yFor(0)
  const balY = yFor(step.balanceAgorot)
  const isNegative = step.balanceAgorot < 0
  const barTop = Math.min(zeroY, balY)
  const barHeight = Math.max(2, Math.abs(zeroY - balY))

  // useState's lazy initializer, not useRef — this codebase's lint rule
  // (react-hooks/refs) flags reading `.current` during render even for a
  // stably-identitied value like this; a state value read during render is
  // fine and we never call the setter again, so identity across renders is
  // just as stable as a ref would have given us.
  const [anim] = useState(() => new Animated.Value(0))
  useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return
      if (reduced) {
        anim.setValue(1)
      } else {
        Animated.timing(anim, { toValue: 1, duration: 260, useNativeDriver: true }).start()
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A negative balance is danger tone on ANY step it appears on — not only
  // the flagged lowest-point day. A household's balance can stay negative
  // across several consecutive days (no event ever brings it back above
  // zero within the horizon); every one of those days is bad news, not
  // just the single worst one. Verified against the design-lock lab's own
  // "negative projected balance" scenario, which caught this exact bug
  // before it shipped: the horizon-end step showed the same negative
  // figure as the flagged low point but rendered in the ordinary accent
  // color, because only `step.isLowPoint` was checked.
  const tone = isNegative
    ? 'danger'
    : step.isLowPoint
      ? 'warning'
      : step.events.some((e) => e.pastDue)
        ? 'danger'
        : 'accent'
  const barColor =
    tone === 'danger'
      ? isDark
        ? colors.danger.dark
        : colors.danger.light
      : tone === 'warning'
        ? isDark
          ? colors.warning.dark
          : colors.warning.light
        : isDark
          ? colors.accent.dark
          : colors.accent.light

  const pastDueCount = step.events.filter((e) => e.pastDue).length
  const label = t('financialTimeline.stepAccessibilityLabel', {
    date: step.isToday ? t('financialTimeline.today') : formatDateShort(step.date),
    balance: formatILS(step.balanceAgorot),
    count: step.events.length,
  })

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: pinned }}
      testID={`timeline-step-${step.date}`}
      style={{ width: STEP_MIN_WIDTH, opacity: dimmed && !pinned ? 0.35 : 1 }}
      className="items-center px-0.5"
    >
      {step.events.length > 0 && (
        <View
          className={`mb-1 h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 ${
            pastDueCount > 0 ? 'bg-danger-light dark:bg-danger-dark' : 'bg-heroBorder-light dark:bg-heroBorder-dark'
          }`}
        >
          <Text className="font-heeboBold text-meta text-white" maxFontSizeMultiplier={1.2}>
            {step.events.length}
          </Text>
        </View>
      )}
      {/* overflow:'hidden' is a deliberate safety net, not decoration: when
          the compressed ("comfortably positive") domain branch pushes the
          true zero line far outside this step's own visible band, a bar
          computed against it could in principle extend past STEP_HEIGHT —
          this clips that case defensively rather than relying on every
          future domain tweak to keep the math perfectly in-bounds. */}
      <View style={{ height: STEP_HEIGHT, width: '100%', justifyContent: 'flex-end', overflow: 'hidden' }}>
        {/* The exact figure is worth the width only on today, the low
            point, and whichever step the household just tapped — showing
            it on every step (originally the design) was dense enough on a
            real 7+ event month to force `numberOfLines={1}` into an
            ellipsis, exactly what the design-lock lab's own "many events"
            scenarios caught. The bar's own height already carries the
            shape; the number is confirmation, not the primary signal, so
            it only earns a spot on the three days that matter most. */}
        {(step.isToday || step.isLowPoint || pinned) && (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            className="font-heeboBold text-meta text-heroInk-light"
            style={{ position: 'absolute', top: Math.max(0, Math.min(barTop, zeroY) - 15), width: '100%', textAlign: 'center' }}
            maxFontSizeMultiplier={1.3}
          >
            {formatILS(step.balanceAgorot)}
          </Text>
        )}
        {domain.showZero && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: zeroY, height: 1, width: '100%', backgroundColor: colors.heroBorder.light }}
          />
        )}
        <Animated.View
          style={{
            position: 'absolute',
            top: barTop,
            height: barHeight,
            width: 22,
            alignSelf: 'center',
            borderRadius: 6,
            backgroundColor: barColor,
            opacity: anim,
            transform: [{ scaleY: anim }],
          }}
        />
      </View>
      <Text
        numberOfLines={1}
        className={`mt-2 text-meta ${pinned ? 'font-sansSemibold text-heroInk-light' : 'font-sans text-heroInkMuted-light'}`}
      >
        {step.isToday ? t('financialTimeline.today') : formatDateShort(step.date)}
      </Text>
    </Pressable>
  )
}

export function FinancialTimeline({ forecast, onEventPress, onViewFullForecast, testID }: FinancialTimelineProps) {
  const { t } = useTranslation()
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const [pinnedDate, setPinnedDate] = useState<string | null>(null)

  const steps = useMemo(() => buildSteps(forecast), [forecast])
  const domain = useMemo(() => computeDomain(steps.map((s) => s.balanceAgorot)), [steps])
  const pinnedStep = steps.find((s) => s.date === pinnedDate) ?? null

  if (forecast.events.length === 0) {
    return (
      <View testID={testID} className="px-4 py-6 items-center">
        <Text className="font-heeboBold text-body text-heroInk-light">{t('financialTimeline.emptyTitle')}</Text>
        <Text className="mt-1 text-center text-caption text-heroInkMuted-light">{t('financialTimeline.emptyBody')}</Text>
        <View className="mt-3">
          <Money agorot={forecast.startingBalanceAgorot} size="large" tone="hero" />
        </View>
      </View>
    )
  }

  return (
    <View testID={testID}>
      <View className="flex-row items-baseline justify-between px-4 pb-2">
        <Text className="font-heeboBold text-meta uppercase text-heroInkMuted-light">
          {t('financialTimeline.sectionTitle')}
        </Text>
        <Text
          className={`text-meta font-sansSemibold ${forecast.lowestBalanceAgorot < 0 ? 'text-danger-dark' : 'text-heroAccent-light'}`}
        >
          {t('financialTimeline.lowPointInline', {
            amount: formatILS(forecast.lowestBalanceAgorot),
            date: formatDateShort(forecast.lowestBalanceDate),
          })}
        </Text>
      </View>

      {/* Horizontal scroll, not a squeezed flex row — a busy month (the
          design-lock lab's own "stress" fixture regularly has 8-9 event
          days) has no width, at any of the three reviewed breakpoints, that
          fits every step without either crushing each one past legibility
          or silently clipping the ones that don't fit. Scrolling keeps every
          step at a legible, fixed width and makes the far end of the
          horizon reachable instead of invisible. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', paddingHorizontal: 12 }}
      >
        {steps.map((step) => (
          <StepBar
            key={step.date}
            step={step}
            domain={domain}
            isDark={isDark}
            pinned={pinnedDate === step.date}
            dimmed={pinnedDate !== null}
            onPress={() => setPinnedDate((cur) => (cur === step.date ? null : step.date))}
          />
        ))}
      </ScrollView>

      {pinnedStep && (
        <View className="mx-4 mt-3 rounded-control border border-heroBorder-light bg-white/5 p-3">
          <Text className="font-heeboBold text-body text-heroInk-light">
            {/* "Already locked in for today" only makes sense once there is
                something locked in — the design-lock lab's own "no events
                today" scenarios (zero-event forecasts, or any forecast whose
                first real event lands later) caught this reading oddly
                ("already locked in" over an empty list) before this guard. */}
            {pinnedStep.isToday && pinnedStep.events.length > 0
              ? t('financialTimeline.todayDetailTitle')
              : pinnedStep.isToday
                ? t('financialTimeline.today')
                : formatDateShort(pinnedStep.date)}
          </Text>
          {pinnedStep.events.length === 0 ? (
            <Text className="mt-1 text-caption text-heroInkMuted-light">{t('financialTimeline.noMovementThisDay')}</Text>
          ) : (
            pinnedStep.events.map((event) => (
              <Pressable
                key={event.id}
                onPress={() => onEventPress?.(event)}
                accessibilityRole="button"
                className="mt-2 flex-row items-center justify-between gap-3"
              >
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-caption font-sansSemibold text-heroInk-light">
                    {event.title}
                  </Text>
                  {event.pastDue && (
                    <Text className="mt-0.5 text-meta text-danger-dark">{t('financialTimeline.pastDueBadge')}</Text>
                  )}
                </View>
                <Money
                  agorot={event.direction === 'outflow' ? -event.amountAgorot : event.amountAgorot}
                  size="caption"
                  tone="heroMuted"
                  signed
                />
              </Pressable>
            ))
          )}
          {pinnedStep.isLowPoint && onViewFullForecast && (
            <Pressable
              onPress={onViewFullForecast}
              accessibilityRole="button"
              className="mt-3 flex-row items-center gap-1 self-start"
            >
              <Text className="text-caption font-sansSemibold text-heroAccent-light">
                {t('financialTimeline.viewFullForecast')}
              </Text>
              <Ionicons name="chevron-back" size={ICON.chip} color={colors.heroAccent.light} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}
