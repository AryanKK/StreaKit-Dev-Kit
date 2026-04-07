import type { StreakEvents, StreakEventName } from './types/index.js';

type Listener<T> = (data: T) => void;

export class EventEmitter {
  private listeners = new Map<string, Set<Listener<unknown>>>();

  on<E extends StreakEventName>(event: E, listener: Listener<StreakEvents[E]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as Listener<unknown>);

    return () => {
      set.delete(listener as Listener<unknown>);
    };
  }

  off<E extends StreakEventName>(event: E, listener: Listener<StreakEvents[E]>): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  emit<E extends StreakEventName>(event: E, data: StreakEvents[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(data);
      } catch {
        // listener errors must not break the engine
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
