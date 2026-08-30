// The Home signature visualization — approved as "Direction D" across three
// design-review rounds (see the published review artifact this checkpoint
// implements). Replaces the old desktop-only, dot-only, no-balance
// `CommitmentTimeline` (components/ui/CommitmentTimeline.tsx, now deleted)
// with a connected balance journey: today's eligible cash -> each real
// forecast event -> the resulting balance after it -> ... -> the 30-day low
// point. Every number is a real `useCashFlowForecast` figure; this file
// computes nothing financial, only how to group/label/position them.
//
// Two exported components share one data-prep function:
//   - FinancialTimelineList  — the mobile-native vertical story (MobileHome).
//   - FinancialTimelineChart — the connected staircase chart (DesktopDashboard,
//     tabletLg 1024 and desktop 1200+ get their own plot sizing via
//     `variant`, not one chart scaled to fit).
// This mirrors the approved artifact's own single-source-of-truth structure
// (one render function branching by breakpoint) while keeping each
// platform's screen file importing only what it actually mounts — the
// phone app never pulls in the chart's SVG geometry, and the web-only
// desktop route never pulls in the list's expand/collapse state.
//
// "Meaningful" points (the Safe-to-Spend match, the low point, a same-day
// cluster, or a severe drop) get full labelling; routine points show only
// their resulting balance — the same "resulting balance and meaningful
// events over every possible label at once" rule the approved artifact
// validated. No label is ever invented: `cause` is always a real event
// title (or a count of how many real events landed the same day).

import { useState } from 'react'
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { useRouter } from 'expo-router'
import { colors } from '@/constants/colors'
import { formatILS } from '@/lib/money/format'
import { formatDayOfMonth, formatMonthAbbreviation } from '@/lib/dates/format'
import type { CashFlowForecastEvent, CashFlowForecastResult , CashFlowEventSource } from '@/lib/engines/cashflow/calculateCashFlowForecast'

// Presentational-only threshold (bold vs. quiet), not a financial figure —
// deciding which real delta gets emphasis is a display judgement, the same
// kind BudgetBar/StatusChip already make from real numbers elsewhere.
const SEVERE_DELTA_AGOROT = 300_000 // ₪3,000

interface TimelineStep {
  id: string
  date: string
  balanceAgorot: number
  deltaAgorot: number
  cause: string
  clusterCount: number
  isLow: boolean
  isConclusion: boolean
  severe: boolean
  meaningful: boolean
  events: CashFlowForecastEvent[]
}

const SOURCE_ROUTE: Record<CashFlowEventSource, (sourceId: string) => string> = {
  planned_obligation: (id) => `/obligations/${id}`,
  recurring: (id) => `/recurring/${id}`,
  installment_plan: (id) => `/installments/${id}`,
}

function buildSteps(
  forecast: CashFlowForecastResult,
  safeToSpendAgorot: number | null,
  clusterLabel: (count: number) => string,
  lowSuffix: string
): TimelineStep[] {
  const byDate = new Map<string, CashFlowForecastEvent[]>()
  for (const event of forecast.events) {
    const list = byDate.get(event.date)
    if (list) list.push(event)
    else byDate.set(event.date, [event])
  }

  const dates = [...byDate.keys()].sort()
  return dates.map((date) => {
    const events = byDate.get(date) as CashFlowForecastEvent[]
    const point = forecast.dailyPoints.find((p) => p.date === date)
    const balanceAgorot = point?.balanceAgorot ?? forecast.startingBalanceAgorot
    const deltaAgorot = (point?.inflowsAgorot ?? 0) - (point?.outflowsAgorot ?? 0)
    const isLow = date === forecast.lowestBalanceDate
    const isConclusion = safeToSpendAgorot !== null && balanceAgorot === safeToSpendAgorot
    const severe = Math.abs(deltaAgorot) >= SEVERE_DELTA_AGOROT
    const baseCause = events.length === 1 ? (events[0] as CashFlowForecastEvent).title : clusterLabel(events.length)
    return {
      id: date,
      date,
      balanceAgorot,
      deltaAgorot,
      // The low point's cause is named as such, the same way the approved
      // artifact distinguished it ("חדר כושר · שפל") — not just its
      // position in the sequence.
      cause: isLow ? `${baseCause} · ${lowSuffix}` : baseCause,
      clusterCount: events.length,
      isLow,
      isConclusion,
      severe,
      meaningful: isLow || isConclusion || severe || events.length > 1,
      events,
    }
  })
}

