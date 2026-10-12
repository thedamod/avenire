# Ruth and Ruth Cloud architecture

Ruth chat and Ruth Cloud share the server-owned AI SDK agent factory, model registry,
tool adapter, policy and image transport. Daytona is a tool target: it runs shell jobs,
files, browser/native applications and the desktop recorder. No model key, run token,
Avenire API credential or agent loop runs inside the box.

```mermaid
flowchart LR
  Chat[Web / desktop / mobile chat] --> Ruth[Ruth chat stream]
  Scheduler[Task scheduler + fenced leases] --> Cloud[Ruth Cloud checkpoint executor]
  Ruth --> Factory[Shared AI SDK factory / OpenRouter registry]
  Cloud --> Factory
  Factory --> Tools[Tool specs / policy / Effect executors]
  Factory --> Models[OpenRouter model calls on server]
  Tools --> Ephemeral[Per-thread v4 chat sandbox]
  Tools --> Persistent[Per-user persistent v4 Cloud box]
  Tools --> Library[User-scoped library / retrieval / storage]
  Cloud --> DB[(Canonical messages / tool journal / usage)]
  Persistent --> Recording[Streamed session video asset]
  Cloud --> Review[Report / new files / pending sync review]
```

## Shared agent stack

`agents/factory.ts` chooses agent kind, system prompt, registry model, image transport,
step limit and bound tools. Chat streams its UI response through AI SDK `streamText`;
Cloud calls AI SDK `generateText` in individual checkpointed steps. Both use
`tools/ai-sdk.ts`: `execute` runs Effect programs against server services and passes
`toolCallId` into the agent context. Runtime execution is separate from client-safe specs.

Tool policy declares allowed agents and `never` or `unless-full-access` approval.
Computer and isolated box tools never need approval. Chat library mutations keep signed
AI SDK approval requests unless the thread has Full access. Cloud has no direct library
mutation tools: it publishes copies or proposes a reviewed sync. Tool telemetry records
names, ownership, outcome and duration; it excludes raw inputs and outputs.

The old Pi harness, extension, gateway, manifest/tool routes, run-token service and
`cloud_run_token` table have been removed. Vault mounts are detached on box reuse.
Server OpenRouter and Daytona keys are read through Effect Config.

## Tools

| Tool                                                        | Input                                                                                                   | Behavior                                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `computer`                                                  | `action`, optional `x/y`, `toX/toY`, `direction`, `amount`, `text`, `keys`, `region:{x,y,width,height}` | One screenshot/click/double_click/right_click/move/drag/scroll/type/key/hotkey/wait action. Fresh PNG afterward; profile coordinates converted with `toScreen`. |
| `screen_read`                                               | `mode:tree\|find`, optional `role`, `name`, `limit:1..200`                                              | Compact AT-SPI nodes, actions and converted bounds. Explicit empty/unavailable-tree notice and screenshot/DOM fallback.                                         |
| `box_exec`                                                  | `command`, optional `timeoutSec:1..900`                                                                 | Workspace shell, 64 KiB UTF-8 output cap. Use durable sessions for long jobs.                                                                                   |
| `box_command_start`                                         | `command`                                                                                               | Deterministic Daytona session and persisted command id; returns `jobId` and `commandId`.                                                                        |
| `box_command_status`                                        | `jobId`                                                                                                 | Reattach; null exit code means running.                                                                                                                         |
| `box_command_logs`                                          | `jobId`                                                                                                 | Last 64 KiB of logs.                                                                                                                                            |
| `box_command_cancel`                                        | `jobId`                                                                                                 | Deletes the known job's isolated session.                                                                                                                       |
| `box_read`                                                  | `path`                                                                                                  | UTF-8 regular file, at most 1 MiB; workspace or this user's input root.                                                                                         |
| `box_write`                                                 | `path`, `content`                                                                                       | UTF-8 workspace file, at most 10 MiB. Input-root writes and symlink escapes rejected.                                                                           |
| `box_list`                                                  | optional `path`                                                                                         | At most 200 entries in allowed roots.                                                                                                                           |
| `search_materials`, `list_files`, `find_files`, `read_file` | Existing shared selectors/retrieval inputs                                                              | Always user-scoped.                                                                                                                                             |
| `hydrate_files`                                             | `selector`, optional `maxFiles`, `maxBytes`                                                             | Hash-skip, capped inputs, LRU eviction and hydration audit.                                                                                                     |
| `publish_output`                                            | `sandboxPath`, optional `title`, `replaces`                                                             | New file in the run folder; `replaces` makes a pending sync.                                                                                                    |
| `publish_report`                                            | `markdown`, optional `status`, `assets`                                                                 | Persist summary and publish selected private assets; server commits report/delivery.                                                                            |
| `publish_asset`                                             | `path`, optional `title`                                                                                | Permanent private media, tagged with thread or Cloud run.                                                                                                       |

