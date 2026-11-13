import { createCaptureContext, type CaptureContext } from "./capture-context.ts";
import { queryPlayers } from "./background-media-linux.ts";

// Linux: playerctl (MPRIS) if installed — covers VLC, Chrome, mpv, Spotify…
// Shares the memoized all-players call with background-media (one spawn per
// snapshot). A Playing player wins over a Paused one — plain `playerctl
// metadata` picks whichever answered first, often a stale paused tab.
// Absent playerctl -> undefined. No hard dep; never throws.
export async function getNowPlayingLinux(
  ctx: CaptureContext = createCaptureContext(),
): Promise<string | undefined> {
  try {
    const { players } = await queryPlayers(ctx);
    const withTitle = players.filter((p) => p.title);
    const p =
      withTitle.find((x) => x.status === "playing") ?? withTitle.find((x) => x.status === "paused");
    if (!p) return undefined;
    return (p.artist ? `${p.artist} - ${p.title}` : p.title).slice(0, 200);
  } catch {
    return undefined;
  }
}
