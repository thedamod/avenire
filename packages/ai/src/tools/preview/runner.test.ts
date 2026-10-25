import { expect, it } from "@effect/vitest";
import { ownedPreviewPids } from "./runner.ts";

it("finds reparented Chrome without a daemon sidecar, retaining unrelated browsers", () => {
  const listing = `
  10 1 chrome --user-data-dir=/tmp/avenire-preview-owned/agent-browser-chrome-a
  11 10 chrome --type=zygote
  12 11 chrome --type=renderer
  20 1 chrome --user-data-dir=/tmp/avenire-preview-other/agent-browser-chrome-b
  21 20 chrome --type=renderer
  30 1 chrome --user-data-dir=/tmp/avenire-preview-owned-other/agent-browser-chrome-c
  40 1 unrelated /tmp/avenire-preview-owned/agent-browser-chrome-a
`;
  expect(ownedPreviewPids(listing, "/tmp/avenire-preview-owned", 0).sort((a, b) => a - b)).toEqual([
    10, 11, 12,
  ]);
});

it("also tracks the live daemon's descendants before Chrome detaches", () => {
  expect(
    ownedPreviewPids("1 0 init\n50 1 daemon\n51 50 chrome\n52 51 renderer", "/tmp/owned", 50).sort(
      (a, b) => a - b,
    ),
  ).toEqual([50, 51, 52]);
});
