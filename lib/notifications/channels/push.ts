// MVP's only implemented channel. Registered but idle — nothing in MVP-1
// emits an event this channel's router subscription reacts to yet.
// See ARCHITECTURE.md § Notification architecture.

import * as Notifications from 'expo-notifications'
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

  // Per-member device-token awareness arrives with real auth (Milestone 3+).
  // For now this reflects the current device's OS-level permission only.
  async isAvailableFor(): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync()
    return status === 'granted'
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
