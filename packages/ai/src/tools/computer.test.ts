import { expect, it } from "@effect/vitest";
import { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import { SCREEN_PROFILES, toScreen } from "@avenire/cloud/screen";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { ThreadId } from "@avenire/contracts";
import { ComputerOutput } from "./computer-specs.ts";
import * as Schema from "effect/Schema";
import {
  makeComputerRegistry,
  validateComputerAction,
  coordinateContract,
  type ComputerServices,
} from "./computer.ts";
import { ctx } from "./test-support.ts";

const fixture = () => {
  const calls: unknown[][] = [];
  const sandbox = {
    computerUse: {
      start: async () => undefined,
      mouse: {
        click: async (...args: unknown[]) => {
          calls.push(["click", ...args]);
        },
        move: async (...args: unknown[]) => {
          calls.push(["move", ...args]);
        },
      },
      keyboard: {
        type: async (text: string) => {
          calls.push(["type", text]);
        },
      },
      screenshot: {
        takeCompressed: async (options: unknown) => {
          calls.push(["frame", options]);
          return { screenshot: "cG5n" };
        },
        takeCompressedRegion: async (region: unknown, options: unknown) => {
          calls.push(["crop", region, options]);
          return { screenshot: "cG5n" };
        },
      },
      accessibility: {
        getTree: async () => ({
          root: {
            id: "root",
            role: "application",
            name: "Xfce",
            children: [
              {
                id: "button",
                role: "button",
                name: "First",
                bounds: { x: 800, y: 450, width: 160, height: 90 },
                actions: ["click"],
              },
            ],
          },
        }),
      },
    },
  } as unknown as import("@avenire/cloud/cloud-box").CloudBox["sandbox"];
  const service = ChatSandboxes.of({
    target: () => Effect.succeed(sandbox),
    exec: () => Effect.die("unused"),
    write: () => Effect.die("unused"),
    read: () => Effect.die("unused"),
    readArtifact: () => Effect.die("unused"),
    close: () => Effect.die("unused"),
    sweep: Effect.succeed(0),
  });
  return {
    calls,
    services: Context.make(ChatSandboxes, service) as Context.Context<ComputerServices>,
  };
};
const turn = { ...ctx, threadId: ThreadId.make("thread") };
for (const profile of SCREEN_PROFILES) {
  it.live(`converts ${profile.id} input and captures its declared image size`, () => {
    const f = fixture();
    const { registry } = makeComputerRegistry(profile);
    const point =
      profile.coordinates.kind === "normalized"
        ? { x: 500, y: 500 }
        : { x: profile.image.width / 2, y: profile.image.height / 2 };
    return Effect.gen(function* () {
      const result = yield* registry.computer.execute({ action: "click", ...point }, turn);
      const decoded = yield* Schema.decodeUnknownEffect(ComputerOutput)(result);
      const screen = toScreen(point, profile);
      expect(f.calls[0]).toEqual(["click", screen.x, screen.y, "left", false]);
      expect(f.calls[1]).toEqual(["frame", { scale: profile.image.width / 1600, format: "png" }]);
      expect(decoded.screenshot).toMatchObject({
        width: profile.image.width,
        height: profile.image.height,
      });
      expect(decoded.coordinateContract).toBe(coordinateContract(profile));
      const tree = yield* registry.screen_read.execute(
        { mode: "tree", limit: 10 },
        turn,
      ) as Effect.Effect<{ nodes: { bounds: { x: number; y: number } | null }[] }>;
      expect(tree.nodes[1]?.bounds?.x).toBeCloseTo(
        profile.coordinates.kind === "normalized"
          ? Math.round((800 * profile.coordinates.max) / 1599)
          : profile.image.width / 2,
      );
    }).pipe(Effect.provideContext(f.services));
  });
}
it("rejects invalid coordinates, keys, durations, text and crops", () => {
  const p = SCREEN_PROFILES[0];
  for (const input of [
    { action: "click" as const, x: 1280, y: 10 },
    { action: "click" as const, x: 0.5, y: 1 },
    { action: "drag" as const, x: 10, y: 10, toX: -1, toY: 5 },
    { action: "key" as const, keys: ["ctrl+q"] },
    { action: "hotkey" as const, keys: ["rm -rf", "a"] },
    { action: "wait" as const, amount: 11 },
    { action: "type" as const, text: "a\0b" },
    { action: "screenshot" as const, region: { x: 1200, y: 10, width: 100, height: 20 } },
  ])
    expect(validateComputerAction(input, p)).not.toBeNull();
  expect(validateComputerAction({ action: "hotkey", keys: ["ctrl", "shift", "t"] }, p)).toBeNull();
});
it.live("caps actions and uses the working scale-one compressed region API", () => {
  const f = fixture();
  const { registry } = makeComputerRegistry(SCREEN_PROFILES[0], 1);
  return Effect.gen(function* () {
    yield* registry.computer.execute(
      { action: "screenshot", region: { x: 240, y: 120, width: 320, height: 160 } },
      turn,
    );
    expect(f.calls[0]).toEqual([
      "crop",
      { x: 300, y: 150, width: 400, height: 200 },
      { scale: 1, format: "png" },
    ]);
    const result = yield* Effect.result(registry.computer.execute({ action: "screenshot" }, turn));
    expect(result._tag).toBe("Failure");
    expect(f.calls).toHaveLength(1);
  }).pipe(Effect.provideContext(f.services));
});

it.live("full-screen crops include the last display pixel for every coordinate convention", () =>
  Effect.gen(function* () {
    for (const profile of SCREEN_PROFILES) {
      const f = fixture();
      const { registry } = makeComputerRegistry(profile);
      const region = {
        x: 0,
        y: 0,
        width:
          profile.coordinates.kind === "normalized" ? profile.coordinates.max : profile.image.width,
        height:
          profile.coordinates.kind === "normalized"
            ? profile.coordinates.max
            : profile.image.height,
      };
      yield* registry.computer
        .execute({ action: "screenshot", region }, turn)
        .pipe(Effect.provideContext(f.services));
      expect(f.calls[0]).toEqual([
        "crop",
        { x: 0, y: 0, width: 1600, height: 900 },
        { scale: 1, format: "png" },
      ]);
    }
  }),
);
