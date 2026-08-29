// Reached from Settings, not a tab (docs/ARCHITECTURE.md).
//
// Design Phase 3: visual language aligned with Dashboard/Add Transaction —
// account-type icon per row (accountIcon.ts, Phase 2), Select's 'row'
// variant + polished sheet for the type picker, Ionicon empty state. Every
// hook call and mutation payload below is unchanged from Phase 1.
//
// Checkpoint 5 (Cash Flow + Budget + Accounts): no JS width switch exists
// here (unlike Home/Transactions/Cash Flow) — this has always been one
// unconditional tree, purely CSS-responsive, so there is no "mount
// threshold" to move. Two independent tablet changes, per design-review/
// SYSTEM.md §2's own table for this screen specifically:
//   - `web:tablet:` (768px) — the 3 account groups (liquid/owed/illiquid)
//     wrap 2-up instead of stacking full width. This tier was in SYSTEM.md's
//     plan from Checkpoint 2 but never actually built; it is now.
//   - `web:tabletLg:` (1024px) — the hero's owed/illiquid stat reveal
//     (previously `web:desktop:`-only) moves a tier earlier, since 834px
//     genuinely doesn't have room for it (SYSTEM.md §2's own 834 vs 1024
///    distinction) but 1024px does.
// `Screen width="wide"` -> `"richSingle"` (900 tablet / 960 desktop) per
// SYSTEM.md §5 "Accounts — Shape B... ~900-960px", no rail (§6: the one
// candidate second column, the liquid/owed/illiquid split, already lives in
// the hero — a rail would duplicate it, not add to it).

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { useCreateAccount } from '@/features/accounts/hooks/useCreateAccount'
import { accountIconName } from '@/features/accounts/lib/accountIcon'
import { sumEligibleCashAgorot } from '@/lib/engines/cashflow/eligibleCashAccounts'
import { formatILS } from '@/lib/money/format'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { RowIcon } from '@/components/ui/ListCard'
import { Money } from '@/components/ui/Money'
import { StatusChip } from '@/components/ui/StatusChip'
import { INLINE_FORM_WIDTH_CLASS } from '@/constants/layout'
import type { Account, AccountType } from '@/types/app'

const ACCOUNT_TYPE_OPTIONS: AccountType[] = [
  'checking',
  'savings',
  'credit_card',
  'cash',
  'investment',
  'loan',
  'mortgage',
  'other',
]

