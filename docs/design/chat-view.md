# Ava chat view

Design for the Ava conversation surface (desktop/web sheet and the mobile screen). It takes
its rendering ideas from t3code's chat (`context/t3code`, source map at the end), its
composer behaviour from v1 (`context/avenire/apps/web/src/components/chat/multimodal-input.tsx`),
and its message model from the Vercel AI SDK. This is a design, not wiring: the sync layer
comes first, and these components consume whatever it produces.

## Principles

1. **Layered data flow.** `UIMessage[]` → display rows → virtualized renderers. Each layer
   is pure and testable; React only sees display rows.
2. **The AI SDK message is the data model.** There's no separate file model. Text,
   reasoning, tool calls (with approval), files and custom data are `UIMessage` parts, as in
   v1 (`ai` 7, `@ai-sdk/react`).
3. **Visuals are inline HTML in markdown.** Ava writes `<avenire-chart>` /
   `<avenire-sim>` tags inside its markdown, so it can place a visual mid-explanation and
   wrap it in its own layout. Before writing one it calls `get_page_context` to learn the
   page (surface, width, theme, kits). The renderer allowlists those tags and mounts real
   components for them (see `docs/vision/widget-renderer.md` §3.2, §4.4).
4. **Stable identity while streaming.** A streaming assistant message keeps its id; a
   text-only update swaps that one row and reuses every other row object.
5. **Requests are durable message parts, not chat text.** Approvals and questions live on
   tool parts, so they survive reloads and are answered with typed responses.
6. **Main thread for DOM only.** Markdown parsing, KaTeX, syntax highlighting, chart layout
   and simulation steps run in workers.

## 1. Message model (AI SDK)

| Need                                                              | `UIMessage` part                                                                                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prose, including `<avenire-*>` visual tags                        | `text`                                                                                                                                                          |
| Ava's reasoning summary                                          | `reasoning` (collapsed by default)                                                                                                                              |
| `search_materials`, `read_file`, `run_python`, `get_page_context` | `tool-<name>` with `input-streaming` → `input-available` → `output-available` / `output-error`                                                                  |
| File action                                                       | `tool-propose_file_action` with `needsApproval: !thread.fullAccess`; state `approval-requested` → `approval-responded`, answered with `addToolApprovalResponse` |
| A question for the user                                           | `tool-ask_user`, a client-side tool with no `execute`, answered with `addToolOutput` (choices / free text)                                                      |
| A subagent (the video agent)                                      | `data-subagent` part `{ subagentId, kind, status, stage, progress }`, updated in place by id                                                                    |
| A Ava Cloud run                                                  | `data-cloud-run` part `{ runId }`, rendered from live run state                                                                                                 |
| User attachments                                                  | `file` parts with an `attachmentId` (upload state lives outside the message; see §6.4)                                                                          |

**Page facts travel with the request.** `DefaultChatTransport` sends
`{ threadId, fast, page }` in the body, where `page` is `{ surface, platform,
contentWidthPx, colorScheme, themeTokens, fonts }` measured from the chat column. The server
merges it with runtime constants when Ava calls `get_page_context`, so the tool never
waits on the client. Resizing between turns just changes the next request's `page`.

**Questions from subagents.** A subagent's question is an `ask_user` tool part carrying
`origin: { subagentId }`. The banner labels it ("Video agent asks…"), and the answer is
routed to that subagent, not to the chat turn.

**Restoring after reload** is free: the pending approval or question is a tool part in the
persisted message, so the banner is rebuilt from the last assistant message's parts.

## 2. Messages → rows

- `deriveRows(messages, uiState)`:
  - Splits each assistant message into rows at block boundaries: prose, tool group,
    visual, request. Long answers virtualize well, and a visual's height change re-measures
    only its row.
  - Folds consecutive search/read tool parts into one "worked through N sources" row
    (expandable).
  - Never folds errors, requests or visuals.
  - Shows a "thinking" row (elapsed timer plus the last tool name) while a turn runs with
    no visible output yet.
- `stabilizeRows(prev, next)`: shallow-compares per row kind and keeps the previous object
  when unchanged, so memoized rows skip rendering (t3code
  `computeStableMessagesTimelineRows`).
- **Streaming short-circuit:** when only the streaming message's last text part changed,
  replace only its last row and reuse the rest (`replaceStreamingMessageRows`).
- Optimistic user messages come from `useChat`'s own state. Their attachments render from
  local blob URLs until upload completes.

## 3. Rendering

### Markdown, off the main thread

A **markdown worker** turns text into a sanitized hast tree: remark-gfm, remark-math with
KaTeX output, Shiki highlighting, and rehype-sanitize with an allowlist that admits
`avenire-chart`, `avenire-sim`, `avenire-vis` (stored, in notes and notebooks) and their
declared children (`script[type="avenire/params"]`,
`script[type="avenire/worker"]`). The main thread renders hast → React with
`hast-util-to-jsx-runtime` and maps the custom tags to components.

- **While streaming**, the worker parses incrementally: completed blocks are cached by
  offset, and only the open tail block is re-parsed.
