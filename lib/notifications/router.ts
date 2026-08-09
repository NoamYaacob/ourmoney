// Event → recipients → channels. The only layer that knows channels exist.
// Domain code must never import this or anything under channels/ directly —
// it emits an event and is done. See ARCHITECTURE.md § Notification
// architecture, ADR-014.
//
// MVP ships exactly one hardcoded rule (budget threshold alerts via push).
// No budget feature exists yet in MVP-1, so this subscription has nothing to
// react to — it exists to prove the seam, not to fire.

import i18n from '../../i18n'
import { on } from '../events/dispatcher'
import type { BudgetThresholdReachedPayload, DomainEvent } from '../events/types'
import { pushChannel } from './channels/push'
import type { NotificationChannel, RenderedNotification } from './types'

const channels: NotificationChannel[] = [pushChannel]

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

on('budget.threshold_reached', (event) => {
  // Real per-member fan-out (household_members) arrives once that table
  // exists — Milestone 2. Until then, route to the actor who triggered it.
  const memberId = event.actorId
  if (!memberId) return

  const rendered = renderBudgetThresholdReached(event)
  for (const channel of channels) {
    void channel.send({ memberId, event, rendered })
  }
})
