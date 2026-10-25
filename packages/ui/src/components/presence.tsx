import * as React from "react";

export type PresenceState = "present" | "enter" | "exit";

export interface PresenceEntry<T> {
  readonly key: string;
  readonly item: T;
  /** `enter` for items added after the list first rendered, `exit` while leaving. */
  readonly state: PresenceState;
}

/** How long a removed row stays mounted while it collapses (matches `presence-item`). */
export const PRESENCE_EXIT_MS = 180;

/**
 * Keeps removed items mounted for `exitMs` so they can animate out, and flags items that arrive
 * after the first render so they can animate in. Render each entry inside a `presence-item`
 * element with `data-presence={entry.state}` (and `inert` while exiting):
 *
 * ```tsx
 * const rows = usePresenceList(notes, (note) => note.id);
 * rows.map(({ key, item, state }) => (
 *   <div key={key} className="presence-item" data-presence={state} inert={state === "exit"}>
 *     <NoteRow note={item} />
 *   </div>
 * ));
 * ```
 *
 * The first render (skeleton → data) never animates, so loading doesn't shift anything.
 */
export function usePresenceList<T>(
  items: readonly T[] | undefined,
  getKey: (item: T) => string,
  exitMs = PRESENCE_EXIT_MS,
): readonly PresenceEntry<T>[] {
  const [version, bump] = React.useReducer((count: number) => count + 1, 0);
  // What the last commit rendered (null until the list first has data).
  const committed = React.useRef<readonly PresenceEntry<T>[] | null>(null);
  const expired = React.useRef(new Set<string>());
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Pure: derived from the last commit, so StrictMode's double render agrees with itself.
  const entries = React.useMemo(() => {
    if (!items) return [];
    const previous = committed.current;
    const keys = new Set(items.map(getKey));
    const before = new Map(previous?.map((entry) => [entry.key, entry]));
    const next: PresenceEntry<T>[] = items.map((item) => {
      const key = getKey(item);
      const was = before.get(key);
      const state: PresenceState =
        previous === null || (was && was.state !== "enter" && was.state !== "exit")
          ? "present"
          : was?.state === "exit"
            ? "present"
            : "enter";
      return { key, item, state };
    });
    // Anything that was on screen and is gone now leaves from its old position.
    previous?.forEach((entry, index) => {
      if (keys.has(entry.key) || expired.current.has(entry.key)) return;
      next.splice(Math.min(index, next.length), 0, { ...entry, state: "exit" });
    });
    return next;
    // `version` re-derives once an exit has finished.
  }, [items, getKey, version]);

  React.useEffect(() => {
    committed.current = items ? entries : committed.current;
    const live = new Set(entries.map((entry) => entry.key));
    for (const key of expired.current) if (!live.has(key)) expired.current.delete(key);
    for (const entry of entries) {
      if (entry.state === "exit") {
        if (timers.current.has(entry.key)) continue;
        timers.current.set(
          entry.key,
          setTimeout(() => {
            timers.current.delete(entry.key);
            expired.current.add(entry.key);
            bump();
          }, exitMs),
        );
      } else {
        // Came back (undo) before it finished leaving.
        const timer = timers.current.get(entry.key);
        if (timer) clearTimeout(timer);
        timers.current.delete(entry.key);
      }
    }
  });

  React.useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    },
    [],
  );

  return entries;
}

/**
 * Holds the last non-null value for `exitMs` after it becomes null, so a single conditional
 * surface (a tray, a banner) can play its exit. `closing` is true during that window.
 */
export function usePresence<T>(
  value: T | null | undefined,
  exitMs = PRESENCE_EXIT_MS,
): { readonly value: T | null; readonly closing: boolean } {
  const [, bump] = React.useReducer((count: number) => count + 1, 0);
  const present = value !== null && value !== undefined;
  const last = React.useRef<T | null>(null);
  if (present) last.current = value;
  React.useEffect(() => {
    if (present || last.current === null) return;
    const timer = setTimeout(() => {
      last.current = null;
      bump();
    }, exitMs);
    return () => clearTimeout(timer);
  }, [present, exitMs]);
  return present
    ? { value, closing: false }
    : { value: last.current, closing: last.current !== null };
}

/**
 * True when `data` was still loading on the first render: content that replaces a skeleton
 * should fade in (`enter-fade`), content that was already cached should just be there (the page
 * or tab around it already fades, and two fades would stack).
 */
export function useArrivedLate(data: unknown): boolean {
  const [late] = React.useState(() => data === undefined);
  return late;
}
