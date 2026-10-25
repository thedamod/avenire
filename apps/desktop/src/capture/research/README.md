These collectors are copied from `context/research/background_worker` at the user's request (2026-10-21).
The reference tree stays read-only. Relative imports use `.ts`; the shared capture context includes only
the per-capture memo helper used here. `../document-path.ts` adapts foreground document resolution;
the native foreground adapter supplies the focused process ID without adding a native dependency.

Included: Linux `/proc` and macOS lsof/Office resolution, Windows handle scanning and serialized
PowerShell host, Obsidian's active workspace leaf, shared app catalog/path ranking/scannable extensions. Broader capture performance,
security changes, background window/media enumeration, selection and browser cache extraction are
deferred. Clipboard collectors are intentionally not connected to the existing source policy.

The PowerShell warm-up that referenced unrelated selection/media modules is omitted. Native config
uses Effect Config, and optional-property/regex typings are adapted to this monorepo's strict compiler.
The foreground adapter uses the existing OS commands to obtain a PID; `get-windows` is not added.
The browser HTTP receiver accepts the reference extension's report envelope on port 17842 and merges
profiles; its on-demand WebSocket extraction/cache channel is deferred.
