import { expect, it } from "vite-plus/test";
import { trayTemplate, type TrayState } from "./tray.ts";

const ready: TrayState = {
  platform: "darwin",
  setupCompleted: true,
  captureReady: true,
  captureRunning: false,
  shortcutsEnabled: true,
  promptShortcut: "Alt+Shift+Space",
  captureShortcut: "Ctrl+Alt+C",
};
const item = (state: TrayState, id: string) =>
  trayTemplate(state).find((entry) => entry.id === id)!;

it("offers Avenire actions and only routes with known destinations", () => {
  expect(trayTemplate(ready).map((entry) => entry.label ?? entry.type)).toEqual([
    "Ask Ava…",
    "Capture now",
    "separator",
    "Open Avenire",
    "Chats and Tasks",
    "Settings",
    "separator",
    "Pause shortcuts",
    "Pair browser extension…",
    "Desktop setup…",
    "Open capture log",
    "separator",
    "Quit Avenire",
  ]);
  expect(item(ready, "prompt")).toMatchObject({
    enabled: true,
    accelerator: "Alt+Shift+Space",
    registerAccelerator: false,
  });
  expect(item(ready, "capture")).toMatchObject({
    enabled: true,
    accelerator: "Ctrl+Alt+C",
    registerAccelerator: false,
  });
});

it("explains capture unavailability and prevents prompting before setup", () => {
  for (const [state, reason] of [
    [{ ...ready, setupCompleted: false }, "finish desktop setup"],
    [{ ...ready, captureReady: false }, "sign in and let Avenire finish loading"],
    [{ ...ready, captureRunning: true }, "capture in progress"],
  ] as const) {
    expect(item(state, "capture")).toMatchObject({
      enabled: false,
      label: `Capture now — ${reason}`,
    });
  }
  expect(item({ ...ready, setupCompleted: false }, "prompt").enabled).toBe(false);
  expect(item({ ...ready, setupCompleted: false }, "shortcuts").enabled).toBe(false);
});

it("reflects paused shortcuts while preserving manual capture and prompt actions", () => {
  const paused = { ...ready, shortcutsEnabled: false };
  expect(item(paused, "shortcuts")).toMatchObject({
    type: "checkbox",
    checked: true,
    label: "Resume shortcuts",
  });
  expect(item(ready, "shortcuts").checked).toBe(false);
  expect(item(paused, "capture").enabled).toBe(true);
  expect(item(paused, "prompt").enabled).toBe(true);
  expect(item({ ...ready, promptShortcut: undefined }, "prompt").accelerator).toBeUndefined();
});

it("uses platform quit labels and only displays Cmd+Q on macOS", () => {
  expect(item(ready, "quit")).toMatchObject({
    label: "Quit Avenire",
    accelerator: "Cmd+Q",
    registerAccelerator: false,
  });
  expect(item({ ...ready, platform: "win32" }, "quit")).toMatchObject({ label: "Exit Avenire" });
  expect(item({ ...ready, platform: "linux" }, "quit")).toMatchObject({ label: "Quit Avenire" });
  for (const platform of ["win32", "linux"] as const)
    expect(item({ ...ready, platform }, "quit").accelerator).toBeUndefined();
});
