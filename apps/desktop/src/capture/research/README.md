These collectors are adapted from `context/research/background_worker` (reference tree read-only).
Relative imports use `.ts`; config stays in the desktop Effect Config adapter. No `get-windows`
native dependency is added.

Included: foreground document resolution; Windows EnumWindows, Office COM, bounded/coalesced
class-64 handle scans, title-matched Recent and media-only siblings; SMTC all-session now-playing
with Await-WinRT/AsTask; macOS per-PID AX windows/AXDocument, Office AppleScript/lsof and Music
now-playing; Linux EWMH (wmctrl/xprop), /proc fd/cmdline and MPRIS xesam:url; Obsidian active/open
workspace leaves with a running-process gate; shared app catalog, ranking and extension filters.

Native work has per-command limits and a 9-second fill-in deadline (Obsidian 3.5 seconds). The
2-second cache timer never overlaps its own refresh. The hotkey reads that cache immediately;
fill-in collectors share one context, PowerShell queue and warm host. A context deadline also
bounds queued scans so abandoned fills cannot start new Windows work later. The ported Windows
and Linux/macOS collector regression tests sit beside these adapters.

Clipboard/keystroke fallback remains disconnected: only source-aware browser TextQuote selections
are supported. Chromium on-disk cache decoding/download watchers, editor/remote-workspace adapters,
and a private MediaRemote implementation are not included. V1 itself only used Music AppleScript
on macOS. See `docs/capture-v1-parity.md` for evidence, deliberate gaps and verification boundaries.

Browser reports are owner-authenticated on loopback port 17842; the WebSocket channel supports
on-demand text/original-file acquisition and reopen. Device paths never enter the server payload;
local uploads use basename-only LocalFile metadata and the owner-partitioned local registry.
