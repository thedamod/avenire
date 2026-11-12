import { expect, it, vi } from "vite-plus/test";
vi.mock("node:child_process", () => ({
  execFile: (_cmd: string, args: string[], _options: unknown, callback: Function) => {
    const monitors = [
      { x: 0, y: 0, width: 1920, height: 1080, name: "DP-1", scale: 1, transform: 0 },
    ];
    callback(null, JSON.stringify(args.includes("monitors") ? monitors : []), "");
  },
}));
import { verifyScreenInventory, screenPrivacySnapshot } from "./screen-privacy.ts";
const area = { x: 0, y: 0, width: 1920, height: 1080 };
const monitor = { ...area, name: "DP-1", scale: 1, transform: 0 };
const editor = { class: "code", title: "Notes", address: "0x1", mapped: true };
it("accepts a complete non-sensitive inventory on a uniquely mapped display", () => {
  expect(verifyScreenInventory([editor], [monitor], area)).toContain("DP-1");
});
it("blocks an adjacent password manager even when the editor is foreground", () => {
  expect(() =>
    verifyScreenInventory([editor, { ...editor, class: "Bitwarden" }], [monitor], area),
  ).toThrow("sensitive");
});
it("blocks private windows and browsers whose visible URL cannot be verified", () => {
  for (const source of [
    { ...editor, title: "Private Browsing" },
    { ...editor, class: "firefox" },
  ])
    expect(() => verifyScreenInventory([source], [monitor], area)).toThrow();
});
it("rejects partial inventories, ambiguous geometry, rotated displays and unavailable adapters", async () => {
  for (const [clients, monitors] of [
    [null, [monitor]],
    [[{}], [monitor]],
    [[editor], []],
    [[editor], [monitor, monitor]],
    [[editor], [{ ...monitor, transform: 1 }]],
  ])
    expect(() => verifyScreenInventory(clients, monitors, area)).toThrow();
  await expect(screenPrivacySnapshot(area, false)).rejects.toThrow("unavailable");
});
it("uses logical scaled display bounds and rejects mismatched display pixels", () => {
  expect(
    verifyScreenInventory([editor], [{ ...monitor, width: 3840, height: 2160, scale: 2 }], area),
  ).toContain("DP-1");
  expect(() => verifyScreenInventory([editor], [{ ...monitor, x: 1920 }], area)).toThrow("mapping");
});

it("does not treat a complete client inventory as atomic privacy coverage", async () => {
  await expect(screenPrivacySnapshot(area, true)).rejects.toThrow(
    "privacy coverage could not be verified",
  );
});
