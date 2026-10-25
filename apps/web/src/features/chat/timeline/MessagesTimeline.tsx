"use client";

import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { ArrowDown } from "lucide-react";
import { attachScrollFade } from "@avenire/ui/components/scroll-fade";
import { cn } from "@avenire/ui/lib/utils";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ChatRow } from "../logic/types.ts";
import {
  currentRailItem,
  timelineRailItems,
  type TimelineRailItem,
} from "../logic/timelineRail.ts";
import { TimelineRow } from "./TimelineRows.tsx";
import { TimelineRail } from "./TimelineRail.tsx";

/** Distance from the end that still counts as "at the latest message". */
const FOLLOW_TOLERANCE_PX = 40;
/** A scroll within this long of a wheel/touch/key gesture is the user's, not ours. */
const USER_SCROLL_WINDOW_MS = 400;

interface SavedPosition {
  readonly rowId: string;
  readonly offset: number;
  readonly atEnd: boolean;
}
/** Scroll position per thread (row id + offset within the row), for coming back to a thread. */
const positions = new Map<string, SavedPosition>();

const keyExtractor = (row: ChatRow) => row.id;
const getItemType = (row: ChatRow) => row.kind;
/** How long a newly arrived row keeps its enter transition (it runs 200ms). */
const ENTER_HOLD_MS = 400;

/**
 * The virtualised thread. Follows new output while the reader is at the end (40px tolerance);
 * any scroll gesture away from the end stops following and shows "Jump to latest".
 */
