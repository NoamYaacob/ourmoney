// MVP's only implemented channel.
//
// KNOWN LIMITATION (Milestone 6, D8): Notifications.scheduleNotificationAsync()
// schedules a LOCAL notification on whichever device calls send() — it has
// no mechanism to deliver to a different device.
// "Budget threshold notifications are not guaranteed to reach the partner's
// separate device in Milestone 6. True cross-device push requires
// server-side/device-token infrastructure and is deferred." Do not read
// router.ts's per-member fan-out as solving this — the fan-out logic and
// routing are real and correct groundwork; only the transport is local.
// A future milestone may add a device-token table + Edge Function dispatch
// as one more subscriber on the same events, without touching this file's
// callers or the domain code that emits those events.
// See ARCHITECTURE.md § Notification architecture.
//
// isAvailableFor doubles as this channel's ONLY per-member routing check —
// required, not a nice-to-have (qa-adversarial-reviewer + mobile-expo-
// reviewer finding: router.ts's real per-member fan-out loop was calling
// send() once per household member, and since this channel can only ever
// fire on whichever device is currently executing the code, that produced
// N identical local banner notifications on the ACTING member's own device
// for a single real crossing, in any household with N members). Comparing
// memberId against the current session's user id is what makes this
// channel correctly self-select "am I actually the member this send() call
// is for" — the fix belongs here, not in router.ts, since it is this
// channel's local-only transport that makes memberId ambiguous in the
// first place; a future device-token channel would not need this check at
// all, since it would genuinely route per member.

import * as Notifications from 'expo-notifications'
import { supabase } from '../../supabase/client'
import type { DeliveryResult, NotificationChannel } from '../types'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export const pushChannel: NotificationChannel = {
  id: 'push',

  async isAvailableFor(memberId: string): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return false

    const { data } = await supabase.auth.getSession()
    return data.session?.user.id === memberId
  },

  async send({ rendered }): Promise<DeliveryResult> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title: rendered.title, body: rendered.body },
        trigger: null,
      })
      return { channelId: 'push', delivered: true }
    } catch (error) {
      return { channelId: 'push', delivered: false, error: String(error) }
    }
  },
}
