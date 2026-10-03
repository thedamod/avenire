# Ruth chat view

Design for the Ruth conversation surface (desktop/web sheet and the mobile screen), derived
from a read of t3code's chat implementation (`context/t3code`, see the source map at the
end). This is a design, not wiring: the sync layer comes first, and the components here
consume whatever it produces.

## Principles taken from t3code

1. **Layered data flow.** Server items → normalized conversation projection → display rows
   → virtualized renderers. Each layer is pure and testable; React only sees display rows.
2. **Typed items, never HTML-in-markdown.** Text, tool results (plot, video, widget,
   simulation), approvals and background runs are distinct item kinds with typed payloads.
3. **Stable identity while streaming.** A streaming assistant message keeps its id; a
   text-only update swaps that one row and reuses every other row object.
4. **Requests are durable objects, not chat text.** Approvals and questions are keyed by
   id, have explicit status, and are answered with a typed response.
5. **Background work is not prose.** Ruth Cloud runs are entities with status and
   progress, linked from the conversation rather than narrated in it.

## 1. Data model

### Conversation items (contract)

Today `@avenire/contracts` has `Message { parts: MessagePart[] }` and a `RuthEvent` stream.
The sync layer should move to an item model like t3code's `OrchestrationV2TurnItem`:

```ts
type RuthItem =
  | { kind: "user_message"; id; text; attachments; createdAt }
  | { kind: "assistant_message"; id; text; citations; streaming: boolean }
  | { kind: "tool_activity"; id; tool: "search" | "read_item"; status; summary }
  | { kind: "artifact"; id; modality: Modality; artifactId; status; preview? } // see widget-renderer vision
  | { kind: "request"; id; request: RuthRequest; status: "pending" | "answered" | "expired" }
  | { kind: "cloud_run"; id; runId }                                          // live entity, rendered from run state
  | { kind: "error"; id; message; retryable: boolean };
```

Each item has `threadId`, `ordinal`, `createdAt`, `updatedAt`. Rows are upserted by id, so
a reconnecting client converges by replaying `item.updated` events past a cursor.

### Requests

A small union instead of t3code's provider-request taxonomy:

```ts
type RuthRequest =
  | { type: "file_action"; action: FileAction; preview: FileActionPreview }   // approve / decline
  | { type: "question"; prompt: string; choices?: string[]; multiSelect?: boolean; allowCustom: boolean };
```

**Contract gap to close:** `ruth.listMessages` doesn't return request state, so approval
cards can't be restored after a reload. Requests must be part of the synced item stream
(or a `ruth.pendingRequests` query).

## 2. Projection → rows

- `projectConversation(items)`: ordered, deduplicated, with optimistic user messages kept
  until the server acknowledges them (t3code `session-logic.ts`).
- `deriveRows(projection, uiState)`: consecutive `tool_activity` items collapse into one
  "worked through N sources" row (expandable). Errors and requests are never folded. A
  "thinking" row (elapsed timer + last activity) appears while a turn runs with no visible
  output yet.
- `stabilizeRows(prev, next)`: shallow-compares per row kind and keeps the previous object
  when unchanged, so memoized rows skip rendering (t3code
  `computeStableMessagesTimelineRows`).
- Streaming short-circuit: if the only change is the streaming message's text, replace that
  one row and reuse the rest (`replaceStreamingMessageRows`).

## 3. Rendering

| Row | Renderer |
| --- | --- |
| user message | plain text + attachment/context chips |
| assistant message | `react-markdown` + GFM + KaTeX math, sanitized; citation chips open the source item at the cited page/timestamp; incremental parsing only while a fenced block is streaming |
| tool activity | compact work row; expanding shows sources read, in a bounded nested list |
| artifact | lazy row per modality (chart, video, simulation, interactive), fixed placeholder height until loaded, "open full" action (see `docs/vision/widget-renderer.md`) |
| request | inline card; a pending card is also docked above the composer |
| cloud run | live card subscribed to the run entity: status, progress, artifacts when done |

Code blocks use lazy Shiki with a reserved-height Suspense fallback.

## 4. Virtualization

Use `@legendapp/list` on both web (`@legendapp/list/react`) and mobile
(`KeyboardAwareLegendList`), as t3code does:

- `keyExtractor = row.id`, `getItemType = row.kind`, `estimatedItemSize` ≈ 90 (web) /
  180 (mobile), measured variable heights, `maintainVisibleContentPosition`.
