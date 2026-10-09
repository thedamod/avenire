# Ruth and Ruth Cloud — architecture

Ruth is Avenire's agent. It comes in two forms that share one tool backbone:

- **Ruth** (chat): an AI SDK `streamText` turn, streaming into the chat. Short-lived compute in
  an ephemeral Daytona sandbox; file actions gated by approvals; widgets rendered inline.
- **Ruth Cloud**: the Pi agent harness running in a **persistent, per-user Daytona sandbox**
  for scheduled and long-running work. It reaches the user's library only through retrieval
  and on-demand hydration, publishes results as new items, and proposes changes to originals
  for a morning review.

Both import their tools from `@avenire/ruth-kit`: one definition per tool (schemas,
permission policy, execution, logging), adapted to the AI SDK for chat and to an HTTP gateway
plus a Pi extension for Cloud.

```mermaid
flowchart LR
  subgraph Client["Web / desktop / mobile"]
    Chat["Chat (useChat)"]
    Frame["WidgetFrame<br/>(@avenire/viz)"]
  end

  subgraph Server["Avenire server (apps/web + packages)"]
    ChatRoute["/api/ruth/chat"]
    Ruth["Ruth turn<br/>(@avenire/ai, AI SDK)"]
    Kit["@avenire/ruth-kit<br/>tool defs · policy · selectors · logging"]
    Gateway["/api/ruth-cloud/tools/:name<br/>(run-token auth)"]
    Cloud["RuthCloud orchestrator<br/>+ task scheduler"]
    Retrieval["Retrieval<br/>(@avenire/ingestion)"]
    Storage["Storage (files-sdk)"]
    DB[("Postgres")]
    WidgetHost["widgets.&lt;domain&gt;/w/:token<br/>CSP sandbox"]
  end

  subgraph Daytona
    Eph["Ephemeral chat sandbox<br/>(per thread, hard cap)"]
    Box["Persistent Ruth Cloud box<br/>(per user, auto-stop)<br/>Pi + avenire extension<br/>/workspace/inputs (cache)"]
  end

  Chat -- "message + page" --> ChatRoute --> Ruth --> Kit
  Kit -- sandbox_* --> Eph
  Kit --> Retrieval
  Kit --> Storage
  Kit --> DB
  Ruth -- "render_widget → {widgetId,url}" --> Chat
  Frame -- "iframe src (opaque origin)" --> WidgetHost --> Storage
  Cloud -- "start, secrets, pi -p --mode json" --> Box
  Box -- "retrieve / download / hydrate / publish<br/>(Bearer run token)" --> Gateway --> Kit
  Kit -- "hydrate_files: bytes pushed via Daytona fs" --> Box
  Cloud -- "report message + pending_approval" --> DB
```

## 1. The shared package: `@avenire/ruth-kit`

A tool is defined once:

```ts
interface ToolDef<I, O, R> {
  name: string;                      // snake_case, identical in chat and in Pi
  description: string;
  input: Schema.Codec<I>;            // Effect Schema; JSON Schema derived for the model / Pi
  output: Schema.Codec<O>;
  agents: ReadonlyArray<"ruth" | "ruth-cloud">;
  /** `gateway` scope a Ruth Cloud run token must hold (cloud tools only). */
  scope?: "retrieval" | "download" | "hydrate" | "publish";
  approval: "never" | "unless-full-access";
  execute: (input: I, ctx: AgentContext) => Effect.Effect<O, RuthToolError, R>;
}
```

- `AgentContext` = `{ userId, agent: "ruth" | "ruth-cloud", threadId?, runId?, fullAccess }`.
  Every query is scoped by `ctx.userId`; nothing takes a user id from model input.