function eventActionRoute(event: CashFlowForecastEvent): string {
  return SOURCE_ROUTE[event.source](event.sourceId)
}

// The header's own "שפל: ₪X · date" badge — real `lowestBalanceAgorot`/
// `lowestBalanceDate`, already on `forecast`. Renders nothing when there is
// nothing to warn about yet (no events at all).
export function FinancialTimelineLowBadge({ forecast }: { forecast: CashFlowForecastResult }) {
  const { t } = useTranslation()
  if (forecast.events.length === 0) return null
  return (
    <Text className="text-meta font-sansSemibold text-heroAccent-light">
      {t('home.timeline.low', {
        amount: formatILS(forecast.lowestBalanceAgorot),
        date: t('home.timeline.date', {
          day: formatDayOfMonth(forecast.lowestBalanceDate),
          month: shortMonth(forecast.lowestBalanceDate),
        }),
      })}
    </Text>
  )
}

// ============================================================================
// Shared detail drawer — the tap-to-reveal full breakdown for any step,
// mobile and tablet/desktop alike. Every figure is the real event list.
// ============================================================================
function StepDetail({ step }: { step: TimelineStep }) {
  const { t } = useTranslation()
  const router = useRouter()
  return (
    <View className="mt-3 gap-2 rounded-control bg-white/[0.06] p-3">
      {step.events.map((event) => (
        <Pressable
          key={event.id}
          onPress={() => router.push(eventActionRoute(event) as never)}
          accessibilityRole="button"
          className="flex-row items-center justify-between gap-2"
        >
          <View className="flex-1">
            <Text className="text-caption font-sansSemibold text-heroInk-light" numberOfLines={1}>
              {event.title}
            </Text>
            <Text className="text-meta font-sans text-heroInkMuted-light">
              {t(`home.timeline.source.${event.source}`)}
              {event.pastDue ? ` · ${t('home.next.pastDue')}` : ''}
            </Text>
          </View>
          <Text className="text-caption font-heeboBold text-heroInk-light" style={{ fontVariant: ['tabular-nums'] }}>
            {formatILS(event.amountAgorot)}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

// ============================================================================
// Mobile: a native vertical story, not a shrunk horizontal chart.
// ============================================================================
export function FinancialTimelineList({
  forecast,
  safeToSpendAgorot,
}: {
  forecast: CashFlowForecastResult
  safeToSpendAgorot: number | null
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  const steps = buildSteps(forecast, safeToSpendAgorot, (count) => t('home.timeline.cluster', { count }), t('home.timeline.lowSuffix'))

  if (steps.length === 0) {
    return (
      <View className="items-center gap-1 rounded-control border border-dashed border-heroBorder-light px-4 py-5">
        <Text className="text-body font-heeboBold text-heroInk-light">{t('home.timeline.empty')}</Text>
        <Text className="text-center text-caption font-sans text-heroInkMuted-light">{t('home.timeline.emptyHint')}</Text>
      </View>
    )
  }

  const conclusion = steps.find((s) => s.isConclusion)
  const low = steps.find((s) => s.isLow)
  const headlineIds = new Set<string>([...(conclusion ? [conclusion.id] : []), ...(low ? [low.id] : [])])
  const visible = expanded ? steps : steps.filter((s) => headlineIds.has(s.id))
  const pinned = steps.find((s) => s.id === pinnedId)

  function toggle(id: string) {
    setPinnedId((prev) => (prev === id ? null : id))
  }

  return (
    <View>
      <Row
        isBaseline
        label={t('home.timeline.availableToday')}
        balanceAgorot={forecast.startingBalanceAgorot}
      />
      {visible.map((step) => (
        <Row
          key={step.id}
          step={step}
          selected={pinnedId === step.id}
          onPress={() => toggle(step.id)}
        />
      ))}
      {visible.length < steps.length || expanded ? (
        <Pressable
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityRole="button"
          className="mt-1 items-center border-t border-dashed border-heroBorder-light py-2.5"
        >
          <Text className="text-caption font-heeboBold text-heroAccent-light">
            {expanded ? t('home.timeline.showLess') : t('home.timeline.showAll', { count: steps.length })}
          </Text>
        </Pressable>
      ) : null}
      {pinned && <StepDetail step={pinned} />}
    </View>
  )
}

function Row({
  isBaseline = false,
  label,
  balanceAgorot,
  step,
  selected,
  onPress,
}: {
  isBaseline?: boolean
  label?: string
  balanceAgorot?: number
  step?: TimelineStep
  selected?: boolean
  onPress?: () => void
}) {
  const { t } = useTranslation()
  const dir = step ? (step.deltaAgorot >= 0 ? 'up' : 'down') : null
  const dotClass = isBaseline
    ? 'bg-heroInk-light'
    : dir === 'up'
      ? 'bg-positive-light'
      : step?.severe
        ? 'bg-warning-light'
        : 'bg-heroAccent-light'

  const body = (
    <View
      className={`flex-row items-center gap-2.5 py-2.5 ${isBaseline ? '' : 'border-t border-white/[0.07]'} ${selected ? 'rounded-control bg-white/[0.05] px-2' : ''}`}
    >
      <View className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      <View className="flex-1">
        <Text
          className={`text-body font-sansSemibold ${step?.isLow ? 'text-warning-light' : 'text-heroInk-light'}`}
          numberOfLines={1}
        >
          {isBaseline ? label : step?.cause}
        </Text>
        {!isBaseline && step && (
          <Text className="mt-0.5 text-meta font-sans text-heroInkMuted-light">
            {t('home.timeline.date', { day: formatDayOfMonth(step.date), month: shortMonth(step.date) })}
            {' · '}
            {step.deltaAgorot >= 0 ? '+' : '−'}
            {formatILS(step.deltaAgorot)}
          </Text>
        )}
      </View>
      <View className="items-end">
        <Text
          className="text-body font-heeboBold text-heroInk-light"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatILS(isBaseline ? (balanceAgorot as number) : (step as TimelineStep).balanceAgorot)}
        </Text>
        {step?.isConclusion && (
          <Text className="text-meta font-heeboBold text-heroAccent-light">{t('home.timeline.conclusionFlag')}</Text>
        )}
      </View>
    </View>
  )

  if (isBaseline || !onPress) return body
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={step?.cause}>
      {body}
    </Pressable>
  )
}

// Hebrew month abbreviation from an ISO date, reusing the same fixed table
// lib/dates/format.ts's formatMonthAbbreviation owns, stripped of its
// trailing geresh so "{{day}} ב{{month}}" below composes as one i18n
// template rather than a hardcoded string, per CLAUDE.md's i18n rule.
function shortMonth(date: string): string {
  return formatMonthAbbreviation(date).replace('׳', '')
}

// ============================================================================
// Tablet (1024) / Desktop (1200+): the connected staircase chart.
// ============================================================================
export type FinancialTimelineChartVariant = 'tabletLg' | 'desktop'

const PLOT_HEIGHT: Record<FinancialTimelineChartVariant, number> = { tabletLg: 84, desktop: 72 }
const PAD_TOP = 42
const BAR_WIDTH = 22
const BASELINE_WIDTH = 28

export function FinancialTimelineChart({
  forecast,
  safeToSpendAgorot,
  variant,
}: {
  forecast: CashFlowForecastResult
  safeToSpendAgorot: number | null
  variant: FinancialTimelineChartVariant
}) {
  const { t } = useTranslation()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const [width, setWidth] = useState<number | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  const steps = buildSteps(forecast, safeToSpendAgorot, (count) => t('home.timeline.cluster', { count }), t('home.timeline.lowSuffix'))

  function handleLayout(e: LayoutChangeEvent) {
    const next = Math.round(e.nativeEvent.layout.width)
    setWidth((prev) => (prev === next ? prev : next))
  }

  if (steps.length === 0) {
    return (
      <View className="items-center gap-1 rounded-control border border-dashed border-heroBorder-light px-4 py-6">
        <Text className="text-body font-heeboBold text-heroInk-light">{t('home.timeline.empty')}</Text>
        <Text className="text-center text-caption font-sans text-heroInkMuted-light">{t('home.timeline.emptyHint')}</Text>
      </View>
    )
  }

  const plotH = PLOT_HEIGHT[variant]
  const svgH = plotH + PAD_TOP + 34
  // One uniform shape for the baseline point and every real step — `step`
  // is null only for the baseline, so every field access below narrows on
  // that single check instead of an unsafe cast.
  const points: { balanceAgorot: number; step: TimelineStep | null }[] = [
    { balanceAgorot: forecast.startingBalanceAgorot, step: null },
    ...steps.map((step) => ({ balanceAgorot: step.balanceAgorot, step })),
  ]
  const vals = points.map((p) => p.balanceAgorot)
  const maxV = Math.max(...vals)
  const minV = Math.min(0, ...vals)
  const toY = (v: number) => PAD_TOP + (1 - (v - minV) / ((maxV - minV) || 1)) * plotH

  const n = points.length
  const containerW = width ?? (variant === 'tabletLg' ? 900 : 1080)
  const marginPct = 4
  const usableW = containerW * (1 - (marginPct * 2) / 100)
  const startX = containerW * (marginPct / 100)
  // "right" grows with index so index 0 (today) sits nearest the container's
  // physical right edge and later steps flow leftward — the same
  // arithmetic-mirror convention ForecastChart.tsx already establishes for
  // this app's RTL timelines (SVG/absolute coordinates don't auto-flip).
  const xFor = (i: number) => startX + i * (usableW / (n - 1))

  const pinned = steps.find((s) => s.id === pinnedId)
  const svgPts: string[] = []

  const bars = points.map((p, i) => {
    const bal = p.balanceAgorot
    const px = xFor(i)
    const py = toY(bal)
    if (p.step === null) {
      const floorY = toY(minV)
      svgPts.push(`${px},${py}`)
      return (
        <View key="baseline" style={{ position: 'absolute', top: 0, bottom: 0, right: px - BASELINE_WIDTH / 2 }}>
          <View
            className="bg-heroInk-light"
            style={{ position: 'absolute', top: py, height: floorY - py, width: BASELINE_WIDTH, borderRadius: 5 }}
          />
          <Text
            className="text-caption font-heeboBold text-heroInk-light"
            style={{ position: 'absolute', top: py - 18, width: 88, right: -30, textAlign: 'center', fontVariant: ['tabular-nums'] }}
          >
            {formatILS(bal)}
          </Text>
          <Text
            className="text-meta font-sans text-heroInkMuted-light"
            style={{ position: 'absolute', top: floorY + 6, width: 66, right: -19, textAlign: 'center' }}
          >
            {t('home.timeline.today')}
          </Text>
        </View>
      )
    }

    const step = p.step
    // Safe: i >= 1 here (the i === 0 / baseline case returned above), so
    // i - 1 is always a valid index into the same array.
    const prevBal = points[i - 1]!.balanceAgorot
    const py0 = toY(prevBal)
    const top = Math.min(py, py0)
    const h = Math.max(2, Math.abs(py - py0))
    const up = step.deltaAgorot >= 0
    svgPts.push(`${px},${py0}`, `${px},${py}`)

    const barColor = up
      ? isDark
        ? colors.positive.dark
        : colors.positive.light
      : step.severe
        ? isDark
          ? colors.warning.dark
          : colors.warning.light
        : isDark
          ? colors.heroAccent.dark
          : colors.heroAccent.light

    return (
      <Pressable
        key={step.id}
        onPress={() => setPinnedId((prev) => (prev === step.id ? null : step.id))}
        accessibilityRole="button"
        accessibilityLabel={`${step.cause}, ${formatILS(step.deltaAgorot)}, ${formatILS(step.balanceAgorot)}`}
        // `right` alone gives this box zero width on web (every visible child
        // is itself absolutely positioned, so there's no in-flow content to
        // shrink-to-fit from) — the bar painted fine but had no real hit
        // area. An explicit width matching the visual bar fixes that.
        style={{ position: 'absolute', top: 0, bottom: 0, right: px - BAR_WIDTH / 2, width: BAR_WIDTH }}
      >
        <View
          style={{
            position: 'absolute',
            top,
            height: h,
            width: BAR_WIDTH,
            borderRadius: 5,
            backgroundColor: barColor,
            ...(pinnedId && pinnedId !== step.id ? { opacity: 0.3 } : null),
            ...(step.isConclusion ? { borderWidth: 2, borderColor: isDark ? colors.heroAccent.dark : colors.heroAccent.light } : null),
          }}
        />
        {step.clusterCount > 1 && (
          <View
            className="items-center justify-center rounded-full bg-danger-light"
            style={{ position: 'absolute', top: top - 9, right: -3, width: 14, height: 14 }}
          >
            <Text className="text-[9px] font-heeboBold text-white">{step.clusterCount}</Text>
          </View>
        )}
        {step.meaningful ? (
          <>
            <Text
              className={`text-meta font-heeboBold ${up ? 'text-positive-light' : step.severe ? 'text-warning-light' : 'text-heroAccent-light'}`}
              style={{ position: 'absolute', top: top - 16, width: 100, right: -39, textAlign: 'center', fontVariant: ['tabular-nums'] }}
            >
              {up ? '+' : '−'}
              {formatILS(step.deltaAgorot)}
            </Text>
            <Text
              className={`text-meta font-sans ${step.isLow ? 'text-warning-light' : 'text-heroInkMuted-light'}`}
              numberOfLines={1}
              style={{ position: 'absolute', top: top + h + 4, width: 100, right: -39, textAlign: 'center' }}
            >
              {step.cause}
            </Text>
            <Text
              className="text-meta font-heeboBold text-heroInk-light"
              style={{ position: 'absolute', top: Math.max(0, top - 33), width: 100, right: -39, textAlign: 'center', fontVariant: ['tabular-nums'] }}
            >
              {formatILS(step.balanceAgorot)}
            </Text>
            <View style={{ position: 'absolute', top: plotH + PAD_TOP + 10, width: 80, right: -29, alignItems: 'center' }}>
              <Text className="text-meta font-sans text-heroInkMuted-light" numberOfLines={1}>
                {t('home.timeline.date', { day: formatDayOfMonth(step.date), month: shortMonth(step.date) })}
              </Text>
              {step.isConclusion && (
                <Text className="text-[9px] font-heeboBold text-heroAccent-light">{t('home.timeline.conclusionFlag')}</Text>
              )}
            </View>
          </>
        ) : (
          <Text
            className="text-meta font-sansSemibold text-heroInkMuted-light"
            style={{ position: 'absolute', top: Math.max(0, top - 16), width: 70, right: -24, textAlign: 'center', fontVariant: ['tabular-nums'] }}
          >
            {formatILS(step.balanceAgorot)}
          </Text>
        )}
      </Pressable>
    )
  })

  return (
    <View>
      <View onLayout={handleLayout} style={{ position: 'relative', height: svgH }}>
        <Svg width="100%" height={svgH} style={{ position: 'absolute', top: 0, right: 0 }}>
          <Polyline
            points={svgPts.join(' ')}
            fill="none"
            stroke={isDark ? colors.inkMuted.dark : colors.inkMuted.light}
            strokeWidth={1.75}
            strokeDasharray="2 4"
            strokeLinecap="round"
            opacity={0.6}
          />
        </Svg>
        {bars}
      </View>
      {pinned && <StepDetail step={pinned} />}
    </View>
  )
}
