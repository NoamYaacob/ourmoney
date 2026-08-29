// Temporary, review-only screen — the design-lock harness for the Direction D
// Financial Timeline prototype (features/cashflow/components/FinancialTimeline.tsx).
// Not linked from any nav; reachable only by navigating directly to
// /diagnostics/timeline-lab, same convention as diagnostics/index.tsx.
//
// Every scenario below calls the REAL calculateCashFlowForecast with real
// engine input shapes — this screen constructs the forecast INPUT (accounts/
// obligations/recurring/installments), never the forecast OUTPUT, so the
// component under review is always looking at genuine engine arithmetic,
// including for the synthetic edge cases (zero events, one event, negative
// balance, long labels, large currency) — none of those are hand-built
// CashFlowForecastResult objects.
//
// Remove this file, its Tabs.Screen registration, and
// features/cashflow/components/FinancialTimeline.tsx's own "isolated
// prototype" framing once the architecture-reviewer decision is made and
// (if approved) the real component has a real home on a real screen.

import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { Screen } from '@/components/ui/Screen'
import { FinancialTimeline } from '@/features/cashflow/components/FinancialTimeline'
import { calculateCashFlowForecast, type CashFlowForecastInput } from '@/lib/engines/cashflow/calculateCashFlowForecast'

const TODAY = '2026-08-20'
const HORIZON_END = '2026-09-19'
const LONG_HORIZON_END = '2026-10-19'

// Mode-1 fixture (household "משפחת לוי") — real amounts/dates from
// dev/designQaClient.ts, simulated today per the Home Design Lock's own
// derivation.
const mode1: CashFlowForecastInput = {
  startingBalanceAgorot: 1_310_050,
  startDate: TODAY,
  endDate: HORIZON_END,
  obligations: [
    { id: 'ob-1', name: 'ארנונה דו־חודשית', amountAgorot: 122_400, dueDate: '2026-08-28', status: 'upcoming', categoryId: null, accountId: null },
    { id: 'ob-2', name: 'טסט ואגרת רכב', amountAgorot: 118_000, dueDate: '2026-09-04', status: 'upcoming', categoryId: null, accountId: null },
  ],
  recurringTemplates: [
    { id: 'rc-1', description: 'משכנתא לאומי', amountAgorot: -624_000, frequency: 'monthly', dayOfMonth: 10, nextDueDate: '2026-09-10', isActive: true, categoryId: null, accountId: null },
    { id: 'rc-3', description: 'חדר כושר', amountAgorot: -19_900, frequency: 'monthly', dayOfMonth: 15, nextDueDate: '2026-09-15', isActive: true, categoryId: null, accountId: null },
    { id: 'rc-4', description: 'ביטוח רכב', amountAgorot: -38_000, frequency: 'monthly', dayOfMonth: 20, nextDueDate: '2026-08-20', isActive: true, categoryId: null, accountId: null },
  ],
  installmentPlans: [
    { id: 'ip-sofa', description: 'ספה, מחסני רהיטים', totalAgorot: 718_800, installmentCount: 12, monthlyAgorot: 59_900, firstChargeDate: '2026-04-10', materializedCount: 4, categoryId: null, accountId: null },
    { id: 'ip-fridge', description: 'מקרר, א.ל.מ חשמל', totalAgorot: 480_000, installmentCount: 12, monthlyAgorot: 40_000, firstChargeDate: '2025-12-10', materializedCount: 8, categoryId: null, accountId: null },
  ],
}

