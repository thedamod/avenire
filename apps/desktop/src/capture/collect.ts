import * as Crypto from "node:crypto";
import * as OS from "node:os";
import { CaptureId } from "@avenire/contracts";
import type {
  CaptureSnapshot,
  CapturedMedia,
  CapturedTab,
  CapturedWindow,
} from "@avenire/contracts";
import { collectForeground } from "./foreground.ts";
import { collectSelection } from "./selection.ts";
import { latestTabs } from "./tabs.ts";

type Collected = {
  readonly windows?: readonly CapturedWindow[];
  readonly tabs?: readonly CapturedTab[];
  readonly media?: readonly CapturedMedia[];
  readonly selectionText?: string;
  readonly notes?: readonly string[];
};
type Collector = () => Promise<Collected>;

async function withTimeout(collector: Collector): Promise<Collected> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      collector(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out after 1500ms")), 1_500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function collectSnapshot(
  capturedAt = new Date().toISOString(),
): Promise<CaptureSnapshot> {
  const collectors: readonly [string, Collector][] = [
    ["foreground", collectForeground],
    ["tabs", async () => ({ tabs: latestTabs() })],
    ["selection", collectSelection],
  ];
  const results = await Promise.allSettled(
    collectors.map(([, collector]) => withTimeout(collector)),
  );
  const values: Collected[] = [];
  const notes: string[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result?.status === "fulfilled") {
      values.push(result.value);
      notes.push(...(result.value.notes ?? []));
    } else {
      const reason = result?.status === "rejected" ? result.reason : "unknown error";
      notes.push(
        `${collectors[index]?.[0] ?? "collector"} collector failed: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
      values.push({});
    }
  }
  const selectionText = values.find((value) => value.selectionText !== undefined)?.selectionText;
  const platform =
    process.platform === "darwin" || process.platform === "win32" || process.platform === "linux"
      ? process.platform
      : "linux";
  return {
    id: CaptureId.make(Crypto.randomUUID()),
    capturedAt,
    deviceId: Crypto.createHash("sha256")
      .update(`${OS.hostname()}\0${OS.userInfo().username}`)
      .digest("hex")
      .slice(0, 32),
    platform,
    windows: values.flatMap((value) => value.windows ?? []),
    tabs: values.flatMap((value) => value.tabs ?? []),
    media: values.flatMap((value) => value.media ?? []),
    ...(selectionText === undefined ? {} : { selectionText }),
    collectorNotes: notes,
  };
}
