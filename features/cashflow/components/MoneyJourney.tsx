// CP8B production Money Journey — the causal EVENT -> DELTA -> RESULTING
// BALANCE visualization, built as an additive evolution of
// ForecastChart.tsx's own proven date-math/RTL/negative-state foundation
// (lib/engines/cashflow/dailyPointScale.ts, balanceAxisRange.ts) rather
// than a rewrite of it — ForecastChart itself, and the whole Cash Flow
// screen it backs, are untouched and stay exactly as approved.
//
// This was originally built (CP8B) as a deliberately NEW, from-scratch
// component rather than a rewrite of
// features/dashboard/components/FinancialTimeline.tsx — that file spaced
// its steps by EVENT-INDEX, not real date (`xFor(i) = startX + i *
// (usableW / (n - 1))`, a 1-day gap and a 10-day gap occupying identical
// horizontal distance), the exact defect this component exists to fix.
// CP8B shipped this on its own isolated review route
// (app/(app)/money-journey/index.tsx) precisely so it could be
// production-tested before any Home migration decision was made — that
// decision is CP8C: FinancialTimeline.tsx and its Home usage are gone,
// MobileHome.tsx/DesktopDashboard.tsx render this component directly now.
//
// RTL: time runs right to left, exactly like ForecastChart.tsx and
// FinancialTimelineChart already establish app-wide — TODAY sits at the
// physical right edge (index 0 of dailyPointScale), the horizon extends
// leftward. The tablet/desktop chart mirrors by arithmetic
// (`dailyPointScale.xForIndex`), the same reason ForecastChart's own header
// explains (SVG has no `dir`). The mobile list has no horizontal axis at
// all — chronological order runs top to bottom, which carries no RTL
// ambiguity — but the connector between two rows is still genuinely
// date-proportional: its height scales with the real day-gap between them
// (see CONNECTOR_PX_PER_DAY below), so a 10-day jump reads as a visibly
// longer stretch than a 1-day one even without a shared pixel axis. The
// selected-event BEFORE/DELTA/AFTER row is a plain flex-row with BEFORE
// first in source order — under this app's global RTL, that renders BEFORE
// at the physical right (first-read position) and AFTER at the left,
// so reading order and chronological order agree with no extra mirroring.
//
// Negative state: never turns the whole visualization red. Only the low
// point's own marker/label and, on the chart, a severe outflow's bar use a
// semantic color; the connecting line/track stay neutral. The low point
// gets a distinct halo-circle treatment (reusing ForecastChart.tsx's own
// proven marker idiom) so it reads as "the floor" through geometry, not
// just color.

import { useState } from 'react'
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Circle, Polyline } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { useRouter } from 'expo-router'
import { colors } from '@/constants/colors'
import { formatILS } from '@/lib/money/format'
import { formatDayOfMonth, formatMonthAbbreviation } from '@/lib/dates/format'
import { buildDailyPointScale } from '@/lib/engines/cashflow/dailyPointScale'
import { computeBalanceAxisRange } from '@/lib/engines/cashflow/balanceAxisRange'
import { buildMoneyJourneySteps, type MoneyJourneyStep } from '@/features/cashflow/lib/moneyJourneySteps'
import { resolveLabelCollisions } from '@/features/cashflow/lib/resolveLabelCollisions'
import type { CashFlowEventSource, CashFlowForecastResult } from '@/lib/engines/cashflow/calculateCashFlowForecast'
import { Money } from '@/components/ui/Money'

export type MoneyJourneyVariant = 'mobile' | 'tabletLg' | 'desktop'

