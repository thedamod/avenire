import { createCaptureContext, type CaptureContext } from "./capture-context.ts";
import { currentSession, getSmtcSessions } from "./background-media-win.ts";

// Windows: what's actually playing, via SystemMediaTransportControls.
// Any app exposing SMTC answers: Media Player, Groove, VLC, Chrome, Edge…
// Returns artist/title as separate fields (never a merged "Artist - Title"
// string), each trimmed to 200 chars. Undefined when nothing is playing or
// the WinRT call fails. No extra deps.
//
// Derived from the ONE per-snapshot SMTC read (memoized 'win:smtc' in
// background-media-win.ts: sessions + which one is current), so title,
// timeline and background media share a single PowerShell call instead of
// three RequestAsync round-trips. Await-WinRT (AsTask pattern) lives there.
export async function getNowPlayingWindows(
  ctx: CaptureContext = createCaptureContext(),
): Promise<{ artist?: string; title: string } | undefined> {
  const cur = currentSession(await getSmtcSessions(ctx));
  if (!cur) return undefined;
  const title = cur.title.slice(0, 200);
  if (!title) return undefined;
  return cur.artist ? { artist: cur.artist.slice(0, 200), title } : { title };
}

// Windows: seek position + duration of the current SMTC session — the same
// memoized read as above (the old separate call also targeted a nonexistent
// timeline type/method, so positions never arrived).
export async function getTimelineWindows(
  ctx: CaptureContext = createCaptureContext(),
): Promise<{ positionSec: number; durationSec: number } | undefined> {
  const cur = currentSession(await getSmtcSessions(ctx));
  if (!cur) return undefined;
  const { positionSec, durationSec } = cur;
  if (positionSec === undefined || durationSec === undefined) return undefined;
  if (!Number.isFinite(positionSec) || !Number.isFinite(durationSec) || durationSec <= 0)
    return undefined;
  return { positionSec, durationSec };
}
