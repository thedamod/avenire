# Avenire v2 frontend: shared spec for every agent

Read this before touching `apps/web`. The design source is the Paper file "Avenire"
(desktop page + mobile page). Exports live next to this file:

- `desktop/*.png`: 1440-wide desktop screens. File names start with the Paper screen number.
- `mobile/M*.html`: the 390×844 phone screens as static HTML with exact values (open in a
  browser or read the inline styles). `mobile/INDEX.txt` maps ids to names; `mobile/M00.html`
  explains how desktop maps to phone.

## Product model

- **Notebooks** are folders (`library.*Folder*`). Cover colour + line glyph = `Folder.color` / `Folder.cover`.
- **Notes** are markdown files (`LibraryFile.kind === "note"`); body via `library.getNote` /
  `library.saveNote` (optimistic `baseRevision`, Conflict on stale).
- **Sources** are every other file kind (pdf, web-page, video, image, document, audio, selection).
  `placement: "inbox"` is shown as **Unfiled**.
- **Ruth** = the AI. Chat threads (`ruth.*`), Ruth Cloud tasks/runs (`cloud.*`). A run's
  outputs + pending approvals form the **morning report**.
- **Trash** = archived files and notebooks, deleted for good 30 days later (`library.listTrash`).
- Names to keep in UI copy: Notebooks, Notes, Sources, Unfiled, Ask Ruth, Chats and Tasks,
  Accept / Skip, Save to notebook, Morning report.

Contracts are in `packages/contracts/src` (library.ts, ruth.ts, settings.ts, cloud.ts, http.ts,
rpc.ts). Call RPCs with `useQuery` / `useApi` / `call` from `apps/web/src/lib/rpc.ts`. Chat
streams over HTTP at `RUTH_CHAT_PATH`. The ephemeral answer (⌥ Space) is a normal chat thread;
only the UI differs: it shows just the latest reply in the corner, not the whole thread.

## Routes (Next app router, `apps/web/src/app/(app)`)

| Route | Screen (desktop / mobile) | Owner |
| --- | --- | --- |
| `/` | Home: 01, 02, 03, 04, 05, 06, 13b, 17 / M01–M07 | home |
| `/notebooks/[folderId]` | Notebook: 07, 18a / M09, M11 | notebook |
| `/notes/[fileId]` | Note editor: 11 / M10 | notebook |
| `/sources/[fileId]` | Source viewer (`?page=`, `?t=`, `?region=`): 14a–c, 20 / M18–M20 | notebook |
| `/chat`, `/chat/[threadId]` | Chat: 12, 19a, 19b / M21–M23 | chat |
| `/report/[runId]` | Morning report workspace: 08, 08b, 16a–c / M12–M17 | chat (phase 2) |
| `/tasks`, `/tasks/[taskId]` | Chats and Tasks, task detail, schedule sheet: 21a, 21b, 15 / M24–M26 | home |
| `/trash` | Trash: 24a, 24b / M31 | settings |
| `/settings` | Settings: 22 / M30 | settings |
| `/prompt` | Ephemeral Ruth (⌥ Space), also mounted as an in-app overlay: 09, 10 | chat |

Onboarding (23*, M32–M37) is not in this round.

## Ownership (stay inside your folders; ask the orchestrator before editing someone else's)

- **shell + home**: `app/(app)/layout.tsx`, `app/(app)/page.tsx`, `app/(app)/tasks/**`,
  `app/(app)/search/**`, `features/home/**`, `features/library/**` (shared library UI: covers,
  file-type marks, rows, filing/move sheet, new-notebook sheet, selection dock),
  `features/tasks/**`, `features/capture/**`, `components/app/**` (shell primitives),
  `lib/**` hooks. Deletes the old canvas/inbox/today features.
- **chat**: `features/chat/**`, `features/ruth/**`, `features/ephemeral/**`, `app/(app)/chat/**`,
  `app/(app)/report/**`, `app/prompt/**`.