export default function Accounts() {
  const { t } = useTranslation()
  const router = useRouter()
  const { add: addTypeParam } = useLocalSearchParams<{ add?: string }>()
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.ink.dark : colors.ink.light
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts, isLoading: isAccountsLoading, error, hasData, refetch } = useAccounts(householdId)
  const { balances, isLoading: isBalancesLoading } = useAccountBalances(householdId)
  // Folds in isHouseholdLoading (mobile-expo-reviewer finding — see
  // dashboard/index.tsx's identical comment for why this matters).
  const isLoading = isHouseholdLoading || isAccountsLoading
  const createAccount = useCreateAccount(householdId)

  // Arriving from another screen's "add the prerequisite account" empty
  // state (currently only Credit & Payments — installments/index.tsx) with
  // `?add=credit_card`: open the form pre-set to that type instead of
  // landing on a bare list the household then has to find the button on
  // themselves. Only ACCOUNT_TYPE_OPTIONS values are honored — anything
  // else falls back to the ordinary default rather than silently opening
  // the form with a type the picker doesn't offer. Read once via a lazy
  // initializer, not an effect: the param describes how this screen was
  // opened, not ongoing state to keep resyncing against, and a plain
  // useState(false) followed by a setState-in-effect would cost an extra
  // render on every mount just to reach the same first-paint value.
  const requestedType =
    addTypeParam && ACCOUNT_TYPE_OPTIONS.includes(addTypeParam as AccountType) ? (addTypeParam as AccountType) : null

  const [isAdding, setIsAdding] = useState(() => requestedType !== null)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>(() => requestedType ?? 'cash')
  const [billingCycleDayText, setBillingCycleDayText] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  // Product-quality pass (section 8): the hero's own explainer used to be a
  // second, full-width bordered card sitting below the whole account list —
  // read as documentation embedded inside the product, not part of the
  // hero it was explaining. Collapsed into the hero itself, closed by
  // default, same chevron-toggle interaction safe-to-spend/index.tsx's own
  // excluded-groups disclosure already uses.
  const [isExplainerOpen, setIsExplainerOpen] = useState(false)

  function resetForm() {
    setName('')
    setType('cash')
    setBillingCycleDayText('')
    setIsAdding(false)
  }

  function handleCreate() {
    if (!householdId || !name.trim() || createAccount.isPending) return
    setCreateError(null)

    let billingCycleDay: number | null = null
    if (type === 'credit_card' && billingCycleDayText.trim()) {
      // Plain digits only — rejects "1e1"/"0x1"/whitespace-padded forms
      // Number(...) alone would silently accept, the same discipline
      // agorotFromILS's own stricter regex already applies to money.
      const trimmed = billingCycleDayText.trim()
      const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 28) {
        setCreateError(t('accounts.form.errors.invalidBillingCycleDay'))
        return
      }
      billingCycleDay = parsed
    }

    createAccount.mutate({ householdId, name: name.trim(), type, billingCycleDay }, { onSuccess: resetForm })
  }

  // Visual QA + Desktop Polish pass: desktop-only total-balance summary —
  // Accounts previously had no top-level figure at all, reading as "just a
  // sparse list." Sums every ACTIVE account's already-computed live balance
  // (the same `balances` map every row below already reads from) — no new
  // data, no invented figure, and archived accounts are excluded the same
  // way they already are from every other financial total in this app.
  // Desktop-only (`hidden web:desktop:flex`): mobile's layout is untouched.
  const activeAccountBalances = accounts.filter((a) => a.is_active).map((a) => balances[a.id] ?? 0)
  const totalBalanceAgorot = activeAccountBalances.reduce((sum, agorot) => sum + agorot, 0)
  // Desktop Claude Design pass: the mockup's own "זמין להוצאה X · שווי נטו
  // Y" pairing on this card — the exact same isEligibleCashAccount
  // boundary Safe-to-Spend's own "available cash" already uses, not a
  // second liquidity rule invented for this screen.
  const availableCashAgorot = sumEligibleCashAgorot(accounts, balances)

  // Both design files group accounts three ways — liquid (what counts
  // toward Safe-to-Spend), owed (credit cards, which come off the current
  // account at the next billing date), and everything not spendable today.
  // `OurMoney - Mobile.dc.html` screen 11 and the desktop Accounts frame use
  // the same three headings in the same order, so the grouping is shared
  // rather than a desktop-only arrangement over a flat phone list.
  //
  // Liquidity is `isEligibleCashAccount`'s own rule, not a second one
  // invented here — the "כסף נוזלי" heading claims these accounts are what
  // "פנוי באמת" is made of, and that claim has to stay literally true.
  const liquidAccounts = accounts.filter((a) => a.type === 'checking' || a.type === 'cash')
  const owedAccounts = accounts.filter((a) => a.type === 'credit_card')
  const illiquidAccounts = accounts.filter((a) => a.type !== 'checking' && a.type !== 'cash' && a.type !== 'credit_card')

  // The hero's own supplementary stats (section 8): showing the liquid
  // total again beside a headline that already IS the liquid total would be
  // a redundant number filling space, not real information. What actually
  // completes the picture is the two groups that headline deliberately
  // excludes — real balances from the same `balances` map every row already
  // reads from, not a second figure invented for the hero.
  const owedTotalAgorot = owedAccounts.reduce((sum, a) => sum + (balances[a.id] ?? 0), 0)
  const illiquidTotalAgorot = illiquidAccounts.reduce((sum, a) => sum + (balances[a.id] ?? 0), 0)

  // One row for both platforms, one card per GROUP with hairlines between
  // rows — which is what both frames draw. It had been a bordered card per
  // account, so a household with six accounts read as six unrelated objects
  // instead of three groups.
  function renderAccountRow(account: Account, isLast: boolean) {
    const isOwed = account.type === 'credit_card'
    const balanceAgorot = balances[account.id] ?? 0

    return (
      <View key={account.id}>
        <Pressable
          onPress={() => router.push(`/accounts/${account.id}`)}
          accessibilityRole="button"
          accessibilityLabel={account.name}
          className="min-h-[44px] flex-row items-center gap-3 rounded-control py-3.5 web:desktop:-mx-2 web:desktop:px-2 web:hover:bg-surface-light/60 dark:web:hover:bg-surface-dark/40"
        >
          <RowIcon tone={isOwed ? 'danger' : 'neutral'}>
            <Ionicons
              name={accountIconName(account.type)}
              size={ICON.row}
              color={isOwed ? (scheme === 'dark' ? colors.dangerStrong.dark : colors.dangerStrong.light) : iconColor}
            />
          </RowIcon>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
                {account.name}
              </Text>
              {!account.is_active && <StatusChip label={t('accounts.detail.archived')} />}
            </View>
            <View className="mt-0.5 flex-row flex-wrap items-center gap-1.5">
              <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {t(`accounts.types.${account.type}`)}
              </Text>
              {/* The design's connection pill. Every account in the product
                  today is entered by hand — the Open Banking integration
                  does not exist yet — so this states that rather than
                  implying a sync that isn't happening. */}
              <StatusChip label={t('accounts.manuallyManaged')} dot />
            </View>
          </View>
          {/* account.balance_agorot is a dead column nothing ever updates —
              the balance shown here is computed live from transactions
              instead (features/accounts/lib/computeAccountBalances.ts).
              Blank while it loads rather than flashing ₪0 as if that were a
              real computed answer. */}
          {isBalancesLoading ? (
            <View className="h-5 w-24" />
          ) : (
            <Money agorot={balanceAgorot} size="row" tone={isOwed ? 'danger' : 'default'} />
          )}
          <Ionicons name="chevron-back" size={ICON.row} color={iconColor} />
        </Pressable>
        {!isLast && <View className="h-px bg-divider-light dark:bg-divider-dark" />}
      </View>
    )
  }

  // Checkpoint 5: `web:tablet:w-[calc(50%-8px)]` wraps the 3 groups 2-up
  // from 768px — SYSTEM.md §2's own table calls this out for Accounts
  // specifically ("2-up group grid"), planned in Checkpoint 2 but never
  // actually built until now. Below `tablet` unchanged (`mt-4`, full width,
  // stacked). The row-level gap (on the wrapper below) replaces this
  // per-group `mt-4` from `tablet` up; `web:tablet:mt-0` turns it off here
  // so groups on the same row don't also carry their own top margin.
  function renderGroup(
    group: Account[],
    labelKey: string,
    labelClass: string,
    cardClass: string,
    fullWidth: boolean
  ) {
    if (group.length === 0) return null
    return (
      <View
        className={`mt-4 w-full web:tablet:mt-0 ${fullWidth ? '' : 'web:tablet:w-[calc(50%-8px)]'}`}
      >
        <Text className={`mb-2 text-meta font-sansSemibold tracking-[0.06em] ${labelClass}`}>{t(labelKey)}</Text>
        <View className={`overflow-hidden rounded-card border px-4 ${cardClass}`}>
          {group.map((account, index) => renderAccountRow(account, index === group.length - 1))}
        </View>
      </View>
    )
  }

  // The 3 possible groups, in the same fixed display order as before, but
  // as data rather than 3 separate renderGroup() call sites — so the 2-up
  // grid below can see how many groups actually ended up visible and give
  // the odd one out (whenever that count is 1 or 3, both real cases) full
  // width instead of stranding it at half.
  const accountGroups = [
    {
      accounts: liquidAccounts,
      labelKey: 'accounts.groups.liquid',
      labelClass: 'text-positiveStrong-light dark:text-positiveStrong-dark',
      cardClass: 'border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark',
    },
    {
      accounts: owedAccounts,
      labelKey: 'accounts.groups.owed',
      // The credit group carries a tinted border in both frames: what is
      // owed is not the same kind of thing as what is held.
      labelClass: 'text-dangerStrong-light dark:text-dangerStrong-dark',
      cardClass: 'border-dangerBorder-light bg-surfaceMuted-light dark:border-dangerBorder-dark dark:bg-surfaceMuted-dark',
    },
    {
      accounts: illiquidAccounts,
      labelKey: 'accounts.groups.illiquid',
      labelClass: 'text-inkMuted-light dark:text-inkMuted-dark',
      // Recessed rather than white: not money to plan against today.
      cardClass: 'border-border-light bg-surface-light dark:border-border-dark dark:bg-surface-dark',
    },
  ].filter((group) => group.accounts.length > 0)

  return (
    <Screen onBack={() => router.back()} width="richSingle" scroll>
      <Text className="mb-4 text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('accounts.title')}
      </Text>

      {!isLoading && hasData && accounts.length > 0 && (
        // The hero both frames open with: what is actually spendable, and
        // the one sentence that stops a household reading it as "all our
        // money". Net worth sits under it as context, never as the headline
        // — the whole point of the grouping below is that those are
        // different numbers.
        <View className="rounded-card border border-border-light bg-surfaceMuted-light p-5 dark:border-border-dark dark:bg-surfaceMuted-dark">
          {/* Checkpoint 5: this row layout now activates at the same
              `web:tabletLg:` threshold as the stat block it wraps (below),
              not `web:desktop:` — the two were previously mismatched, so
              from 1024-1199 the stat block appeared but stacked under the
              headline instead of beside it, leaving its own `border-s`
              (meant to separate two side-by-side blocks) rendering against
              nothing, flush against the card's own edge. */}
          <View className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:justify-between web:tabletLg:gap-8">
            <View className="web:tabletLg:flex-1">
              <Text className="text-meta font-sansSemibold tracking-[0.06em] text-positiveStrong-light dark:text-positiveStrong-dark">
                {t('accounts.availableToSpend')}
              </Text>
              {isBalancesLoading ? <View className="h-11" /> : <Money agorot={availableCashAgorot} size="display" />}
              <Text className="mt-0.5 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {t('accounts.availableExplainer')}
              </Text>
            </View>

            {/* Desktop only: what the headline deliberately leaves out, as
                real figures rather than only a caption sentence trying to
                make the same point in prose — this is also what used to
                leave the hero's own end side almost entirely empty on a
                wide desktop canvas. Each stat only renders if that group
                actually has an account, so a household with no credit
                cards doesn't get a meaningless "₪0 owed" stat. */}
            {!isBalancesLoading && (owedAccounts.length > 0 || illiquidAccounts.length > 0) && (
              // Checkpoint 5: reveals from `tabletLg` (1024) now, not
              // `desktop` (1200) — SYSTEM.md §2's own 834-vs-1024 distinction
              // for this screen: 834px doesn't have the room, 1024px does.
              <View className="hidden web:tabletLg:flex web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:gap-7 web:tabletLg:border-s web:tabletLg:border-divider-light web:tabletLg:ps-8 dark:web:tabletLg:border-divider-dark">
                {owedAccounts.length > 0 && (
                  <View>
                    <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                      {t('accounts.heroStats.owed')}
                    </Text>
                    <Money agorot={owedTotalAgorot} size="large" tone="danger" />
                  </View>
                )}
                {illiquidAccounts.length > 0 && (
                  <View>
                    <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                      {t('accounts.heroStats.illiquid')}
                    </Text>
                    <Money agorot={illiquidTotalAgorot} size="large" tone="muted" />
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Checkpoint 5: "the hero card still reads as three text blocks,
              not a visual asset/liability picture" (Checkpoint 1's own
              finding). A proportional segmented bar — the same
              Math.max(1, amount)-as-flexGrow technique Home's own hero
              waterfall bar already uses — turns the same three numbers
              already on this card (available/owed/illiquid) into one
              visual read of the household's own balance sheet, with no
              new figure computed for it. Only drawn once there is more
              than one segment to compare (an owed or illiquid group) —
              a lone liquid-only household would just see a solid bar,
              which is not "a picture," so the plain figure above still
              carries that case alone. */}
          {!isBalancesLoading && (owedAccounts.length > 0 || illiquidAccounts.length > 0) && (
            <View className="web:tablet:mt-4 mt-3 h-2.5 flex-row gap-0.5 overflow-hidden rounded-full">
              <View
                className="bg-positive-light dark:bg-positive-dark"
                style={{ flexGrow: Math.max(1, availableCashAgorot), flexBasis: 0 }}
              />
              {/* Math.abs, not the raw signed total: a credit-card balance
                  is stored negative (it's owed), so the raw `> 0`/flexGrow
                  this originally shipped with silently never rendered this
                  segment for a household that actually carries credit-card
                  debt — the one case this bar most needs to show. The
                  figure above (Money, tone="danger") already renders the
                  true signed amount; only this segment's own size/presence
                  check needed the magnitude. */}
              {Math.abs(owedTotalAgorot) > 0 && (
                <View
                  className="bg-danger-light dark:bg-danger-dark"
                  style={{ flexGrow: Math.max(1, Math.abs(owedTotalAgorot)), flexBasis: 0 }}
                />
              )}
              {Math.abs(illiquidTotalAgorot) > 0 && (
                <View
                  className="bg-inkMuted-light dark:bg-inkMuted-dark"
                  style={{ flexGrow: Math.max(1, Math.abs(illiquidTotalAgorot)), flexBasis: 0 }}
                />
              )}
            </View>
          )}

          <View className="mt-2 border-t border-divider-light pt-2 dark:border-divider-dark">
            <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {isBalancesLoading ? '' : t('accounts.netWorth', { amount: formatILS(totalBalanceAgorot) })}
              {' · '}
              {t('accounts.activeAccountCount', { count: activeAccountBalances.length })}
            </Text>

            {/* The explainer, collapsed by default — was a whole second
                card below the account list; now it's one tap away from the
                figure it explains, instead of documentation the household
                has to scroll past. */}
            <Pressable
              onPress={() => setIsExplainerOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isExplainerOpen }}
              className="mt-1.5 flex-row items-center gap-1 self-start web:hover:opacity-70"
            >
              <Text className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
                {t('accounts.availableExplainerTitle')}
              </Text>
              <Ionicons
                name={isExplainerOpen ? 'chevron-up' : 'chevron-down'}
                size={ICON.chip}
                color={scheme === 'dark' ? colors.accent.dark : colors.accent.light}
              />
            </Pressable>
            {isExplainerOpen && (
              <Text className="mt-1.5 max-w-[560px] text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {t('accounts.availableExplainerLong', { amount: formatILS(availableCashAgorot) })}
              </Text>
            )}
          </View>
        </View>
      )}

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : !hasData ? (
        <ErrorMessage message={t('accounts.errors.generic')} onRetry={refetch} />
      ) : (
        <>
          {error && (
            <View className="mb-3">
              <ErrorMessage message={t('accounts.errors.generic')} onRetry={refetch} />
            </View>
          )}
          {/* No actionLabel/onAction here — the persistent "Add account"
              button below already covers it; a second identical CTA stacked
              directly above it was confusing, not helpful. */}
          {accounts.length === 0 && <EmptyState iconName="wallet-outline" message={t('accounts.empty')} hint={t('accounts.emptyHint')} />}

          {/* Checkpoint 5: the 2-up wrap itself lives on this row wrapper
              (`web:tablet:flex-row web:tablet:flex-wrap web:tablet:gap-4`),
              each visible group picking up `web:tablet:w-[calc(50%-8px)]`
              from renderGroup, matching the 16px gap here — EXCEPT the last
              visible group when the visible count is odd (1 or 3 groups: a
              household missing one or two of owed/illiquid is common, not
              an edge case). An unconditional half-width on every group left
              that lone last card floating at half the row's width with dead
              space beside it — a real instance of exactly the "floating
              narrow column" the tablet/desktop composition review warns
              against, caught only by screenshotting a household with all
              three groups present and a household with just one. */}
          <View className="web:tablet:flex-row web:tablet:flex-wrap web:tablet:gap-4">
            {accountGroups.map((group, index) =>
              renderGroup(
                group.accounts,
                group.labelKey,
                group.labelClass,
                group.cardClass,
                index === accountGroups.length - 1 && accountGroups.length % 2 === 1
              )
            )}
          </View>
        </>
      )}

      {/* Add-account form/button stay narrow even on a wide desktop
          container — capped independently of the list above. */}
      {isAdding ? (
        <View className={INLINE_FORM_WIDTH_CLASS}>
          <Card>
            {/* Product-quality pass: a centered form with no heading of its
                own still read as loose fields rather than a deliberate
                panel — the button that opened it already says exactly this,
                reused here rather than inventing new copy. */}
            <Text className="mb-4 text-heading font-semibold text-ink-light dark:text-ink-dark">
              {t('accounts.form.formTitle')}
            </Text>
            <Input label={t('accounts.form.nameLabel')} value={name} onChangeText={setName} />
            <Select
              variant="row"
              label={t('accounts.form.typeLabel')}
              options={ACCOUNT_TYPE_OPTIONS.map((value) => ({
                value,
                label: t(`accounts.types.${value}`),
                iconName: accountIconName(value),
              }))}
              value={type}
              onChange={(value) => setType(value as AccountType)}
              placeholder={t('accounts.form.typeLabel')}
              sheetTitle={t('accounts.form.typeLabel')}
              leadingIcon={
                <RowIcon>
                  <Ionicons name={accountIconName(type)} size={ICON.row} color={iconColor} />
                </RowIcon>
              }
            />
            {type === 'credit_card' && (
              <Input
                label={t('accounts.form.billingCycleDayLabel')}
                value={billingCycleDayText}
                onChangeText={setBillingCycleDayText}
                placeholder={t('accounts.form.billingCycleDayPlaceholder')}
                keyboardType="number-pad"
              />
            )}
            {(createError || createAccount.isError) && (
              <ErrorMessage message={createError ?? t('accounts.errors.generic')} />
            )}
            {/* Part 4/21 of the product-quality audit: this form had no way
                back once opened, the same gap found and fixed on Goals —
                every sibling add-form pairs submit with a cancel. */}
            <View className="mt-2 web:desktop:flex-row web:desktop:gap-2">
              <View className="web:desktop:flex-1">
                <Button title={t('accounts.form.submit')} onPress={handleCreate} loading={createAccount.isPending} />
              </View>
              <View className="mt-3 web:desktop:mt-0 web:desktop:flex-1">
                <Button
                  title={t('common.cancel')}
                  variant="secondary"
                  disabled={createAccount.isPending}
                  onPress={() => {
                    setCreateError(null)
                    resetForm()
                  }}
                />
              </View>
            </View>
          </Card>
        </View>
      ) : (
        <View className={`mt-4 ${INLINE_FORM_WIDTH_CLASS}`}>
          <Button title={t('accounts.addButton')} variant="secondary" onPress={() => setIsAdding(true)} />
        </View>
      )}
    </Screen>
  )
}