- **A visual tag mounts only once its closing tag has arrived.** Until then the row shows
  a fixed-height placeholder ("Building simulation…"), so half-written HTML never runs.
- Short messages (< ~2 KB, no math or code) parse synchronously to avoid a worker
  round-trip for "Sure!".

### Rows

| Row             | Renderer                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| user message    | plain text with inline file/folder tokens (§6.2) and attachment chips (with upload state)                                                                                                                       |
| assistant prose | worker-parsed markdown; citation chips open the source file at the cited page or timestamp                                                                                                                      |
| tool group      | compact work row; expanding shows sources read in a bounded nested list                                                                                                                                         |
| visual          | `<avenire-chart>` / `<avenire-sim>` / `<avenire-vis>` / `run_python` figure card / video, with a reserved height from the artifact's declared aspect ratio, a poster while offscreen, and an "open full" action |
| request         | inline card; when pending, also docked above the composer (§6.3)                                                                                                                                                |
| subagent        | grouped card (§7)                                                                                                                                                                                               |
| cloud run       | live card subscribed to the run: status, progress, artifacts when done                                                                                                                                          |

## 4. Virtualization

Use `@legendapp/list` on web (`@legendapp/list/react`) and mobile
(`KeyboardAwareLegendList`), as t3code does:

- `keyExtractor = row.id`, `getFileType = row.kind`, `estimatedFileSize` ≈ 90 (web) /
  180 (mobile), measured variable heights, `maintainVisibleContentPosition`.
- **Follow latch:**
  - `maintainScrollAtEnd` applies only while following.
  - Any user scroll, wheel, touch or key navigation turns following off; a "jump to
    latest" pill turns it back on.
  - A 40 px tolerance avoids flicker as content grows.
  - A newly sent user message anchors near the top while the reply streams.
- **History paging:** "load earlier" prepends a page, deduplicated by message id, with the
  scroll anchor kept on the first visible row.
- **Scroll restore per thread:** row id + offset within the row.
- **Visuals:** a simulation's iframe and worker are created when the row enters the
  viewport (plus one screen of overscan) and paused, then torn down, when it leaves. The
  poster frame keeps the height stable.

## 5. Right-side message track

`TimelineMinimap` equivalent, web/desktop only:

- One tick per user message. Hovering previews that question and the start of Ava's
  answer; clicking calls `scrollToIndex` on that row; ↑/↓ buttons step between turns.
- On scroll, compare measured row positions with the viewport to mark ticks in view and
  the current turn. Mutate only data attributes, and animate with transform/opacity.
- Width is capped to the gutter so it never covers text. Hidden when a thread has fewer
  than ~4 turns.

## 6. Composer

### 6.1 Shape: one line that grows into a block (from v1, made smooth)

v1's composer has two layouts:

- **Inline**, for a short prompt: `[+] [ text … ] [⚡] [mic] [send]` in a single pill row.
- **Stacked**, once the text wraps: the textarea takes the full width on top, and a footer
  row below holds `[+]` on the left and `[⚡] [mic] [send]` on the right. It grows to
  160 px, then scrolls internally.

v1 switches with `isMultiLine = textarea.scrollHeight > 40`, measured on every input change.
That has two problems, and t3code's scroll-position-driven version is jankier still:

- **No hysteresis.** The measurement uses the textarea's _current_ width. After stacking,
  the textarea is wider, so deleting a few characters collapses it. In the inline layout
  it's narrower again and may wrap, and since the layout flip itself doesn't re-measure,
  the composer sits in the wrong state until the next keystroke and then flips back.
- **No animation.** The controls jump between rows, and only the attachment tray animates.

v2:

- **Measure against a fixed reference, not the live layout.** A hidden mirror element with
  the inline layout's text width measures whether the content fits on one line. The
  composer **stacks** when the content would wrap at inline width or contains a newline.
  It **unstacks** only when the content fits at inline width minus a ~24 px margin. That
  gap is the hysteresis, so typing at the boundary never oscillates.
- **Animate the switch.** The pill, textarea and control group are `motion` elements with
  `layout` (FLIP), using v1's `springs.moderate` with `bounce: 0`. The controls glide from
  the end of the line to the footer row, and the pill's height and corner radius
  interpolate. Height growth inside the stacked layout uses the same spring, not a CSS
  `height` transition fighting the layout animation.
- Honour `prefers-reduced-motion` (instant switch), and keep caret and focus across the
  switch: the textarea node is never remounted, only re-parented visually through layout.
- Mobile uses the same rule with RN Reanimated layout transitions.

### 6.2 Input: TipTap with a token grammar

Use TipTap (as t3code does) so references are real inline tokens, not text:

- `@` opens a picker for files and notebooks; picking one inserts a mention
  node that renders as a chip.
- `/` opens commands that set intent (`/quiz`, `/explain`, `/flashcards`, `/summarize`).
- Pasting a URL offers to turn it into a capture token.
- **Serialization:** the editor produces `{ text, references[] }`. The text carries stable
  placeholders (`@[file:itm_…]`) and the references are sent as a typed message metadata
  field, so Ava gets both the user's wording and exact ids.
