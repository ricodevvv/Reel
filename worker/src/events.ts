export type EventName = "jobs";

type Listener = (name: EventName) => void;

const listeners = new Set<Listener>();

/**
 * A nudge, not a payload.
 *
 * The panel renders on the server, so the useful thing to tell a browser is "something changed,
 * ask again" rather than a diff it would have to apply itself. One event name per thing that can
 * change is enough for the panel to decide whether the page it is on cares.
 */
export const events = {
  emit(name: EventName): void {
    for (const listener of listeners) listener(name);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