Computer coordinates must be finite integers within the active profile. The keyboard
allow list accepts letters, digits, named navigation/editing keys and F1–F12; hotkeys
are one modifier chord. Typing is at most 10,000 characters without NUL, scroll at most
100 units, and wait at most 10 seconds. Chat has 100 computer actions per turn; Cloud
has 500 per run by default. These are maximum budgets, not targets.

Filesystem tools resolve symlinks and enforce path roots. Shell is intentionally broad
inside the isolated user's box; it is not a security boundary against editing local copies.
It cannot call Avenire with box credentials, and originals only change through approved
server review. Screen/web content is untrusted data, never authorization.

## Models, coordinates and images

Tasks accept registry names `ruth-sprint`, `ruth-core` or `ruth-apex`, defaulting to
`ruth-core`. Their OpenRouter ids remain centralized and configurable in `models/`.
The same task fields are accepted by create/update RPCs. The registry assigns a screen
profile from configured model identity; execution never lets the model select its profile.

The desktop is 1600×900. Tool descriptions and system prompts state exact screenshot
W×H and coordinate kind/range. Profiles are:

| Profile           | Screenshot | Coordinate convention            | Default assignment                         |
| ----------------- | ---------- | -------------------------------- | ------------------------------------------ |
| `pixels-1280x720` | 1280×720   | x 0..1279, y 0..719 image pixels | Claude, Qwen2.5-VL, generic/unknown vision |
| `pixels-1024x576` | 1024×576   | x 0..1023, y 0..575 image pixels | Available explicit profile                 |
| `pixels-native`   | 1600×900   | x 0..1599, y 0..899 pixels       | OpenAI native CUA-class identifiers        |
| `normalized-1000` | 1280×720   | Both axes inclusive 0..1000      | Qwen3-VL                                   |
| `normalized-999`  | 1280×720   | Both axes inclusive 0..999       | Gemini                                     |

Screenshots use `takeCompressed({scale,format:'png'})`. Crops use
`takeCompressedRegion(region,{scale:1,format:'png'})` because SDK 0.220's `takeRegion`
is broken. Crop origin/dimensions are returned explicitly; coordinates still refer to the
full screen. `tools/images.ts` sends file parts in tool-result content for supported routes,
or injects a following user image. Old image payloads are pruned without removing tool ids,
results, text or required reasoning parts. Completed journal results retain screenshot
bytes so fallback images can be restored after a worker restart. Exact hosted endpoint
image perception remains a conformance question; no real-model spend was authorized.

Prompts prefer accessibility or local DOM, then pixels. Each action must be verified on a
fresh screen. An absent/failed accessibility tree is reported explicitly and falls back to
screenshots. Native applications vary in AT-SPI coverage; browser nodes must never be invented.

## Persistent workspace and egress

Cloud uses one persistent box per user, shared v4 snapshot, idle-stop 15 minutes,
auto-archive seven days and disabled auto-delete. Chat uses one ephemeral v4 box per
thread, existing quota/lifetime rules and sweep/cleanup.

Hydrated library copies go to
`/home/daytona/.avenire/<stable-user-slug>/<folder>/<file>`.
The slug normalizes the display name and appends a short user-id hash; unusable names
fall back to `user-<hash>`. `user.cloud_inputs_slug` pins it across later name changes.
The tracked input cache cap is **4 GiB**, preserving disk room for output and recordings
on the 10 GB writable sandbox allocation. Per-call caps remain 200 files/1 GiB; additional inputs are refused once current-run protected copies reach 4 GiB. Unchanged
hashes are skipped, previous paths removed and LRU rows evicted with current-run protection.
Hydration manifests record file ids, hashes, local paths, selection reasons and truncation.
Work/output stays under `/home/daytona/workspace/runs/<runId>/out`.

