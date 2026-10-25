# Avenire mobile build: shared brief

Every agent working on `apps/mobile` reads this first.

## What we are building

The Avenire phone app (Expo 57, React Native 0.86, uniwind/Tailwind v4, `@react-navigation/native-stack`)
built screen by screen from the Paper designs. The existing screens in `apps/mobile/src/features`
(Today, Inbox, Folders/Clusters, Search, Ruth tab) are an outdated skeleton: replace them.

**Source of truth = Paper.** File `01M5A26NEVB5HPNE8V8V35JSDH` ("Avenire"), page `p-2-0` ("Mobile").
You have the Paper MCP. Before building a screen, call `get_screenshot` on its artboard and
`get_jsx` (`includeNodeIds: false`) / `get_computed_styles` on the parts you build. Take exact sizes,
colours, radii, spacing and copy from there. Never eyeball values from a screenshot. Read-only:
never write to Paper.

The generator that produced those artboards is a second, readable copy of the same values:
`/home/apollo/.t3/projects/home-apollo-avenire/design/mobile/` (`lib.mjs` = tokens, icons and
building blocks; `screens-home.mjs`, `screens-report.mjs`, `screens-rest.mjs` = screens;
`screens/M*.html` = rendered fragments). Use it to understand structure; when it and Paper disagree,
Paper wins.

Artboards (390×844 phone frames; ids = Paper node ids):

| Screen | Node | Screen | Node |
|---|---|---|---|
| M00 read-me (navigation rules) | 3M8-0 | M19 Citation → video at 18:40 (half sheet) | 58B-0 |
| M01 Home · morning toast | 3NV-0 | M20 Citation → image region | 5AL-0 |
| M02 Home · failed overnight run | 3S3-0 | M21 Chat · generated figure + video | 5D6-0 |
| M03 Home · Notes tab | 3VF-0 | M22 Mid-chat approval (composer tray) | 5FW-0 |
| M04 Home · Sources › Unfiled | 3Y9-0 | M23 Mid-chat question (composer tray) | 5IA-0 |
| M05 Home · Sources › processing / needs you | 41P-0 | M24 Chats and Tasks · see all | 5KJ-0 |
| M06 Home · empty first run | 45H-0 | M25 Task detail · failed run | 5NL-0 |
| M07 Search results vs Ask Ruth | 480-0 | M26 Ruth Cloud · schedule overnight task (sheet) | 5PY-0 |
| M08 Ask Ruth · streaming | 4CA-0 | M27 Filing · select sources, icon dock | 5SS-0 |
| M08b Ask Ruth · answer, save to notebook | 4EJ-0 | M28 Filing · move to notebook (sheet) | 5VG-0 |
| M09 Notebook · Thermodynamics | 4GT-0 | M29 Filing · review Ruth's clusters | 5Y6-0 |
| M10 Note · Entropy and the second law | 4JL-0 | M30 Settings (tall) | 60P-0 |
| M11 New notebook (sheet) | 4L3-0 | M31 Trash · selection dock | 657-0 |
| M12 Morning report · chat | 4OE-0 | M32 Onboarding · Welcome (wordmark) | 67R-0 |
| M13 Morning report · Summary sheet | 4SM-0 | M33 Onboarding · About you | 67S-0 |
| M14 Quiz answered with feedback | 4US-0 | M34 Onboarding · Your morning | 67T-0 |
| M15 Quiz score | 4X4-0 | M35 Onboarding · Notifications | 67U-0 |
| M16 Widget (Raptor 2), full height | 4ZH-0 | M36 Onboarding · Capture is on your computer | 67V-0 |
| M17 File changes expanded | 50U-0 | M37 Onboarding · You're set | 67W-0 |
| M18 Citation → PDF p.11 (half sheet) | 55X-0 | | |

## Design system (non-negotiable)

- **Dark only** for this round. bg `#0B0B0B`; surfaces `#111` / `#161616` / `#1C1C1C` / `#242424`;
  sheet `#131313`; text `#EDEDED` / `#A3A3A3` / `#6E6E6E`; hairlines `#222` / `#2E2E2E`.
  Accent periwinkle `#ABC4FF` (text `#C2D4FF`, tint `#151B2B`, line `#2E3B5E`, on-accent `#0B1020`).
  The accent is for Ruth only (Ask Ruth, send button, Ruth working, cited passage). Signals red
  `#FF6B6B`, green `#6BE0A0`. Notebook covers are the only saturated colour.
