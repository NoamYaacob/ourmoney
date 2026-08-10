// Event → recipients → channels. The only layer that knows channels exist.
// Domain code must never import this or anything under channels/ directly —
// it emits an event and is done. See ARCHITECTURE.md § Notification
// architecture, ADR-014.
//
// Milestone 6: real per-member fan-out. household_members has existed since
// Milestone 2; this is the first milestone with an actual event to route
// (features/budgets/lib/budgetThresholdSubscriber.ts is the first real
// emitter of budget.threshold_reached/budget.exceeded).
//
// KNOWN LIMITATION (D8, Milestone 6): push.ts's send() schedules a LOCAL
// notification on whichever device runs this code — it has no device-token
// mechanism, so it can only ever reach the ACTING member's own device, not
// a partner's separate device. Fan-out below is real and correct (every
// household member is resolved and handed to the channel), but cross-device
// delivery itself is not guaranteed in Milestone 6. True cross-device push
// requires server-side/device-token infrastructure and is deferred to a
// named future milestone — see docs/DECISIONS.md and push.ts's own header.
// Do not read this fan-out as if it already solves cross-device delivery.

import i18n from '../../i18n'
import { on } from '../events/dispatcher'
import { supabase } from '../supabase/client'
import type { BudgetThresholdReachedPayload, DomainEvent, EventType } from '../events/types'
import { pushChannel } from './channels/push'
import type { NotificationChannel, RenderedNotification } from './types'

const channels: NotificationChannel[] = [pushChannel]

async function fanOutToHousehold(
  householdId: string,
  rendered: RenderedNotification,
  event: DomainEvent<EventType, unknown>
) {
  const { data: members, error } = await supabase.from('household_members').select('user_id').eq('household_id', householdId)
  if (error || !members) return

  for (const member of members) {
    for (const channel of channels) {
      // isAvailableFor is the router's ONLY gate on whether a channel can
      // actually reach this specific member — required, not optional
      // (qa-adversarial-reviewer + mobile-expo-reviewer finding: without
      // this check, push.ts's local-only send() fired once per household
      // member on the single acting device, producing N identical banner
      // notifications for one real crossing in an N-member household).
      // The per-member loop itself stays exactly as-is deliberately — this
      // is real, correct fan-out groundwork for D8 Option A's future
      // device-token dispatcher, which will make isAvailableFor return true
      // for every member instead of just the acting one, with no change
      // needed here or in any domain module.
      if (!(await channel.isAvailableFor(member.user_id))) continue
      void channel.send({ memberId: member.user_id, event, rendered })
    }
  }
}

function renderBudgetThresholdReached(
  event: DomainEvent<'budget.threshold_reached', BudgetThresholdReachedPayload>
): RenderedNotification {
  return {
    title: i18n.t('notifications.budgetThresholdReached.title'),
    body: i18n.t('notifications.budgetThresholdReached.body', {
      thresholdPercent: event.payload.thresholdPercent,
    }),
  }
}

function renderBudgetExceeded(): RenderedNotification {
  return {
    title: i18n.t('notifications.budgetExceeded.title'),
    body: i18n.t('notifications.budgetExceeded.body'),
  }
}

on('budget.threshold_reached', (event) => {
  void fanOutToHousehold(event.householdId, renderBudgetThresholdReached(event), event)
})

// Required addition, previously missing entirely: budget.exceeded had no
// subscriber at all despite the notification content already being defined.
on('budget.exceeded', (event) => {
  void fanOutToHousehold(event.householdId, renderBudgetExceeded(), event)
})