- **Follow latch:** `maintainScrollAtEnd` only while following. Any user scroll, wheel,
  touch or key navigation turns following off; a "jump to latest" pill turns it back on.
  A 40px tolerance avoids flicker as content grows. A newly sent user message anchors
  near the top while the reply streams.
- **History paging:** "load earlier" prepends a page, deduplicated by item id, with the
  scroll anchor kept on the first visible row.
- **Scroll restore per thread:** row id + offset within the row.

## 5. Right-side message track

`TimelineMinimap` equivalent, web/desktop only:

- One tick per user message. Hovering previews that question and the start of Ruth's
  answer; clicking calls `scrollToIndex` on that row; ↑/↓ buttons step between turns.
- On scroll, compare measured row positions with the viewport to mark ticks in view and
  the current turn. Mutate only data attributes, and animate with transform/opacity.
- Width is capped to the gutter so it never covers text. Hidden when a thread has fewer
  than ~4 turns.

## 6. Composer

Keep it much simpler than t3code's (no TipTap token grammar, no queue/steer matrix):

- Plain multiline input with draft persistence per thread (Zustand `persist` on web,
  device storage on mobile).
- **Context chips** instead of inline syntax: "@" opens an item/cluster picker; the chip
  records `{ itemId | clusterId }` and is sent as a typed context reference alongside the
  text.
- Attachments: paste, drop or pick images and files, staged before send; sending is
  blocked while uploads are in flight.
- While Ruth is working: Stop. Sending again queues the message for after the turn
  (no steering).
- Footer: an optional modality hint ("explain with…": auto / chart / video / simulation /
  interactive). Auto is the default; see the modality policy in the widget-renderer vision.

### How the composer asks for input

As in t3code's `ComposerPendingApprovalPanel` / `ComposerPendingUserInputPanel`: a banner
docked **above** the composer, never replacing it, so the draft is preserved.

- **File action:** what will change (move, rename, archive, create note) with a preview
  (target cluster, new title, note excerpt), and Approve / Decline. Ruth's turn continues
  when it is answered.
- **Question:** one question at a time with choice buttons and an optional free-text
  answer; a progress indicator if there are several. Free-form study questions are
  answered in the normal composer, not the banner.
- Stale requests (from a turn that can no longer continue) say so instead of offering
  buttons.

## 7. Background work and subagents

Ruth doesn't delegate to subagents today. Ruth Cloud runs are its background work:

- A `cloud_run` row links to the run's detail view (live status, recording, artifacts).
- The shell shows a small "Ruth Cloud" indicator while a run is active, with a sheet
  listing runs (like t3code's `ThreadAgentsSheet`).
- If Ruth later fans out to subagents (say, one per cluster in a nightly run), reuse
  t3code's grouped card: an avatar stack, count, status summary and elapsed time, expanding
  into per-agent rows that open the child transcript.

## 8. Performance checklist

- Memoize every row component; give rows narrow subscriptions (the run card subscribes
  only to its run).
- Mount heavy artifacts (video, interactive canvas) only while the row is visible, and
  pause them offscreen.
- Expanded tool details live in a nested virtualized list.
- Timers (elapsed labels) are isolated components so they don't re-render rows.

## Source map (t3code)

- Composer: `apps/web/src/components/chat/ChatComposer.tsx`, `ComposerPromptEditorTiptap.tsx`,
  `composerDraftStore.ts`, `ComposerPendingApprovalPanel.tsx`,
  `ComposerPendingUserInputPanel.tsx`; `packages/client-runtime/src/state/threadRequests.ts`.
- Timeline: `apps/web/src/session-logic.ts`, `components/chat/MessagesTimeline.tsx`,
  `MessagesTimeline.logic.ts`, `timelineMinimapItems.ts`, `timelineScrollAnchoring.ts`,
  `components/ChatMarkdown.tsx`; `packages/client-runtime/src/state/orchestrationV2Projection.ts`,
  `threadHistoryMerge.ts`.
- Mobile: `apps/mobile/src/features/threads/ThreadFeed.tsx`, `thread-subagent-group.tsx`,
  `ThreadAgentsSheet.tsx`, `PendingApprovalCard.tsx`.
- Research notes: `context/_notes/t3-composer.md`, `context/_notes/t3-timeline.md`.