// Stress fixture (household "משפחת כהן־לוי") — real amounts/dates from
// dev/designQaStressClient.ts, same simulated today. Two credit cards' worth
// of instalments, more recurring templates, one large annual-scale
// obligation ("חופשה משפחתית") outside this 30-day window (excluded, as the
// real engine would).
const stress: CashFlowForecastInput = {
  startingBalanceAgorot: 1_698_550,
  startDate: TODAY,
  endDate: HORIZON_END,
  obligations: [
    { id: 'ob-1', name: 'ארנונה דו־חודשית', amountAgorot: 122_400, dueDate: '2026-08-28', status: 'upcoming', categoryId: null, accountId: null },
    { id: 'ob-2', name: 'אגרת רכב', amountAgorot: 118_000, dueDate: '2026-09-04', status: 'upcoming', categoryId: null, accountId: null },
    { id: 'ob-3', name: 'ביטוח בריאות שנתי', amountAgorot: 106_600, dueDate: '2026-09-12', status: 'upcoming', categoryId: null, accountId: null },
    { id: 'ob-4', name: 'חופשה משפחתית', amountAgorot: 850_000, dueDate: '2026-10-15', status: 'upcoming', categoryId: null, accountId: null },
  ],
  recurringTemplates: [
    { id: 'rc-1', description: 'משכנתא לאומי', amountAgorot: -624_000, frequency: 'monthly', dayOfMonth: 10, nextDueDate: '2026-09-10', isActive: true, categoryId: null, accountId: null },
    { id: 'rc-2', description: 'גן ילדים עדן', amountAgorot: -215_000, frequency: 'monthly', dayOfMonth: 1, nextDueDate: '2026-09-01', isActive: true, categoryId: null, accountId: null },
    { id: 'rc-3', description: 'חדר כושר', amountAgorot: -19_900, frequency: 'monthly', dayOfMonth: 15, nextDueDate: '2026-09-15', isActive: true, categoryId: null, accountId: null },
    { id: 'rc-4', description: 'ביטוח רכב', amountAgorot: -38_000, frequency: 'monthly', dayOfMonth: 20, nextDueDate: '2026-08-20', isActive: true, categoryId: null, accountId: null },
    { id: 'rc-5', description: 'נטפליקס', amountAgorot: -5_490, frequency: 'monthly', dayOfMonth: 3, nextDueDate: '2026-09-03', isActive: true, categoryId: null, accountId: null },
    { id: 'rc-6', description: 'ספוטיפיי משפחתי', amountAgorot: -3_990, frequency: 'monthly', dayOfMonth: 7, nextDueDate: '2026-09-07', isActive: true, categoryId: null, accountId: null },
    { id: 'rc-7', description: 'שכר לימוד חוג ילדים', amountAgorot: -32_000, frequency: 'monthly', dayOfMonth: 5, nextDueDate: '2026-09-05', isActive: true, categoryId: null, accountId: null },
  ],
  installmentPlans: [
    { id: 'ip-sofa', description: 'ספה, מחסני רהיטים', totalAgorot: 718_800, installmentCount: 12, monthlyAgorot: 59_900, firstChargeDate: '2026-04-10', materializedCount: 4, categoryId: null, accountId: null },
    { id: 'ip-fridge', description: 'מקרר, א.ל.מ חשמל', totalAgorot: 480_000, installmentCount: 12, monthlyAgorot: 40_000, firstChargeDate: '2025-12-10', materializedCount: 8, categoryId: null, accountId: null },
    { id: 'ip-laptop', description: 'מחשב נייד, KSP', totalAgorot: 480_000, installmentCount: 10, monthlyAgorot: 48_000, firstChargeDate: '2026-06-05', materializedCount: 2, categoryId: null, accountId: null },
    { id: 'ip-tv', description: 'טלוויזיה, איירפורט סיטי', totalAgorot: 360_000, installmentCount: 6, monthlyAgorot: 60_000, firstChargeDate: '2026-07-20', materializedCount: 1, categoryId: null, accountId: null },
  ],
}

const zeroEvents: CashFlowForecastInput = {
  startingBalanceAgorot: 1_100_000,
  startDate: TODAY,
  endDate: HORIZON_END,
  obligations: [],
  recurringTemplates: [],
  installmentPlans: [],
}

const oneEvent: CashFlowForecastInput = {
  startingBalanceAgorot: 900_000,
  startDate: TODAY,
  endDate: HORIZON_END,
  obligations: [{ id: 'ob-solo', name: 'ביטוח דירה שנתי', amountAgorot: 84_000, dueDate: '2026-09-02', status: 'upcoming', categoryId: null, accountId: null }],
  recurringTemplates: [],
  installmentPlans: [],
}

const negativeBalance: CashFlowForecastInput = {
  startingBalanceAgorot: 250_000,
  startDate: TODAY,
  endDate: HORIZON_END,
  obligations: [{ id: 'ob-big', name: 'מס רכוש שנתי', amountAgorot: 320_000, dueDate: '2026-08-25', status: 'upcoming', categoryId: null, accountId: null }],
  recurringTemplates: [
    { id: 'rc-rent', description: 'שכר דירה', amountAgorot: -520_000, frequency: 'monthly', dayOfMonth: 1, nextDueDate: '2026-09-01', isActive: true, categoryId: null, accountId: null },
  ],
  installmentPlans: [],
}

