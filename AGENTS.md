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
  emailer/   Drains the email outbox and serves react-email previews
packages/
  contracts/         Effect Schemas + RPC definitions shared by every surface (no runtime deps)
  shared/            Cross-cutting helpers: ids, PostHog observability
  client-runtime/    RPC client wiring shared by web, desktop and mobile
  database/          Drizzle schema, migrations and the `Database` service
  auth/              better-auth server + clients
  storage/           files-sdk wrapped as the `Storage` service
  cloud/             Daytona sandboxes (ephemeral compute + persistent Ruth Cloud boxes)
  ingestion/         Extract -> chunk -> embed -> cluster, the job queue worker, and hybrid retrieval
  ai/                Ruth (interactive agent) and Ruth Cloud (nightly run), built on the Vercel AI SDK
  emailer/           react-email templates + the `Mailer` service (Resend)
  retrieval-benchmark/  Dataset + runner for retrieval quality (recall@k, MRR, nDCG)
  ui/                shadcn/ui primitives for web and desktop
```

Packages are source-first: `exports` point at `./src/*.ts`, there is no build step, and each
public module is an explicit subpath (no barrels except `@avenire/contracts`).

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
- Model calls, tools and chat streaming use the AI SDK (`ai`, `@ai-sdk/*`), never
  `effect/ai`. Effect stays for services, errors, config and jobs; tool `execute` functions
  run Effect programs against the request's services.
- Ruth Cloud never edits or deletes existing material; it only writes new artifacts.
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