export function MessagesTimeline({
  rows,
  threadKey,
  bottomInset,
  followSignal,
  header,
  startAtTop = false,
}: {
  readonly rows: readonly ChatRow[];
  /** Identity for scroll restore. */
  readonly threadKey: string;
  /** Height of the composer dock floating over the list's bottom. */
  readonly bottomInset: number;
  /** Bump to jump to the end and start following (e.g. after sending). */
  readonly followSignal: number;
  readonly header?: ReactNode;
  /** Open at the top (a report reads top-down) instead of at the latest message. */
  readonly startAtTop?: boolean;
}) {
  const listRef = useRef<LegendListRef>(null);
  const railItems = useMemo(() => timelineRailItems(rows, startAtTop), [rows, startAtTop]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const saved = useRef(positions.get(threadKey)).current;
  const [following, setFollowing] = useState(saved ? saved.atEnd : !startAtTop);
  const followingRef = useRef(following);
  followingRef.current = following;
  const lastGesture = useRef(0);
  // A top-anchored list only starts following once the reader scrolls or sends.
  const armed = useRef(!startAtTop || saved !== undefined);
  const [away, setAway] = useState(false);
  const frame = useRef<number | null>(null);

  // Rows that arrive after the thread opened (a sent message, Ruth's reply) fade + rise in on
  // their first mount. Ids are recorded after each commit, so a row virtualised away and
  // re-mounted on scroll is already known and doesn't animate again.
  // The class stays on for ENTER_HOLD_MS: streaming re-renders the row every few frames, and
  // dropping the transition mid-way would cut it short.
  const known = useRef<Set<string> | null>(null);
  const firstSeen = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    if (known.current === null) {
      known.current = new Set(rows.map(keyExtractor));
      return;
    }
    const now = Date.now();
    for (const [id, at] of firstSeen.current)
      if (now - at > ENTER_HOLD_MS) firstSeen.current.delete(id);
    for (const row of rows)
      if (!known.current.has(row.id)) {
        known.current.add(row.id);
        firstSeen.current.set(row.id, now);
      }
  }, [rows]);
  const renderItem = useCallback(({ item }: { item: ChatRow }) => {
    const seenAt = firstSeen.current.get(item.id);
    const entering =
      (known.current !== null && !known.current.has(item.id)) ||
      (seenAt !== undefined && Date.now() - seenAt < ENTER_HOLD_MS);
    return (
      <div className={entering ? "enter-rise" : undefined}>
        <TimelineRow row={item} />
      </div>
    );
  }, []);

  const initialIndex = useMemo(() => {
    if (!saved || saved.atEnd) return undefined;
    const index = rows.findIndex((row) => row.id === saved.rowId);
    return index >= 0 ? { index, viewOffset: -saved.offset } : undefined;
    // Only the first render's rows matter for the initial position.
  }, []);

  const handleScroll = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const state = listRef.current?.getState();
      if (!state) return;
      const distance = state.contentLength - (state.scroll + state.scrollLength);
      const atEnd = distance <= FOLLOW_TOLERANCE_PX;
      setAway(!atEnd);
      if (atEnd && !followingRef.current && armed.current) setFollowing(true);
      else if (
        !atEnd &&
        followingRef.current &&
        Date.now() - lastGesture.current < USER_SCROLL_WINDOW_MS
      )
        setFollowing(false);
      const start = state.start;
      const railRow = startAtTop && state.scroll <= 1 ? -1 : atEnd ? rows.length - 1 : start;
      setCurrentId(currentRailItem(railItems, railRow));
      const row = state.data[start] as ChatRow | undefined;
      if (row)
        positions.set(threadKey, {
          rowId: row.id,
          offset: Math.max(0, state.scroll - state.positionAtIndex(start)),
          atEnd,
        });
    });
  }, [threadKey, railItems, rows.length, startAtTop]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  // Edge fades: under the header at the top, ending at the composer's top edge at the bottom.
  useEffect(() => {
    const node = listRef.current?.getScrollableNode() as HTMLElement | null | undefined;
    if (!node) return;
    node.classList.add("edge-fade-y");
    return attachScrollFade(node);
  }, []);
  useEffect(() => {
    const node = listRef.current?.getScrollableNode() as HTMLElement | null | undefined;
    // Registered with `inherits: false`, so this never restyles the rows.
    node?.style.setProperty("--edge-fade-inset-end", `${bottomInset}px`);
  }, [bottomInset]);

  // Any wheel, touch or navigation key counts as the reader taking over the scroll.
  useEffect(() => {
    const node = listRef.current?.getScrollableNode() as HTMLElement | null | undefined;
    if (!node) return;
    const mark = () => {
      lastGesture.current = Date.now();
      armed.current = true;
    };
    const onWheel = (event: WheelEvent) => {
      mark();
      if (event.deltaY < 0 && followingRef.current) setFollowing(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key))
        mark();
    };
    node.addEventListener("wheel", onWheel, { passive: true });
    node.addEventListener("touchmove", mark, { passive: true });
    node.addEventListener("pointerdown", mark, { passive: true });
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("touchmove", mark);
      node.removeEventListener("pointerdown", mark);
      node.removeEventListener("keydown", onKey);
    };
  }, []);

  const jumpToLatest = useCallback((animated: boolean) => {
    armed.current = true;
    setFollowing(true);
    void listRef.current?.scrollToEnd({ animated });
  }, []);

  const selectRailItem = useCallback((item: TimelineRailItem) => {
    armed.current = true;
    followingRef.current = false;
    setFollowing(false);
    setCurrentId(item.id);
    const animated = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (item.rowIndex < 0) void listRef.current?.scrollToOffset({ offset: 0, animated });
    else
      void listRef.current?.scrollToIndex({
        index: item.rowIndex,
        viewPosition: 0,
        viewOffset: 16,
        animated,
      });
  }, []);

  const firstSignal = useRef(followSignal);
  useLayoutEffect(() => {
    if (followSignal === firstSignal.current) return;
    jumpToLatest(false);
  }, [followSignal, jumpToLatest]);

  // Only the composer itself changes this inset; its popovers float outside the dock's flow.
  useEffect(() => {
    if (followingRef.current) void listRef.current?.scrollToEnd({ animated: false });
  }, [bottomInset]);

  const footer = useMemo(() => <div style={{ height: bottomInset + 16 }} />, [bottomInset]);

  return (
    <div className="relative h-full min-h-0 @container/timeline">
      <LegendList<ChatRow>
        ref={listRef}
        data={rows}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        renderItem={renderItem}
        estimatedItemSize={90}
        recycleItems={false}
        {...(initialIndex
          ? { initialScrollIndex: initialIndex }
          : startAtTop && !saved
            ? {}
            : { initialScrollAtEnd: true })}
        maintainScrollAtEnd={
          following
            ? { animated: false, on: { dataChange: true, itemLayout: true, layout: true } }
            : false
        }
        maintainScrollAtEndThreshold={0.1}
        maintainVisibleContentPosition={!startAtTop}
        onScroll={handleScroll}
        ListHeaderComponent={header ? <>{header}</> : <div className="h-4" />}
        ListFooterComponent={footer}
        className="h-full min-h-0 overflow-x-hidden overscroll-y-contain [overflow-anchor:none]"
      />
      <TimelineRail
        items={railItems}
        currentId={currentId ?? (startAtTop ? railItems[0]?.id : railItems.at(-1)?.id) ?? null}
        onSelect={selectRailItem}
      />
      <button
        type="button"
        onClick={() => jumpToLatest(true)}
        aria-hidden={following || !away}
        tabIndex={following || !away ? -1 : 0}
        style={{ bottom: bottomInset + 12 }}
        className={cn(
          "absolute left-1/2 z-20 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/[.08] bg-[rgba(30,30,30,0.85)] px-3 text-[12.5px] text-foreground-soft backdrop-blur-[16px] transition-[opacity,translate,color] duration-popover ease-out hover:text-foreground motion-reduce:transition-opacity",
          following || !away ? "pointer-events-none translate-y-1 opacity-0" : "opacity-100",
        )}
      >
        <ArrowDown className="size-3.5" />
        Jump to latest
      </button>
    </div>
  );
}
