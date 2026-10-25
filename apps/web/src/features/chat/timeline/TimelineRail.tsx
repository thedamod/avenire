"use client";

import { cn } from "@avenire/ui/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type MouseEvent } from "react";

import { railIndexAtPointer, type TimelineRailItem } from "../logic/timelineRail.ts";

/** T3's gutter minimap: quiet turn marks, hover previews, and keyboard navigation. */
export function TimelineRail({
  items,
  currentId,
  onSelect,
}: {
  readonly items: readonly TimelineRailItem[];
  readonly currentId: string | null;
  readonly onSelect: (item: TimelineRailItem) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const currentIndex = Math.max(
    0,
    items.findIndex((item) => item.id === currentId),
  );
  const active = items[activeIndex];
  if (items.length < 2) return null;

  const indexFromPointer = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return railIndexAtPointer(event.clientY, rect.top + 6, rect.height - 12, items.length);
  };
  const select = (index: number) => {
    const item = items[index];
    if (item) onSelect(item);
  };
  const top = (index: number) => `${(index / (items.length - 1)) * 100}%`;
  return (
    <nav
      aria-label="Conversation outline"
      data-timeline-rail
      className="group/rail pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-12 @min-[816px]/timeline:block [@media(pointer:coarse)]:hidden"
    >
      <div
        className="pointer-events-auto absolute top-1/2 left-3 w-8 -translate-y-1/2"
          style={{ height: `min(45dvh, ${Math.max(36, (items.length - 1) * 8)}px)` }}
        onMouseLeave={() => setActiveId(null)}
      >
        <button
          type="button"
          aria-label="Previous turn or section"
          disabled={currentIndex === 0}
          onClick={() => select(currentIndex - 1)}
          className="absolute -top-7 -left-1 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 outline-none transition-opacity group-hover/rail:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Jump to: ${compact(active?.title ?? items[currentIndex]!.title)}`}
          onFocus={() => setActiveId(items[currentIndex]!.id)}
          onBlur={() => setActiveId(null)}
          onMouseMove={(event) => setActiveId(items[indexFromPointer(event)]!.id)}
          onClick={(event) => {
            // Keyboard activation has no pointer position.
            select(
              event.detail === 0
                ? activeIndex < 0
                  ? currentIndex
                  : activeIndex
                : indexFromPointer(event),
            );
          }}
          onKeyDown={(event) => {
            const base = activeIndex < 0 ? currentIndex : activeIndex;
            let next: number;
            if (event.key === "ArrowDown") next = Math.min(items.length - 1, base + 1);
            else if (event.key === "ArrowUp") next = Math.max(0, base - 1);
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = items.length - 1;
            else if (event.key === "Escape") {
              event.currentTarget.blur();
              return;
            } else return;
            event.preventDefault();
            setActiveId(items[next]!.id);
          }}
          className="absolute -inset-y-1.5 inset-x-0 cursor-pointer rounded bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-6">
            {items.map((item, index) => {
              const distance = activeIndex < 0 ? null : Math.abs(index - activeIndex);
              return (
                <span
                  key={item.id}
                  data-current={item.id === currentId || undefined}
                  className={cn(
                    "absolute left-0 h-0.5 w-6 origin-left -translate-y-1/2 rounded-full bg-muted-foreground/35 transition-[transform,opacity] duration-150 motion-reduce:transition-none data-[current]:bg-foreground",
                    distance === 0
                      ? "scale-x-100"
                      : distance === 1
                        ? "scale-x-[0.667]"
                        : distance === 2
                          ? "scale-x-[0.417]"
                          : "scale-x-[0.333]",
                  )}
                  style={{ top: top(index) }}
                />
              );
            })}
          </span>
        </button>
        {active ? (
          <div
            className="absolute left-9 w-80 max-w-[calc(100cqw-5rem)] rounded-lg border border-input bg-popover p-3 text-left shadow-lg"
            style={{
              top: top(activeIndex),
              transform: `translateY(${activeIndex === 0 ? "0" : activeIndex === items.length - 1 ? "-100%" : "-50%"})`,
            }}
          >
            <p className="truncate text-[13px] font-medium leading-5 text-foreground">
              {compact(active.title)}
            </p>
            {active.preview ? (
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                {compact(active.preview)}
              </p>
            ) : null}
            <span className="mt-2 block text-[11px] text-muted-foreground">
              {activeIndex + 1} / {items.length}
            </span>
          </div>
        ) : null}
        <button
          type="button"
          aria-label="Next turn or section"
          disabled={currentIndex === items.length - 1}
          onClick={() => select(currentIndex + 1)}
          className="absolute -bottom-7 -left-1 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 outline-none transition-opacity group-hover/rail:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-0"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>
    </nav>
  );
}

function compact(value: string): string {
  return value
    .replace(/[#*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