Task `network` is `packages` by default or explicitly `open`. Package mode uses Daytona's
domain firewall for `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`. Open mode
clears both domain/CIDR allow lists. Reapply the task policy before hydration on every
reuse. This protects hydrated files against arbitrary outbound destinations; it does not
make allowed package hosts incapable of accepting user data. Organization-tier restrictions
can further constrain open mode. Chat retains its existing blocked/default configured
allow-list policy. No provider or Avenire host is implicitly allowed for Cloud.

## Checkpoints, leases and recovery

`cloud_run` persists canonical AI SDK model messages, step index, token/cost/action usage,
model name, prompt version, sandbox id, recorder id, input slug, lease owner/expiry and
heartbeat. `cloud_tool_call` has primary key `(run_id,tool_call_id)`, name, input,
pending/started/completed status, result, and Daytona session/command ids.

The scheduler serializes claims through the user row and permits one active run per user.
Each claim has a distinct fence token and a five-minute lease; the executor heartbeats every
30 seconds. Expired runs are prioritized over fresh work and resumed in place. The old
"dead worker → failed run" sweep is gone. Writes and tool execution check the fence.

A Cloud model call runs one AI SDK step with `stopWhen` and image-pruning `prepareStep`.
The executor commits the canonical assistant message and tool-call ids **before** executing
any tool. It then executes calls serially and saves each result. Restart reloads messages,
finds unresolved call ids, returns completed journal results or reconciles the world, and
continues with the next model step. Journal-write failures pause the same unresolved call instead of sending an error result that could invite a duplicate publication. Infrastructure/model-request failures use the task retry allowance with a five-minute resume lease; retries keep the same run and call ids. Provider calls interrupted before a response checkpoint
may repeat and incur extra usage; exactly-once provider billing is not guaranteed.

Hydration manifests, published file/proposal ids and media asset ids are deterministic by
tool call. Lost-result retries discover those records before republishing. Writes replay the
same bounded path/content. Long jobs use deterministic session ids and reconnect to existing
command ids. Uncertain computer mutations are reconciled with a screenshot instead of a
second click/type. Uncertain `box_exec` returns a conflict requiring world inspection rather
than rerunning an arbitrary command.

The executor lists recordings and reconnects by persisted id or deterministic run name.
Worker shutdown preserves recorder, commands, box and checkpoint; it expires the lease.
Final completion stops the recorder, streams it to a temp file, hashes it incrementally,
streams it into a private `video` asset with run id and removes the temp file. Completed
recorders can be collected again without a second stop. Report message, terminal state
and email outbox enqueue commit in one transaction; a stored report id prevents duplicates.
Final cleanup terminates known sessions, meters box time and stops the box. Metering and cleanup markers are saved in the usage checkpoint; expired terminal leases resume collection/cleanup without another model call or report. Failed recording or box-stop cleanup retains the lease for retry.

Budgets: 500 model steps, 500 computer actions, four-hour wall clock including resumed time,
and configurable `RUTH_CLOUD_MAX_COST_USD` (default $5) using actual OpenRouter usage metadata.
The next step is stopped after the reported cost reaches the cap; an individual request can
overshoot it. Missing provider cost metadata cannot prove a dollar limit.

## Review and private outputs

`publish_output` creates a new library file in the run folder. With `replaces`, it stores an
independent proposed object and a pending approval. Morning review rechecks the original
hash, exposes conflicts and updates originals only on user acceptance. Skips leave originals
alone. Original storage, chunks and metadata are never replaced by agent tool execution.

AssetStore provides permanent private `/a/<signed-id>` links; possession does not bypass
owner authorization. Widgets retain their separate sandboxed origin, short-lived widget
tokens, CSP and trusted kit routes. Chat widget preview/render and asset rendering are
unchanged by the computer-use migration.

## Conformance and validation

`pnpm --filter @avenire/ai conformance -- --model <OpenRouter-id> --max-steps 20`
creates a temporary v4 sandbox, opens a known local Chromium fixture, requests two clicks,
a word and scroll, scores actual DOM state and reports image transport. It always deletes
the box. **Do not run real-model conformance without owner spend approval.**

`--mock` uses the AI SDK mock model with the same live executors and zero provider calls;
`--profile <profile-id>` selects each convention. Reports go to `/tmp/ruth-computer-use/`.
Fake tests cover coordinate conversion, action validation, image transport, lost checkpoint
resume without duplicate hydration/publish, lease reclaim, recording reconciliation, network
policy and Unicode/stable hydration roots. Full-workspace checks and a dev-only migration
must pass separately; fake tests do not establish production or four-hour runtime behavior.
