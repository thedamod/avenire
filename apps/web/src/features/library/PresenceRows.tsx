"use client";

import type { ReactNode } from "react";
import { usePresenceList } from "@avenire/ui/components/presence";

const idOf = (item: unknown) => (item as { readonly id: string }).id;

/**
 * Rows that open in when they arrive (a new capture) and collapse out when they leave (trash,
 * move out of a filtered list), 180–200ms on grid rows + opacity. The first render never
 * animates, so skeleton → list doesn't shift. Each row is a direct child of the list, so
 * `divide-y` keeps working.
 */
export function PresenceRows<T>({
  items,
  getKey = idOf,
  children,
}: {
  items: readonly T[];
  /** Defaults to `item.id`. Keep it stable (module scope). */
  getKey?: (item: T) => string;
  children: (item: T) => ReactNode;
}) {
  const rows = usePresenceList(items, getKey);
  return rows.map(({ key, item, state }) => (
    <div key={key} className="presence-item" data-presence={state} inert={state === "exit"}>
      {children(item)}
    </div>
  ));
}