- Type: the platform system font (SF on iOS) for everything; Geist Mono only where Paper uses it
  (metadata on notebook covers, figure labels, keycaps, timestamps that Paper sets in mono).
- Radii stay small (4/6/8/10) except: composer capsule 24 (t3code ComposerSurface), sheets' top
  corners, round glass header buttons, pill chips.
- Buttons: primary h32 r8 bg `#EDEDED` text 13/500 `#0A0A0A`; ghost/text-link `#A3A3A3`.
  Inputs h36 r8 `#161616` border `#2E2E2E` (focus border `#ABC4FF`). Chips h26 pill border `#2E2E2E` 12px.
- **No nested rounded cards.** Inside sheets use flat structures: left-rule asides (2px left border,
  no bg, no radius), hairline-divided lists, 32px r8 buttons for options. No decorative badges, no
  text file-type badges (PDF/VIDEO): use the line icon per type, or the site favicon for web sources.
- Selection docks are icon-only with a count label. Review screens are plain lists.
- Composer tray (file changes, approvals, questions, errors): ONE tray attached to the top of the
  composer: `#141414`, 1px `#2A2A2A`, no bottom border, r16 top only; header = 15px tone icon +
  14/600 title + 12px `#6E6E6E` meta + chevron; hairline rows; actions right-aligned 32px r8 with one
  white primary. The composer stays visible under it.
- Icons: port the 16-grid line icon paths from `design/mobile/lib.mjs` (`P` map) into one `Icon`
  component (react-native-svg, stroke 1.3–1.5, `currentColor`-like `color` prop). Do not swap in a
  different icon family.

## Navigation (from M00, copies t3code mobile)

No sidebar and no tab bar. Home is the root list; notebooks, notes, chats, tasks, settings and trash
push on top of it with a back button. Glass header: round glass back button · centred title +
subtitle · one or two trailing round glass buttons; more actions live in a `···` menu. Desktop
right-pane content (summary, quiz, revision, widget, cited PDF/video/image) opens as a sheet over the
chat: citations at half height (answer stays visible), outputs at full height. Use native-stack
`presentation: "formSheet"` with `sheetAllowedDetents` (t3code does this) for route-level sheets.

Reference implementation for patterns (read, don't copy blindly; it is a different product):
`/home/apollo/avenire/context/t3code/apps/mobile` (GlassSurface, ComposerEditor, ControlPill,
ThreadComposer, sheets, AppText).

## Motion

Follow Emil Kowalski's rules in `/home/apollo/avenire/context/emil-skills` (`emil-design-eng`,
`review-animations/STANDARDS.md`, `animate/RECIPES.md`). Every overlay animates in and out; ease-out
for entering, durations 150–250ms, drawer ease `cubic-bezier(0.32, 0.72, 0, 1)`; press feedback is a
subtle scale (0.97) not an opacity flash; long scroll areas (threads, chats, lists) get top/bottom
edge fades. Use `react-native-reanimated`.

## Data

Real data through the existing RPC client: `apps/mobile/src/state/api.tsx` + `src/lib/useRpc.ts`
(`@avenire/client-runtime/rpc`, contracts in `packages/contracts`). The web app
(`apps/web/src/features/*`) shows which RPCs back each surface (home, library, notebook, notes, chat,
tasks, trash, settings, onboarding); mirror its calls, don't invent endpoints. If a surface has no
backend yet, build the UI with a typed local fixture behind the same hook shape and say so in your
final report.

## Engineering rules

- TypeScript strict; `pnpm --filter @avenire/mobile typecheck` must pass.
- Install native deps with `npx expo install <pkg>` from `apps/mobile` so versions match Expo 57.
- Components live in `apps/mobile/src/ui/` (design-system primitives, no data) and
  `apps/mobile/src/features/<area>/` (screens + feature components). Reuse `src/ui`; if you need a
  new primitive, add it to `src/ui` only if you own it, otherwise keep it local to your feature and
  mention it in your report.
- Stay inside the files you were assigned. Other agents work in the same checkout at the same time.
  Never touch `apps/web`, `apps/desktop` or `packages/*`. Never run `git add -A`, `git commit`,
  `git stash`, `git checkout -- .` or anything that touches files you don't own.
- Effect code: keep it plain and small (no needless generators, no duplicated helpers).
- **No browsers.** Don't open preview tabs, browsers or `expo start --web` dev servers, and don't
  leave long-running processes behind. Verify with typecheck and `npx expo export --platform web`
  (builds cleanly), and compare your JSX/styles against Paper via `get_jsx` / `get_computed_styles`.
  The orchestrator does one visual pass of the finished app at the end.