// The header's own "שפל: ₪X · date" badge — real `lowestBalanceAgorot`/
// `lowestBalanceDate`, already on `forecast`. Renders nothing when there is
// nothing to warn about yet (no events at all). Mirrors
// FinancialTimeline.tsx's own (now-removed, CP8C) `FinancialTimelineLowBadge`
// exactly — same real figures, same i18n keys — so Home's header badge reads
// identically before and after the CP8C migration.
export function MoneyJourneyLowBadge({ forecast }: { forecast: CashFlowForecastResult }) {
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

interface MoneyJourneyProps {
  forecast: CashFlowForecastResult
  // Pass the real Safe-to-Spend figure to truthfully mark the step whose
  // resulting balance matches it; pass null on a surface where showing
  // that relationship would not be truthful (a different horizon than
  // Safe-to-Spend's own, for instance) — see moneyJourneySteps.ts's own
  // `isConclusion` contract.
  safeToSpendAgorot: number | null
  variant: MoneyJourneyVariant
  // CP8C fix: Home's own mobile presentation wants a short, curated
  // default (the low point, the nearest meaningful event, and — when it's
  // a genuinely different step — the single biggest change), not every
  // non-routine step. This is presentation-only: it selects which already-
  // computed steps show before "show all" is tapped, never a new step, a
  // new priority tier, or a new figure (see `selectCompactHeadlineIds`
  // below). Defaults to false so every other caller (the CP8B `/money-
  // journey` isolated review route included) keeps its exact prior
  // behavior unchanged. Ignored for `tabletLg`/`desktop` — the chart
  // variant's own label-collision presentation is untouched by this prop.
  compactDefault?: boolean
}

const SOURCE_ROUTE: Record<CashFlowEventSource, (sourceId: string) => string> = {
  planned_obligation: (id) => `/obligations/${id}`,
  recurring: (id) => `/recurring/${id}`,
  installment_plan: (id) => `/installments/${id}`,
}

function shortMonth(date: string): string {
  return formatMonthAbbreviation(date).replace('׳', '')
}

export function MoneyJourney({ forecast, safeToSpendAgorot, variant, compactDefault = false }: MoneyJourneyProps) {
  const { t } = useTranslation()
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  const steps = buildMoneyJourneySteps(forecast, safeToSpendAgorot, (count) => t('home.timeline.cluster', { count }))

  if (steps.length === 0) {
    return (
      <View className="items-center gap-1 rounded-control border border-dashed border-heroBorder-light px-4 py-6">
        <Text className="text-body font-heeboBold text-heroInk-light">{t('home.timeline.empty')}</Text>
        <Text className="text-center text-caption font-sans text-heroInkMuted-light">{t('home.timeline.emptyHint')}</Text>
      </View>
    )
  }

  const pinned = steps.find((s) => s.id === pinnedId) ?? null

  function toggle(id: string) {
    setPinnedId((prev) => (prev === id ? null : id))
  }

  if (variant === 'mobile') {
    return (
      <MoneyJourneyList
        forecast={forecast}
        steps={steps}
        pinnedId={pinnedId}
        pinned={pinned}
        onToggle={toggle}
        compactDefault={compactDefault}
      />
    )
  }
  return <MoneyJourneyChart forecast={forecast} steps={steps} variant={variant} pinnedId={pinnedId} pinned={pinned} onToggle={toggle} />
}

// ============================================================================
// The causal detail for a selected step — shared by mobile and
// tablet/desktop. BEFORE, first in source order, reads at the physical
// right under this app's global RTL (see this file's own header); AFTER
// reads at the left — chronological order and reading order agree with no
// extra mirroring needed for a plain flex-row.
// ============================================================================
function CausalDetail({ step }: { step: MoneyJourneyStep }) {
  const { t } = useTranslation()
  const router = useRouter()
  const up = step.deltaAgorot >= 0

  return (
    <View className="mt-3 gap-3 rounded-control bg-white/[0.06] p-3">
      <View className="flex-row items-center justify-between">
        <View className="items-center gap-0.5">
          <Text className="text-meta font-sansSemibold text-heroInkMuted-light">{t('moneyJourney.before')}</Text>
          <Money agorot={step.beforeBalanceAgorot} size="caption" tone="heroMuted" />
        </View>
        <View className="items-center gap-0.5">
          {/* RRR §16 P0-5: positive.light measures 3.05:1 (non-text OK,
              text FAIL) on hero.light and 2.61:1 FAIL on hero.dark — this
              entire component only ever renders on the hero surface, which
              (per constants/colors.ts's own header) does not invert with
              the app theme, so a `-light` semantic token is a real,
              app-theme-independent contrast bug here, not a stale style.
              positive.dark passes both hero backgrounds (10.2:1/8.72:1). */}
          <Text className={`text-caption font-heeboBold ${up ? 'text-positive-dark' : 'text-heroInk-light'}`}>
            {up ? '+' : '−'}
            {formatILS(step.deltaAgorot)}
          </Text>
        </View>
        <View className="items-center gap-0.5">
          <Text className="text-meta font-sansSemibold text-heroInkMuted-light">{t('moneyJourney.after')}</Text>
          <Money agorot={step.afterBalanceAgorot} size="caption" tone="hero" />
        </View>
      </View>

      <View className="gap-2 border-t border-white/[0.07] pt-2.5">
        {step.events.map((event) => (
          <Pressable
            key={event.id}
            onPress={() => router.push(SOURCE_ROUTE[event.source](event.sourceId) as never)}
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
    </View>
  )
}

function accessibleStepLabel(t: (key: string, opts?: Record<string, unknown>) => string, step: MoneyJourneyStep): string {
  const date = t('home.timeline.date', { day: formatDayOfMonth(step.date), month: shortMonth(step.date) })
  const sign = step.deltaAgorot >= 0 ? '+' : '−'
  return `${step.cause}, ${date}, ${sign}${formatILS(step.deltaAgorot)}, ${formatILS(step.afterBalanceAgorot)}`
}

// ============================================================================
// Mobile: a native vertical journey, not a shrunk chart. Connector height
// between two consecutive shown rows scales with the real day-gap between
// them (capped so the list stays scrollable) — the vertical equivalent of
// the chart's own date-proportional x-axis.
// ============================================================================
const CONNECTOR_PX_PER_DAY = 3
const CONNECTOR_MIN_PX = 10
const CONNECTOR_MAX_PX = 56

function connectorHeight(dayGap: number): number {
  return Math.min(CONNECTOR_MAX_PX, Math.max(CONNECTOR_MIN_PX, dayGap * CONNECTOR_PX_PER_DAY))
}

// CP8C fix — Home's own mobile default: at most 3 real steps, chosen
// entirely from fields moneyJourneySteps.ts (CP8B, unchanged) already
// computed. No new priority tier, no new figure, no invented event.
//   1. The forecast's own low point (`isLow`) — always included when one
//      of the real steps carries it, per the checkpoint's own "low point
//      must always be represented" requirement. (A forecast whose true
//      minimum falls on a day with no event has no step to represent it
//      on regardless — the same pre-existing limitation the full,
//      non-compact list and the desktop/tablet chart already have; this
//      selection does not change that.)
//   2. The nearest chronologically upcoming step that is NOT `routine`
//      ("meaningful") — `steps` is already date-ascending (see
//      moneyJourneySteps.ts), so this is simply the first match. Falls
//      back to the very first step overall only if every real step
//      happens to be routine, so "what's next" always has a real answer.
//   3. The single biggest real change (`Math.abs(deltaAgorot)`) among the
//      remaining non-routine steps — added only "when relevant," i.e.
//      only when it is a genuinely different step from 1 and 2, so a
//      forecast that already has its low point as the biggest event
//      never pads the default view with a duplicate.
function selectCompactHeadlineIds(steps: MoneyJourneyStep[]): Set<string> {
  const ids = new Set<string>()

  const low = steps.find((s) => s.isLow)
  if (low) ids.add(low.id)

  const nearestMeaningful = steps.find((s) => s.priority !== 'routine') ?? steps[0]
  if (nearestMeaningful) ids.add(nearestMeaningful.id)

  const biggestChange = steps
    .filter((s) => s.priority !== 'routine' && !ids.has(s.id))
    .sort((a, b) => Math.abs(b.deltaAgorot) - Math.abs(a.deltaAgorot))[0]
  if (biggestChange) ids.add(biggestChange.id)

  return ids
}

function MoneyJourneyList({
  forecast,
  steps,
  pinnedId,
  pinned,
  onToggle,
  compactDefault,
}: {
  forecast: CashFlowForecastResult
  steps: MoneyJourneyStep[]
  pinnedId: string | null
  pinned: MoneyJourneyStep | null
  onToggle: (id: string) => void
  compactDefault: boolean
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const headline = compactDefault
    ? selectCompactHeadlineIds(steps)
    : new Set(steps.filter((s) => s.priority !== 'routine').map((s) => s.id))
  const visible = expanded ? steps : steps.filter((s) => headline.has(s.id))

  return (
    <View>
      <ListRow isBaseline label={t('home.timeline.today')} balanceAgorot={forecast.startingBalanceAgorot} />
      {visible.map((step, i) => {
        const previousIndex = i === 0 ? 0 : visible[i - 1]!.index
        return (
          <View key={step.id}>
            <View style={{ height: connectorHeight(step.index - previousIndex) }} />
            <ListRow step={step} selected={pinnedId === step.id} onPress={() => onToggle(step.id)} />
            {pinnedId === step.id && pinned && <CausalDetail step={pinned} />}
          </View>
        )
      })}
      {visible.length < steps.length || expanded ? (
        <Pressable
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityRole="button"
          className="mt-1 items-center border-t border-dashed border-heroBorder-light py-2.5"
        >
          <Text className="text-caption font-heeboBold text-heroAccent-light">
            {expanded
              ? t('home.timeline.showLess')
              : compactDefault
                ? t('home.timeline.showAllCompact')
                : t('home.timeline.showAll', { count: steps.length })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function ListRow({
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
  step?: MoneyJourneyStep
  selected?: boolean
  onPress?: () => void
}) {
  const { t } = useTranslation()
  const up = step ? step.deltaAgorot >= 0 : null
  // RRR §16 P0-5: danger/warning/positive `-light` variants fail contrast
  // against the hero surface (this row only ever renders on hero), so the
  // dot colors below use the `-dark` variant unconditionally, matching the
  // hero-context fix in ProtectedFreeBoundary.tsx/DesktopDashboard.tsx.
  const dotClass = isBaseline
    ? 'bg-heroInk-light'
    : step?.isLow
      ? 'bg-danger-dark'
      : up
        ? 'bg-positive-dark'
        : step?.severe
          ? 'bg-warning-dark'
          : 'bg-heroAccent-light'

  const body = (
    <View
      className={`flex-row items-center gap-2.5 py-2.5 ${isBaseline ? '' : 'border-t border-white/[0.07]'} ${selected ? 'rounded-control bg-white/[0.05] px-2' : ''}`}
    >
      {/* The low point's halo — the same two-circle idiom
          ForecastChart.tsx's own marker uses, adapted to a small list dot,
          so "this is the floor" reads through geometry, not color alone. */}
      {step?.isLow ? (
        <View className="h-2.5 w-2.5 items-center justify-center">
          <View className="absolute h-4 w-4 rounded-full bg-danger-dark opacity-20" />
          <View className="h-2.5 w-2.5 rounded-full bg-danger-dark" />
        </View>
      ) : (
        <View className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      )}
      <View className="flex-1">
        <Text
          className={`text-body font-sansSemibold ${step?.isLow ? 'text-danger-dark' : 'text-heroInk-light'}`}
          numberOfLines={1}
        >
          {isBaseline ? label : step?.cause}
          {step?.isLow ? ` · ${t('home.timeline.lowSuffix')}` : ''}
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
        <Text className="text-body font-heeboBold text-heroInk-light" style={{ fontVariant: ['tabular-nums'] }}>
          {formatILS(isBaseline ? (balanceAgorot as number) : (step as MoneyJourneyStep).afterBalanceAgorot)}
        </Text>
        {step?.isConclusion && <Text className="text-meta font-heeboBold text-heroAccent-light">{t('home.timeline.conclusionFlag')}</Text>}
      </View>
    </View>
  )

  if (isBaseline || !onPress) return body
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      // RRR §16 P0-4: this is a pin/unpin toggle, not a widget-role
      // selection — aria-pressed is the correct ARIA state for a toggle
      // button (aria-selected requires option/tab/row/gridcell roles).
      // See SegmentedControl.tsx's note for why accessibilityState's
      // object form doesn't reach the DOM on web regardless.
      aria-pressed={Boolean(selected)}
      accessibilityLabel={step ? accessibleStepLabel(t, step) : undefined}
    >
      {body}
    </Pressable>
  )
}

// ============================================================================
// Tablet (1024) / Desktop (1200+): the connected, date-proportional chart.
// Every bar sits at its own dailyPointScale x — a real day-gap, not an
// event-index slot — and its height encodes the event's own delta
// magnitude. Only labels that survive resolveLabelCollisions are drawn;
// every bar stays independently pressable and accessible regardless.
// ============================================================================
const PLOT_HEIGHT: Record<'tabletLg' | 'desktop', number> = { tabletLg: 92, desktop: 104 }
// Each label is a real, measured 100px-wide box (delta/cause/balance text,
// `width: 100` below), centered close to its own bar — so two labels
// genuinely start visually overlapping once their bars sit closer than
// ~100px apart, not some smaller "feels about right" number. 108 leaves a
// small breathing gap rather than cutting it exactly at the collision
// boundary. Desktop production visual review caught the earlier 78px value
// as a real bug: it let the algorithm approve pairs that still overlapped
// on screen, because the slot width didn't match the label's actual
// rendered footprint. Wider slot on tablet than desktop is deliberate on
// top of that — CP8B's own "1024 is intentionally composed, not full
// desktop density" requirement, expressed as the one number that actually
// controls how many labels fit.
const LABEL_SLOT_PX: Record<'tabletLg' | 'desktop', number> = { tabletLg: 140, desktop: 108 }
const PAD_TOP = 46
const BAR_WIDTH = 18
const BASELINE_WIDTH = 26

function MoneyJourneyChart({
  forecast,
  steps,
  variant,
  pinnedId,
  pinned,
  onToggle,
}: {
  forecast: CashFlowForecastResult
  steps: MoneyJourneyStep[]
  variant: 'tabletLg' | 'desktop'
  pinnedId: string | null
  pinned: MoneyJourneyStep | null
  onToggle: (id: string) => void
}) {
  const { t } = useTranslation()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const [width, setWidth] = useState<number | null>(null)

  function handleLayout(e: LayoutChangeEvent) {
    const next = Math.round(e.nativeEvent.layout.width)
    setWidth((prev) => (prev === next ? prev : next))
  }

  const plotH = PLOT_HEIGHT[variant]
  const svgH = plotH + PAD_TOP + 36
  const containerW = width ?? (variant === 'tabletLg' ? 900 : 1080)

  // A small side margin, the same reason FinancialTimelineChart.tsx's own
  // chart has one: the first/last step's own label extends past its bar on
  // both sides, and a bar placed flush against the container edge would
  // clip it. Date-proportional spacing itself is computed inside that
  // margin, over the FULL dailyPoints series — the CP8B audit's own
  // prescribed fix — so a step's bar sits at its true elapsed-days
  // position, never an evenly-spaced event-index slot.
  const marginPx = containerW * 0.04
  const plotW = containerW - marginPx * 2
  const scale = buildDailyPointScale(forecast.dailyPoints, plotW)
  const { minBalance, range, showZeroReference } = computeBalanceAxisRange(forecast.dailyPoints.map((p) => p.balanceAgorot))
  const toY = (balance: number) => PAD_TOP + (1 - (balance - minBalance) / range) * plotH
  const zeroY = toY(0)

  // Two coordinate conventions, deliberately kept distinct rather than
  // reused across both: `svgX` is the raw SVG coordinate `dailyPointScale`
  // already returns (index 0/today at the HIGH end, decreasing leftward —
  // the same physical-mirror convention ForecastChart.tsx's own SVG uses,
  // since SVG has no `dir`). `rightFor` is the CSS `right:` offset every
  // absolutely-positioned label/bar View below needs instead — the
  // OPPOSITE sense (today's offset-from-the-right must be SMALL, not
  // large) — computed as the exact inverse of `svgX`
  // (`containerW - marginPx - svgX(index)`), not re-derived by hand.
  // Conflating these two was a real bug caught in this checkpoint's own
  // visual review: reusing `svgX` directly as a `right:` offset mirrored
  // every bar and label to the wrong side of the chart.
  const svgX = (index: number) => marginPx + scale.xForIndex(index)
  const rightFor = (index: number) => containerW - svgX(index)

  // The baseline/today marker's own label always wins the slot nearest the
  // chart's start edge — it is the one fixed anchor every other position on
  // the chart is measured from, never a candidate to hide. A step whose
  // real date lands on (or overdue-clamps to) day 0 — a same-day cluster of
  // otherwise-overdue events is the common real case — sits at nearly the
  // same x as the baseline and would otherwise crowd its label; excluding
  // such a step from the label-collision candidate pool entirely (rather
  // than letting it compete for the slot) guarantees the baseline is never
  // the one that loses. The step's own bar/node is completely unaffected —
  // only whether ITS label is drawn.
  const baselineX = svgX(0)
  const labelCandidates = steps
    .filter((step) => Math.abs(svgX(step.index) - baselineX) >= LABEL_SLOT_PX[variant])
    .map((step) => ({ id: step.id, x: svgX(step.index), priority: step.priority }))
  const shownLabels = resolveLabelCollisions(labelCandidates, LABEL_SLOT_PX[variant])

  const baselineY = toY(forecast.startingBalanceAgorot)

  const polylinePoints = [
    `${svgX(0)},${baselineY}`,
    ...steps.map((step) => `${svgX(step.index)},${toY(step.afterBalanceAgorot)}`),
  ].join(' ')

  return (
    <View>
      <View onLayout={handleLayout} style={{ position: 'relative', height: svgH }}>
        <Svg width="100%" height={svgH} style={{ position: 'absolute', top: 0, right: 0 }}>
          {showZeroReference && (
            <Polyline
              points={`0,${zeroY} ${containerW},${zeroY}`}
              stroke={isDark ? colors.border.dark : colors.border.light}
              strokeWidth={1}
            />
          )}
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={isDark ? colors.inkMuted.dark : colors.inkMuted.light}
            strokeWidth={1.75}
            strokeDasharray="2 4"
            strokeLinecap="round"
            opacity={0.6}
          />
          {/* The low point's halo, drawn once on the shared SVG layer so it
              sits below every bar's own pressable overlay. */}
          {steps
            .filter((s) => s.isLow)
            .map((s) => (
              <Circle
                key={`halo-${s.id}`}
                cx={svgX(s.index)}
                cy={toY(s.afterBalanceAgorot)}
                r={11}
                // RRR §16 P0-5: this halo renders on the hero surface,
                // which does not invert with `isDark` (constants/colors.ts's
                // own header comment) — danger.light fails contrast here in
                // BOTH app themes (2.68:1/2.29:1), so the fill is now the
                // hero-safe `.dark` variant unconditionally, not gated on
                // the app's own color scheme.
                fill={colors.danger.dark}
                fillOpacity={0.18}
              />
            ))}
        </Svg>

        {/* Baseline / today marker. */}
        <View style={{ position: 'absolute', top: 0, bottom: 0, right: rightFor(0) - BASELINE_WIDTH / 2 }}>
          <View
            className="bg-heroInk-light"
            style={{ position: 'absolute', top: baselineY, height: toY(minBalance) - baselineY, width: BASELINE_WIDTH, borderRadius: 5 }}
          />
          <Text
            className="text-caption font-heeboBold text-heroInk-light"
            style={{ position: 'absolute', top: baselineY - 18, width: 92, right: -33, textAlign: 'center', fontVariant: ['tabular-nums'] }}
          >
            {formatILS(forecast.startingBalanceAgorot)}
          </Text>
          <Text
            className="text-meta font-sans text-heroInkMuted-light"
            style={{ position: 'absolute', top: plotH + PAD_TOP + 8, width: 66, right: -19, textAlign: 'center' }}
          >
            {t('home.timeline.today')}
          </Text>
        </View>

        {steps.map((step) => {
          const stepRight = rightFor(step.index)
          const before = toY(step.beforeBalanceAgorot)
          const after = toY(step.afterBalanceAgorot)
          const top = Math.min(before, after)
          const barH = Math.max(2, Math.abs(after - before))
          const up = step.deltaAgorot >= 0
          const showLabel = shownLabels.has(step.id)
          const isPinned = pinnedId === step.id

          // RRR §16 P0-5: same hero-surface-doesn't-invert fix as the halo
          // above — danger/warning/positive always resolve to their `.dark`
          // variant here regardless of `isDark`, since that's the variant
          // proven to pass against the hero background in both app themes.
          // heroAccent is untouched: colors.heroAccent.light ===
          // colors.heroAccent.dark already (constants/colors.ts), so its
          // ternary was never a bug.
          const barColor = step.isLow
            ? colors.danger.dark
            : up
              ? colors.positive.dark
              : step.severe
                ? colors.warning.dark
                : isDark
                  ? colors.heroAccent.dark
                  : colors.heroAccent.light

          return (
            <Pressable
              key={step.id}
              onPress={() => onToggle(step.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: isPinned }}
              // RRR §16 P0-4: see the block above's identical note —
              // this is the same pin/unpin toggle, aria-pressed is correct.
              aria-pressed={isPinned}
              accessibilityLabel={accessibleStepLabel(t, step)}
              style={{ position: 'absolute', top: 0, bottom: 0, right: stepRight - BAR_WIDTH / 2, width: BAR_WIDTH }}
            >
              <View
                style={{
                  position: 'absolute',
                  top,
                  height: barH,
                  width: BAR_WIDTH,
                  borderRadius: 5,
                  backgroundColor: barColor,
                  ...(pinnedId && !isPinned ? { opacity: 0.3 } : null),
                  ...(step.isConclusion ? { borderWidth: 2, borderColor: isDark ? colors.heroAccent.dark : colors.heroAccent.light } : null),
                }}
              />
              {/* Tied to the same collision decision as the printed label —
                  a count badge floating beside a suppressed label reads as
                  an orphaned annotation, and at true stress density two
                  adjacent suppressed badges could themselves overlap. */}
              {step.clusterCount > 1 && showLabel && (
                <View
                  className="items-center justify-center rounded-full bg-danger-dark"
                  style={{ position: 'absolute', top: top - 9, right: -3, width: 14, height: 14 }}
                >
                  <Text className="text-[9px] font-heeboBold text-white">{step.clusterCount}</Text>
                </View>
              )}
              {showLabel ? (
                <>
                  <Text
                    className={`text-meta font-heeboBold ${step.isLow ? 'text-danger-dark' : up ? 'text-positive-dark' : step.severe ? 'text-warning-dark' : 'text-heroAccent-light'}`}
                    style={{ position: 'absolute', top: top - 16, width: 100, right: -39, textAlign: 'center', fontVariant: ['tabular-nums'] }}
                  >
                    {up ? '+' : '−'}
                    {formatILS(step.deltaAgorot)}
                  </Text>
                  <Text
                    className={`text-meta font-sans ${step.isLow ? 'text-danger-dark' : 'text-heroInkMuted-light'}`}
                    numberOfLines={1}
                    // CP8C fix: react-native-web's `numberOfLines` handling
                    // adds its own `maxWidth: '100%'` for the ellipsis to
                    // work — for an absolutely-positioned Text, that
                    // percentage resolves against the nearest positioned
                    // ancestor, which here is this bar's own 18px-wide
                    // Pressable (BAR_WIDTH), not this label's real 100px
                    // box. The label silently clipped to ~18px, rendering
                    // real cause text ("ביטוח רכב", "3 חיובים") as a single
                    // truncated character. An explicit pixel `maxWidth`
                    // matching this label's own `width` (unchanged from
                    // before — the value resolveLabelCollisions' own
                    // LABEL_SLOT_PX already assumes) overrides that stray
                    // percentage without touching any collision dimension.
                    style={{ position: 'absolute', top: top + barH + 4, width: 100, maxWidth: 100, right: -39, textAlign: 'center' }}
                  >
                    {step.cause}
                    {step.isLow ? ` · ${t('home.timeline.lowSuffix')}` : ''}
                  </Text>
                  <Text
                    className="text-meta font-heeboBold text-heroInk-light"
                    style={{ position: 'absolute', top: Math.max(0, top - 33), width: 100, right: -39, textAlign: 'center', fontVariant: ['tabular-nums'] }}
                  >
                    {formatILS(step.afterBalanceAgorot)}
                  </Text>
                  <View style={{ position: 'absolute', top: plotH + PAD_TOP + 10, width: 80, right: -29, alignItems: 'center' }}>
                    <Text className="text-meta font-sans text-heroInkMuted-light" numberOfLines={1}>
                      {t('home.timeline.date', { day: formatDayOfMonth(step.date), month: shortMonth(step.date) })}
                    </Text>
                    {step.isConclusion && <Text className="text-[9px] font-heeboBold text-heroAccent-light">{t('home.timeline.conclusionFlag')}</Text>}
                  </View>
                </>
              ) : null}
              {/* No fallback "just the balance" label when the printed
                  label is suppressed — a smaller label here would still be
                  a real label resolveLabelCollisions never evaluated, and
                  production visual review caught exactly that: two
                  collision-suppressed neighbors' own "just the balance"
                  text still overlapped each other. Suppressed means no
                  printed text at all; the bar and its full accessibility
                  label are unaffected. */}
            </Pressable>
          )
        })}
      </View>
      {pinned && <CausalDetail step={pinned} />}
    </View>
  )
}
