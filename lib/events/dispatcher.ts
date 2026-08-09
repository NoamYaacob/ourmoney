// Synchronous in-process dispatcher. No queue, no broker, no persistence —
// see ADR-013. Replacing this with a durable queue when the server layer
// arrives is an implementation change behind this same emit()/on() interface.

import type { DomainEvent, EventType, PayloadFor } from './types'

type Handler<T extends EventType> = (event: DomainEvent<T, PayloadFor<T>>) => void

// Storage is intentionally loosely typed: TypeScript cannot correlate a
// generic key with a mapped type's value at a single call site (a known
// limitation, not a real type hole — every read and write goes through the
// fully-generic on()/emit() below, which ARE type-safe for every caller).
const handlers = new Map<EventType, Array<Handler<EventType>>>()

export function on<T extends EventType>(type: T, handler: Handler<T>): void {
  const list = handlers.get(type) ?? []
  list.push(handler as Handler<EventType>)
  handlers.set(type, list)
}

// Handler errors are caught and logged, never rethrown — a failed
// notification must never roll back the write that triggered it.
export function emit<T extends EventType>(event: DomainEvent<T, PayloadFor<T>>): void {
  const list = handlers.get(event.type)
  if (!list) return
  for (const handler of list) {
    try {
      handler(event as DomainEvent<EventType, PayloadFor<EventType>>)
    } catch (error) {
      console.error(`[events] handler for "${event.type}" threw`, error)
    }
  }
}