- **notebook**: `features/notebook/**`, `features/notes/**`, `features/sources/**` and their routes.
- **settings**: `features/settings/**`, `features/trash/**` and their routes.
- **backend (Sol)**: `packages/*` except `packages/ui`, `apps/web/src/server/**`,
  `apps/web/src/app/api/**`, `apps/desktop/**`.
- `packages/ui` components: reuse them. If one needs a change, keep it backward compatible
  and mention it in your summary.

## Design rules (owner's, non-negotiable)

- Dark first. bg `#0B0B0B`; surfaces `#111` / `#141414` / `#161616` / `#1C1C1C`; text `#EDEDED`
  / `#A3A3A3` / `#6E6E6E`; hairlines `#222` / `#2A2A2A` / `#2E2E2E`. Use the tokens in
  `packages/ui/src/styles/globals.css`, not raw hex, where a token exists.
- Accent periwinkle `#ABC4FF` is **only for Ruth** (Ask Ruth, Ruth working, cited passage, send).
  Notebook covers are the only other saturated colour.
- App values: title 24/30 600; section 13.5 500; body 13.5/20 muted; primary button h32 r8
  white `#EDEDED` on `#0A0A0A` text; text-link buttons muted; inputs h36 r8; chips h26 pill;
  keycaps Geist Mono 11.5 h24 r6; radius max 10 (composer 24 is the one exception).
- No sidebar, no navbar on home. Chrome only appears when something is open (back arrow +
  breadcrumb at top-left).
- No heavy shadows, no heavily rounded cards nested in sheets/cards: inside sheets use flat
  left-rule asides, 1px divider lists, chips and 32px buttons. No decorative badges.
- File types: neutral line icon per kind, or the site's favicon for web sources. Never text
  badges like PDF/VIDEO/WEB.
- Selection docks are icon-only with a count label. Review screens are plain lists.
- Composer drop-ups (file changes, approvals, questions, errors) all use the one
  `ComposerTray` from `@avenire/ui/components/composer-tray`, attached above the composer.
- Fonts: Geist + Geist Mono.

## Desktop ↔ mobile (one component tree, responsive)

Build every screen once and make it adapt with Tailwind breakpoints (`md` = 768px is the
switch). Phone layout follows the M-screens, desktop follows the PNGs.

- Phone: no sidebar; Home is the root list; everything else pushes with a glass header
  (back · title + subtitle · one or two trailing buttons, more in a ⋯ menu).
- Desktop dialogs and the right pane become bottom sheets on phone (`Sheet side="bottom"`):
  citations at half height, outputs at full height.
- Composer: one capsule at rest on phone (attach · text · send), grows when focused; Search vs
  Ask Ruth become two buttons on the focused composer instead of ⌘ Enter / Enter.
- Long-press selects rows on touch; the icon-only selection dock replaces the composer.
- Capture (⌥C) and the ⌥ Space ephemeral prompt do not exist on phone; the empty state points to
  the computer app. Use `useIsMobile()` from `apps/web/src/lib/responsive.ts` only where layout
  must differ structurally; prefer CSS breakpoints.
- Respect safe areas (`env(safe-area-inset-*)`), 44px touch targets on phone, `100dvh`.

## Performance

- Server data through `useQuery` with stable query keys; mutate then `invalidateLibrary` (or
  update `setData` optimistically). No waterfalls: fetch lists in parallel.
- Memoise list rows; virtualise long lists (> ~100 rows).
- No layout shift on load: skeletons sized like the content.

## Verify before you finish

- `pnpm --filter @avenire/web typecheck` and `pnpm --filter @avenire/ui typecheck` pass.
- `pnpm exec vp fmt <your files>` and `pnpm exec vp lint <your files>`.
- If you can, run the app (`pnpm dev:web`, env from root `.env.local`; never source
  `context/avenire/.env`) and check desktop 1440 and phone 390 widths.
- Do not commit; the orchestrator reviews and commits.
