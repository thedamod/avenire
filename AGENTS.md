# Avenire

Avenire is a "push" knowledge base for students. It captures what you study, organizes it,
and has an agent (Ruth) work on it in the background so results are ready each morning.

It is **not** a flashcard app, a misconception engine, a generic chatbot, a "pull" AI tool,
a super app, or a multiplayer collaboration tool. Every library row is owned by one user.

## Layout

```
apps/
  web/       Next.js app: UI, the RPC + auth endpoints, and the background worker entry
  desktop/   Electron shell around the web server, plus the global capture hotkey
  mobile/    Expo client (React Navigation + Uniwind), talks to web over RPC
packages/
  contracts/         Effect Schemas + RPC definitions shared by every surface (no runtime deps)
  shared/            Cross-cutting helpers: ids, PostHog observability
  client-runtime/    RPC client wiring shared by web, desktop and mobile
  database/          Drizzle schema, migrations and the `Database` service
  auth/              better-auth server + clients
  storage/           files-sdk `Storage` service, file archive/restore, and retention purge
  cloud/             Daytona sandboxes (ephemeral compute + persistent Ruth Cloud boxes)
  ingestion/         Extract -> chunk -> embed -> graph -> folder, the job queue worker, and retrieval
                     (multi-lane RRF, rerank, graph RAG, semantic cache)
  ai/                Ruth chat, shared tools and outputs, Ruth Cloud orchestration + scheduler
  emailer/           react-email templates + the `Mailer` service (Resend); callers send directly, no queue.
                     Preview with `pnpm email:preview`
  retrieval-benchmark/  Dataset + runner for retrieval quality (recall@k, MRR, nDCG)
  ui/                shadcn/ui primitives, widget protocol and sandboxed WidgetFrame
```

Packages are source-first: `exports` point at `./src/*.ts`, there is no build step, and each
public module is an explicit subpath (no barrels except `@avenire/contracts`, and the
folder entry points of `@avenire/ai`).

`@avenire/ai` follows the v1 layout: `models/` (the `ruth-*` registry; never name a provider
at a call site), `prompts/`, `tools/` (`index.ts` holds client-safe specs, the other files
add `execute`), `skills/` (markdown in `sections/`, compiled into `skills.ts` by
`pnpm --filter @avenire/ai skills:generate`; never edit `skills.ts` by hand), `agents/`
(`createRuthAgent` and the durable server-owned Ruth Cloud AI SDK executor), `scheduler/`, and `message-types.ts`.
Shared tool core, specs, implementations, adapters and selectors live in `tools/`;
widget wrapping and the shared asset store live in `outputs/`; hydration, publishing, approval review,
checkpoint journals and workspace paths live in `cloud/`. These modules have explicit subpath exports;
keep specs client-safe and import server execution separately. The widget frame and
React-free protocol live in `@avenire/ui/widget-frame` and `@avenire/ui/widget-protocol`
(`src/widgets/`), respectively.

## Rules

- Wire types live in `@avenire/contracts`. Change the contract first, then follow it through
  the server handlers and every client.
- Server logic is Effect services (`Context.Service`) provided by `Layer`s. Transport adapters
  (Next route handlers, Electron IPC) stay thin: decode, call a service, encode.
- Read `docs/effect.md` before writing Effect code. We are on **effect 4.0.0 stable**; many
  examples online target 3.x or 4.0 release candidates and will not compile.
- Errors are `Schema.TaggedError` classes. Never throw inside Effect code; never `catch` and
  swallow. Map infrastructure errors to domain errors at service boundaries.
- No `process.env` reads outside `Config`. No `console.*` in Effect code; use `Effect.log*`.
- Anything Ruth does that changes the user's files requires an approval by default. The
  user can turn approvals off per thread ("Full access"); then actions apply directly but
  are still logged and undoable. Sandboxed compute and read-only tools never need approval.
- Ruth models are one table in `packages/ai/src/models` (one line per `ruth-*` name, provider call written out; keys via `OPENROUTER_API_KEY` / `FIREWORKS_API_KEY`). To switch a model, edit that line and its capability entry; never add provider maps, id overrides or env flags elsewhere.
- Model calls, tools and chat streaming use the AI SDK (`ai`, `@ai-sdk/*`), never
  `effect/ai`. Effect stays for services, errors, config and jobs; tool `execute` functions
  run Effect programs against the request's services.
- Ruth Cloud never writes to originals without a user-approved sync: it works on copies,
  publishes new files, and proposes changes as pending approvals the user accepts or skips.
- `context/` holds reference repos (t3code, legacy v1, research). Read-only, never imported,
  never committed.

## Commands

```
pnpm install
pnpm typecheck            # every workspace
pnpm --filter <pkg> typecheck
pnpm test
pnpm lint && pnpm fmt
pnpm db:generate          # drizzle-kit generate after schema changes
```

## Ruth computer use and durable Cloud runs

- Chat and Cloud use `agents/factory.ts`, the same AI SDK adapter and tool policy. Models
  resolve registry names from `models/`; task `model` defaults to `ruth-core`.
- `computer`, `screen_read` and `box_*` target the isolated v4 Daytona desktop/workspace.
  Computer tools never require approval; library-changing chat tools retain approval.
  Use the registry's screen profile and inject its exact image/coordinate contract.
- Cloud credentials stay on the server. Never mount model keys, Avenire credentials or
  run tokens in boxes. Default task egress permits npm/PyPI indexes only; `network: open`
  is an explicit task setting. Reapply policy before hydration, including on reused boxes.
- Inputs are copies under `/home/daytona/.avenire/<stable-user-slug>/<folder>/<file>`;
  the input cache cap is 4 GiB. Work/output stays in `workspace/runs/<runId>/out`.
- Claim Cloud runs with fenced leases. Commit canonical assistant/tool-call messages
  before executing tools; journal each result by `(runId, toolCallId)`. Reclaim expired
  leases and resume checkpoints. Preserve commands on worker shutdown.
- The loop is manual (one streamed `streamText` step at a time, tools without `execute`);
  handle every `finishReason`. Execution stays in the worker: it appends UI message chunks to
  `cloud_run_event`; `/api/ruth/cloud` (start) and `/api/ruth/cloud/[runId]/stream` (replay and
  tail) only enqueue and read. Never run the loop in a request.
- The agent chooses when to record with `screen_record`; the executor never records on its own,
  it only finalises a recording the agent left running.
- `box_command_start` uses deterministic Daytona session ids; reconnect on resume.
  Publish/hydrate/asset ids are deterministic by tool call. Reconcile uncertain computer
  actions with a fresh screenshot; do not silently rerun an uncertain `box_exec`.
- Recording download streams to a temporary file, then streams into AssetStore; never
  buffer an entire recording. Clean temporary files and stop the box after final delivery.
- The conformance harness's `--mock` mode makes zero real-model calls. Real OpenRouter
  conformance runs require owner authorization; always delete its temporary sandbox.