- `RuthToolError { tool, code, message, recoverable }` with codes `invalid_input`,
  `not_found`, `forbidden`, `denied`, `conflict`, `timeout`, `quota_exceeded`,
  `sandbox_unavailable`, `failed`. Messages are written for the model ("The sandbox could not
  start; try again or answer without running code"). Defects become a generic message.
- **Logging:** every call is wrapped in a span `RuthTool.<name>` and one structured log line
  plus an `Analytics` event `ruth_tool_call` with `{ tool, agent, userId, threadId, runId,
  outcome, errorCode, durationMs }`. Inputs are not logged (they can contain the user's text).
- **Adapters:**
  - `toAiSdkTools(defs, ctx, services)` → AI SDK `tool()`s. `approval: "unless-full-access"`
    maps onto the AI SDK 7 approval flow (pending state is the tool part's
    `approval-requested`; denial reaches the model as a denied tool result).
  - `gateway` → `handleToolCall({ token, name, input })` for the HTTP route: verify the run
    token, check the tool is a cloud tool within the token's scopes, decode, execute with a
    `ruth-cloud` context, encode. `toolManifest()` returns `{ name, description,
    inputJsonSchema }[]` for the Pi extension.
  - `pi/avenire-extension.ts`: a static Pi extension (TypeBox via `Type.Unsafe(jsonSchema)`)
    that fetches the manifest at start-up and registers each tool; `execute` POSTs to the
    gateway with `Authorization: Bearer $AVENIRE_RUN_TOKEN`.

### Tools

| Tool | Ruth | Cloud | Approval | Notes |
| --- | --- | --- | --- | --- |
| `search_materials` | ✓ | ✓ (retrieval) | never | multi-lane retrieval, unchanged ranking |
| `list_files` | ✓ | ✓ (retrieval) | never | clusters act as folders; `inbox` pseudo-folder |
| `find_files` | ✓ | ✓ (retrieval) | never | metadata + time + topic via the shared `FileSelector` resolver |
| `read_file` | ✓ | ✓ (download) | never | extracted text by chunk range (replaces `read_item`) |
| `write_file` | ✓ | — | unless-full-access | new note item in a cluster |
| `move_file`, `rename_file` | ✓ | — | unless-full-access | |
| `archive_file` | ✓ | — | unless-full-access | "delete" = archive; purged after 30 days. No permanent delete exists |
| `sandbox_exec`, `sandbox_write`, `sandbox_read`, `sandbox_download_artifact`, `sandbox_close` | ✓ | — | never | ephemeral chat sandbox |
| `render_widget` | ✓ | — | never | → `{ widgetId, url }` |
| `get_page_context`, `load_skill`, `ask_user` | ✓ | — | never | unchanged |
| `hydrate_files` | — | ✓ (hydrate) | never | selector → files pushed into `/workspace/inputs` |
| `publish_output` | — | ✓ (publish) | never (outputs are new items; changes to originals become pending syncs) |
| `publish_report` | — | ✓ (publish) | never | the run's report markdown + artifact paths |

Ruth Cloud has no write/move/rename/archive tool: it **never writes to originals**. A changed
copy of an original is published with `publish_output({ sandboxPath, replaces: itemId })` and
becomes a `pending_approval` sync that the user accepts or skips in the morning.

`run_python` and `propose_file_action` are removed. A single script is `sandbox_write` then
`sandbox_exec`.

## 2. Ruth (chat)

- **Sandbox (`@avenire/cloud/chat-sandbox`, `ChatSandboxes`).** One sandbox per thread,
  created lazily on the first `sandbox_*` call (labels `app=ruth-chat, userId, threadId`).
  Resources 2 vCPU / 4 GB / 5 GB disk; network blocked except the package-index allow list
  (`CHAT_SANDBOX_NETWORK_ALLOW_LIST`); `autoStopInterval` 15 min + `autoDeleteInterval` 0 as
  the safety net; a **hard wall-clock cap** (60 min from creation) after which a sweeper
  deletes it regardless (the sweeper lists by label, so it survives restarts). Per command:
  120 s default, 900 s max; tool output to the model capped at 64 KB, `sandbox_read` at 1 MB,
  artifacts at 50 MB. The prompt tells Ruth to call `sandbox_close` when the task is done
  unless it is waiting for the user, and to close it after that follow-up.
  Daily quota: 60 sandbox-minutes per user (`sandbox_usage`), 3 concurrent chat sandboxes.
  Nothing a sandbox produces is written to the database.
- **Downloads.** `sandbox_download_artifact({ path })` copies the file to
  `users/<id>/.avenire/tmp/artifacts/<expiresOn>/<artifactId>/<name>` (7-day TTL, swept
  nightly) and returns a signed URL plus a `file` part for the message.
- **Files.** The library is items in clusters; clusters act as folders. Tools work on items,
  not raw bucket keys (the Files SDK's own AI tools address raw keys, which would bypass items
  and indexing and expose the storage layout); the Files SDK remains the storage layer, and
  the approval mechanism is the same AI SDK flow the Files SDK tools use.
- **Widgets** (§4).

## 3. Ruth Cloud

### Tasks and runs

A `cloud_task` is `{ title, prompt, schedule, timeZone, preHydration[], delivery, enabled }`
where `schedule` is `{ type: "cron", expression }` or `{ type: "once", at }` (Effect
`Cron`, evaluated in the task's time zone). The old nightly digest is the built-in task
`nightly-digest` (cron `0 3 * * *`, pre-hydration "files touched today", email on).

The scheduler ticks every minute, creates `cloud_run` rows for due tasks (unique per
`taskId, scheduledFor, attempt`), and starts them under a global and a per-user concurrency
limit (2 concurrent runs per user). A run:

1. mints a run token (§3.4) and writes it into the user's Daytona secret;
2. starts (or creates) the user's box and writes `/workspace/.avenire/run.json`
   (`runId`, `apiBaseUrl`, task prompt);
3. applies the task's pre-hydration rules;
4. runs `pi -p --mode json --no-session --extension /opt/avenire/pi/avenire.ts
   @/workspace/.avenire/prompt.md` as an async Daytona session command, tailing its JSON
   events into the run log, under a 4-hour wall clock;
5. on exit, collects the report (from `publish_report`, else a fallback summary), stops the
   recording, posts the report to the user's **Ruth Cloud thread**, sends the email if
   enabled, revokes the token, and lets the box auto-stop (15 min idle).

Infrastructure failures (box start, Pi crash, timeout) retry with backoff up to
`maxAttempts` (default 2); a run whose agent reports failure does not retry.

### Hydration

`hydrate_files({ selector, maxFiles, maxBytes })`:

```ts
FileSelector = {
  time?: { since?, until?, lastDays?, today?, events?: ("opened"|"edited"|"captured"|"uploaded")[] },
  topic?: { query, minRelevance? },
  filters?: { kinds?, clusterIds?, tags?, sources? },
  explicit?: { itemIds?, clusterIds?, captureIds? },
}
```

Parts combine with AND ("PDFs on thermodynamics touched this week" =
`topic` ∧ `filters.kinds` ∧ `time.lastDays: 7`). Resolution: metadata candidates from SQL
(`item`, `item_event`, `capture`, `item_cluster`), then, if `topic` is set, retrieval restricted
to those item ids, scored per item by its best chunk relevance. Each returned file carries a
`reason` ("edited 2026-10-08 · matches 'thermodynamics' 0.82").

Files are pushed by the server into `/workspace/inputs/<cluster>/<title>.<ext>` through the
Daytona API (the sandbox never holds storage credentials). Hydration is idempotent: a file
whose `contentHash` matches `cloud_workspace_file` is skipped. Count and byte caps apply
(defaults 200 files, 1 GB per call), the workspace is an LRU/age cache capped at 10 GB (files
used by the current run are never evicted), and every call is recorded in `cloud_hydration`
with its selector, trigger (`pre-hydration` or `agent`) and manifest.

**Why on-demand hydration.** Copying a user's whole library into a sandbox would be slow,
expensive and a needless exposure of material the task never touches. Hydrating by selector
keeps the workspace small, makes every run's inputs auditable, and lets Ruth Cloud widen its
inputs when it discovers it needs more. **The trade-off:** Ruth Cloud can only reach what
retrieval and metadata can find. A file with poor extraction, no events, or a misleading
title may never be hydrated, so retrieval quality bounds Ruth Cloud's reach. Mitigations:
explicit selectors (item, cluster, capture), the hydration log in every report (so a miss is
visible), and the same retrieval engine and benchmark as chat Ruth.

### Publishing and the morning review

- `publish_output({ sandboxPath, title? })` uploads the file as a **new item** in the run's
  cluster ("Ruth Cloud · <date> · <task>"), `source = "ruth-cloud"`, queued for indexing.
- `publish_output({ sandboxPath, replaces: itemId })` stores the bytes under
  `users/<id>/.avenire/cloud/<runId>/sync/` and creates a `pending_approval` (`kind = "sync"`)
  with the hydrated `baseHash`. If the original changed since hydration it is flagged
  `conflict` at publish time and re-checked at accept time.
- The review is backend-only for now: `cloud.listPendingApprovals`, `cloud.resolveApproval
  ({ id, decision: "accept" | "skip" })`, `cloud.resolveRun({ runId, decision })`. Accepting
  writes the new bytes to the original, bumps `contentHash` / `contentModifiedAt`, records an
  `edited` event and re-indexes. Nothing touches originals until accepted.

### Secrets, tokens and egress

- **Model key:** a dedicated, spend-limited, revocable key stored as a Daytona organisation
  secret (hosts: the model provider), mounted as `ANTHROPIC_API_KEY`. The sandbox only sees
  Daytona's placeholder; the real value is substituted at egress.
- **Run token:** 32 random bytes, stored hashed in `cloud_run_token` with
  `{ userId, runId, scopes: [retrieval, download, hydrate, publish], expiresAt = run cap }`,
  written into the user's Daytona secret `ruth-cloud-token-<userId>` (hosts: the API host),
  mounted as `AVENIRE_RUN_TOKEN`, revoked (and the secret rotated) when the run ends.
- **API base URL:** a plain value in `run.json`, not a Daytona secret. Daytona substitutes a
  secret only inside requests to its allowed hosts, so a placeholder cannot stand in for the
  host itself. It isn't sensitive; in development it points at a tunnel.
- **Egress:** `networkAllowList` = model provider + API host CIDRs (`RUTH_CLOUD_EGRESS_CIDRS`).
- Pi is pinned (`@earendil-works/pi-coding-agent@0.83.0`) in the box snapshot.

## 4. Widgets

- `render_widget({ title, html })` validates size (≤ 512 KB), wraps the document with the
  **widget bootstrap** (theme variables for first paint, the theme-update listener, the height
  reporter, a CSP `<meta>`), stores it at `users/<id>/.avenire/widgets/<widgetId>.html`
  (never expires; not an item) and returns `{ widgetId, url }` where `url` is
  `https://widgets.<domain>/w/<token>` and `token` is an HMAC-signed `(userId, widgetId)`.
- The widget origin serves only `/w/:token` (and later `/kits/*`), with
  `Content-Security-Policy: sandbox allow-scripts; default-src 'none'; script-src
  'unsafe-inline' <widget-origin>/kits/; style-src 'unsafe-inline'; img-src data: blob:;
  font-src data:; media-src data: blob:; connect-src 'none'; frame-ancestors <app origins>`.
- `<WidgetFrame>` (`@avenire/viz`) renders it in an iframe with `sandbox="allow-scripts"`
  (opaque origin), reserves height, accepts messages only from its own `contentWindow` and
  only if they decode against the protocol schema, posts theme updates when the app theme
  changes, and shows an error state (load timeout, runtime error) instead of a blank frame.
- **Tokens** are defined once in `packages/ui/src/styles/globals.css` (colours, fonts,
  spacing, type scale, chart palette, radius) and generated into `tokens.ts` for the server
  (tool description, first-paint injection) and the client.
- Later, chart/simulation kits are served from `<widget-origin>/kits/*` and inline
  `<avenire-chart>` / `<avenire-sim>` compile to the same stored-widget path: one frame, one
  security model.

## 5. Library metadata

`item` gains `source` (`upload` | `capture` | `ruth` | `ruth-cloud`), `contentModifiedAt`,
`tags text[]` and `archivedAt`. `item_event` records `opened` (from `ItemDetail` via
`library.recordItemEvent`), `edited`, `captured` and `uploaded`. `Retrieval.search` gains
`itemIds` and a time filter. These power "what did I study today" and time-based selectors.

## 6. Limits (defaults; plan tiers later)

| | Chat sandbox | Ruth Cloud |
| --- | --- | --- |
| Resources | 2 vCPU · 4 GB · 5 GB | 4 vCPU · 8 GB · 20 GB |
| Time | 120 s/command (900 max), 60 min hard cap | 4 h/run, auto-stop after 15 min idle |
| Output | 64 KB to model, 1 MB read, 50 MB artifact | 200 files / 1 GB per hydration, 10 GB workspace |
| Per user | 60 sandbox-minutes/day, 3 concurrent | 2 concurrent runs |