- Draft persistence per thread stores the TipTap JSON (Zustand `persist` on web, device
  storage on mobile).

### 6.3 Controls

- No model or thinking pickers.
- **Fast** (⚡): a lighter model and a shorter tool budget for quick answers.
- **Full access:** the user's call. Turning it on overrides the approval protection, and
  Ava applies file actions in this thread without asking (`ruth.setFullAccess`, stored on
  the thread; a settings default for new threads). Actions still log to the thread and
  stay undoable, and delete still means archive. Approvals are on until the user changes
  it, and a persistent badge shows while Full access is on.
- Voice input (mic) as in v1.
- While Ava is working: Stop. Sending again queues the message for after the turn.

### 6.4 Attachments never block send

Matching ChatGPT (and replacing v1, which held the submission until every upload finished):

1. Attaching a file **starts the upload immediately**. The client gets an `attachmentId`
   and a pre-signed storage key, and the chip shows progress.
2. **Send is always enabled.** The message is sent at once with `file` parts referencing
   `attachmentId`s, and appears in the timeline with chips still uploading.
3. **The server waits, not the user.** Before building the model prompt, the turn awaits
   each referenced attachment's `uploaded` signal (bounded, around 60 s). Text-only work
   (search over existing material) can start meanwhile.
4. **Failure is per attachment.** A failed upload marks its chip on the _sent_ message
   with Retry. The turn continues without it, and Ava is told the attachment didn't
   arrive. Retrying adds it to a follow-up turn.
5. Uploads continue if the user switches threads, and they're tracked in a small upload
   store outside the composer.

### 6.5 How the composer asks for input

As in t3code's `ComposerPendingApprovalPanel` / `ComposerPendingUserInputPanel`, a banner is
docked **above** the composer, never replacing it, so the draft is preserved.

- **File action** (an `approval-requested` tool part): shows what will change (move,
  rename, archive, create note) with a preview (target folder, new title, note excerpt),
  plus Approve / Decline. The turn continues once it's answered. Hidden in Full access
  mode.
- **Question** (an `ask_user` tool part, from Ava or a subagent): one question at a time,
  with choice buttons and optional free text. It shows a progress indicator if there are
  several, and an origin label for subagents. Free-form study questions are answered in
  the normal composer, not the banner.
- Stale requests (from a turn that can no longer continue) say so instead of offering
  buttons.

## 7. Subagents and background work

Ava does delegate. The **video agent** is the first subagent (see the widget-renderer
vision §4.5), and nightly Cloud runs may fan out per folder later.

- **In the timeline**, a `data-subagent` part renders as t3code's grouped card: avatar or
  icon stack, count, status summary and elapsed time. It expands into per-agent rows
  showing the current stage (planned → preview → checks → final N/M → uploading). A row
  opens the subagent's transcript in a side sheet.
- **When the subagent finishes**, its card turns into the produced visual row (the video),
  with a link back to the transcript.
- **Ava Cloud runs** render as `data-cloud-run` cards linked to the run detail (live
  status, recording, artifacts). The shell shows a small "Ava Cloud" indicator while a run
  is active, with a sheet listing runs (like t3code's `ThreadAgentsSheet`).

## 8. Performance checklist

- Markdown, math and highlighting run in the markdown worker; chart layout and drawing run
  in the chart worker; simulation models run in per-widget workers.
- Memoize every row component, and give rows narrow subscriptions (the run card subscribes
  only to its run, the subagent card only to its part).
- Mount heavy visuals only near the viewport; pause offscreen; tear down beyond overscan.
- Expanded tool details live in a nested virtualized list.
- Timers (elapsed labels) are isolated components so they don't re-render rows.
- Mobile: React Native has no Web Workers. Markdown parses on the JS thread with the same
  incremental cache, simulations run in a WebView (a separate process), and charts render
  with Skia.

## Source map

- **t3code composer:** `apps/web/src/components/chat/ChatComposer.tsx`,
  `ComposerPromptEditorTiptap.tsx`, `composerDraftStore.ts`,
  `ComposerPendingApprovalPanel.tsx`, `ComposerPendingUserInputPanel.tsx`.
- **t3code timeline:** `apps/web/src/session-logic.ts`,
  `components/chat/MessagesTimeline.tsx`, `MessagesTimeline.logic.ts`,
  `timelineMinimapFiles.ts`, `timelineScrollAnchoring.ts`, `components/ChatMarkdown.tsx`.
- **t3code mobile:** `apps/mobile/src/features/threads/ThreadFeed.tsx`,
  `thread-subagent-group.tsx`, `ThreadAgentsSheet.tsx`, `PendingApprovalCard.tsx`.
- **v1 composer and chat:** `context/avenire/apps/web/src/components/chat/multimodal-input.tsx`
  (inline/stacked layout, `springs`), `message-row.tsx`, `lib/chat-tool-approval-policy.ts`,
  `app/api/chat/route.ts` (AI SDK approval flow).
- **Research notes:** `context/_notes/t3-composer.md`, `context/_notes/t3-timeline.md`.
