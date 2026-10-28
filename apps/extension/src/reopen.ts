import type { CapturePosition } from "@avenire/contracts";
import { normalizeUrl } from "@avenire/capture/url";
import { positionUrl } from "@avenire/capture/reopen";
import { within } from "./wire.ts";

export function matchingTab(
  tabs: readonly chrome.tabs.Tab[],
  raw: string,
): chrome.tabs.Tab | undefined {
  return tabs.find(
    (tab) =>
      !tab.incognito &&
      tab.id !== undefined &&
      tab.url &&
      normalizeUrl(tab.url) === normalizeUrl(raw),
  );
}

export async function reopen(
  api: typeof chrome,
  raw: string,
  position?: CapturePosition,
): Promise<boolean> {
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return false;
    let tab = matchingTab(await api.tabs.query({ windowType: "normal" }), raw);
    if (tab?.id !== undefined) {
      await api.windows.update(tab.windowId, { focused: true });
      await api.tabs.update(tab.id, { active: true });
    } else {
      const normal = (await api.windows.getAll({ windowTypes: ["normal"] })).find(
        (window) => !window.incognito && window.id !== undefined,
      );
      if (normal?.id !== undefined) {
        tab = await api.tabs.create({
          url: positionUrl(raw, position),
          active: true,
          windowId: normal.id,
        });
        await api.windows.update(normal.id, { focused: true });
      } else {
        const created = await api.windows.create({
          url: positionUrl(raw, position),
          incognito: false,
          focused: true,
        });
        tab = created?.tabs?.[0];
      }
    }
    if (position && tab?.id !== undefined) {
      const id = tab.id;
      if (tab.status !== "complete") {
        let listener: ((tabId: number, info: chrome.tabs.OnUpdatedInfo) => void) | undefined;
        try {
          await within(
            new Promise<void>((resolve) => {
              listener = (tabId, info) => {
                if (tabId === id && info.status === "complete") resolve();
              };
              api.tabs.onUpdated.addListener(listener);
              void api.tabs.get(id).then(
                (current) => {
                  if (current.status === "complete") resolve();
                },
                () => resolve(),
              );
            }),
            1500,
          );
        } catch {
          /* Focus succeeded; the URL's position fragment can restore a slow page. */
        } finally {
          if (listener) api.tabs.onUpdated.removeListener(listener);
        }
      }
      try {
        await api.tabs.sendMessage(id, { type: "avenire-restore", position });
      } catch {
        /* PDF/media URL fragments restore position when scripting is unsupported. */
      }
    }
    return true;
  } catch {
    return false;
  }
}
