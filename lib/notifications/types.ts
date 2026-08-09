// Channel adapter contract. Adding a channel (WhatsApp, in-app, email) later
// means adding one file implementing this interface — no change to domain
// code, no change to router callers. See ARCHITECTURE.md § Notification
// architecture, ADR-014.

import type { DomainEvent, EventType } from '../events/types'

export interface RenderedNotification {
  title: string
  body: string
}

export interface DeliveryResult {
  channelId: NotificationChannel['id']
  delivered: boolean
  error?: string
}

export interface NotificationChannel {
  readonly id: 'push' | 'in_app' | 'whatsapp' | 'email'
  isAvailableFor(memberId: string): Promise<boolean>
  send(params: {
    memberId: string
    event: DomainEvent<EventType, unknown>
    rendered: RenderedNotification
  }): Promise<DeliveryResult>
}