const longLabels: CashFlowForecastInput = {
  startingBalanceAgorot: 1_500_000,
  startDate: TODAY,
  endDate: HORIZON_END,
  obligations: [
    {
      id: 'ob-long',
      name: 'תשלום עבור חידוש פוליסת ביטוח בריאות משפחתית מקיפה כולל כיסוי נסיעות לחו״ל לכל בני המשפחה',
      amountAgorot: 106_600,
      dueDate: '2026-08-28',
      status: 'upcoming',
      categoryId: null,
      accountId: null,
    },
  ],
  recurringTemplates: [
    {
      id: 'rc-long',
      description: 'מנוי חודשי לחדר כושר ובריכה כולל שיעורי פילאטיס וייעוץ תזונה אישי',
      amountAgorot: -29_900,
      frequency: 'monthly',
      dayOfMonth: 15,
      nextDueDate: '2026-09-15',
      isActive: true,
      categoryId: null,
      accountId: null,
    },
  ],
  installmentPlans: [],
}

const largeCurrency: CashFlowForecastInput = {
  startingBalanceAgorot: 18_600_000,
  startDate: TODAY,
  endDate: LONG_HORIZON_END,
  obligations: [{ id: 'ob-large', name: 'מקדמה לרכישת דירה', amountAgorot: 4_500_000, dueDate: '2026-09-20', status: 'upcoming', categoryId: null, accountId: null }],
  recurringTemplates: [
    { id: 'rc-large', description: 'העברה לתיק השקעות', amountAgorot: -1_200_000, frequency: 'monthly', dayOfMonth: 1, nextDueDate: '2026-09-01', isActive: true, categoryId: null, accountId: null },
  ],
  installmentPlans: [],
}

const SCENARIOS = [
  { key: 'mode1', label: 'Mode 1 — משפחת לוי', input: mode1 },
  { key: 'stress', label: 'Stress — משפחת כהן־לוי', input: stress },
  { key: 'zero', label: 'Zero future events', input: zeroEvents },
  { key: 'one', label: 'Only one future event', input: oneEvent },
  { key: 'negative', label: 'Negative projected balance', input: negativeBalance },
  { key: 'long', label: 'Very long Hebrew labels', input: longLabels },
  { key: 'large', label: 'Large currency values', input: largeCurrency },
] as const

export default function TimelineLab() {
  const { colorScheme, setColorScheme } = useColorScheme()
  const [scenarioKey, setScenarioKey] = useState<(typeof SCENARIOS)[number]['key']>('stress')
  const scenario = SCENARIOS.find((s) => s.key === scenarioKey) ?? SCENARIOS[0]
  const forecast = calculateCashFlowForecast(scenario.input)

  return (
    <Screen scroll>
      <Text style={{ fontFamily: 'Heebo_700Bold', fontSize: 16, marginBottom: 4 }}>
        Financial Timeline — Design Lock lab (not production)
      </Text>
      <Text style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>
        Simulated today: {TODAY}. Every scenario calls calculateCashFlowForecast for real.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SCENARIOS.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setScenarioKey(s.key)}
              testID={`scenario-${s.key}`}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: s.key === scenarioKey ? '#1c1b18' : '#e4e1d9',
              }}
            >
              <Text style={{ color: s.key === scenarioKey ? '#fff' : '#191a17', fontSize: 12, fontWeight: '600' }}>
                {s.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            testID="toggle-theme"
            onPress={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
            style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#0f6b5c' }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Theme: {colorScheme}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View className="rounded-hero bg-hero-light p-1" testID="timeline-lab-panel">
        <FinancialTimeline
          key={scenarioKey}
          forecast={forecast}
          onEventPress={(e) => console.log('[timeline-lab] event pressed', e.id)}
          onViewFullForecast={() => console.log('[timeline-lab] view full forecast')}
          testID="financial-timeline-under-test"
        />
      </View>

      <Text style={{ color: '#888', fontSize: 11, marginTop: 16 }}>
        Reduce-motion device setting affects the entrance animation. RTL: today should sit at the physical right edge.
      </Text>
    </Screen>
  )
}
