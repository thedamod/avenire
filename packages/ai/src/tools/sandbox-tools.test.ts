import { ArtifactId, StorageKey, ThreadId } from "@avenire/contracts";
import {
  ChatSandboxes,
  SandboxQuotaExceeded,
  SandboxUnavailable,
  type SandboxOwner,
} from "@avenire/cloud/chat-sandbox";
import { SandboxTimeout } from "@avenire/cloud/daytona";
import { Analytics } from "@avenire/shared/observability";
import { expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ArtifactStore } from "../outputs/artifacts.ts";
import { runTool, type TaggedToolError } from "./core.ts";
import { sandboxTools } from "./sandbox-tools.ts";
import { ctx, recordingAnalytics, testCrypto } from "./test-support.ts";

const turn = { ...ctx, threadId: ThreadId.make("thread") };
const fake = () => {
  const owners: SandboxOwner[] = [];
  const files = new Map<string, Uint8Array>();
  const commands: unknown[] = [];
  const sandboxes = ChatSandboxes.of({
    exec: (owner, input) =>
      Effect.sync(() => {
        owners.push(owner);
        commands.push(input);
        return { exitCode: 2, output: "result", truncated: true, durationMs: 42 };
      }),
    write: (owner, input) =>
      Effect.sync(() => {
        owners.push(owner);
        files.set(input.path, input.bytes);
        return { path: input.path, size: input.bytes.length };
      }),
    read: (owner, input) =>
      Effect.sync(() => {
        owners.push(owner);
        const bytes = files.get(input.path)!;
        return {
          path: input.path,
          bytes: bytes.subarray(0, input.maxBytes ?? bytes.length),
          size: bytes.length,
          truncated: input.maxBytes !== undefined && input.maxBytes < bytes.length,
        };
      }),
    readArtifact: (owner, input) =>
      Effect.sync(() => {
        owners.push(owner);
        return { path: input.path, name: "plot.png", bytes: files.get(input.path)! };
      }),
    close: (owner) =>
      Effect.sync(() => {
        owners.push(owner);
        return { closed: true, lifetimeSeconds: 12 };
      }),
    sweep: Effect.succeed(0),
  });
  return { sandboxes, owners, files, commands };
};
const stored: Array<{ userId: string; name: string; bytes: Uint8Array; mediaType: string }> = [];
const artifacts = ArtifactStore.of({
  put: (userId, input) =>
    Effect.sync(() => {
      stored.push({ userId, ...input });
      return {
        artifactId: ArtifactId.make("artifact"),
        key: StorageKey.make("key"),
        url: "https://app.test/download",
        expiresAt: "2026-10-16T00:00:00Z",
      };
    }),
  resolve: () => Effect.succeed(Option.none()),
  load: () => Effect.succeed(new Uint8Array()),
  sweepExpired: Effect.succeed(0),
});
const provide = <A, E>(
  effect: Effect.Effect<A, E, ChatSandboxes | ArtifactStore | Crypto.Crypto>,
  sandboxes: ChatSandboxes["Service"],
) =>
  effect.pipe(
    Effect.provideService(ChatSandboxes, sandboxes),
    Effect.provideService(ArtifactStore, artifacts),
    Effect.provideService(Crypto.Crypto, testCrypto),
  );

it.effect("derives ownership, preserves exec arguments and round-trips binary/text files", () => {
  const state = fake();
  return provide(
    Effect.gen(function* () {
      const bytes = new Uint8Array([0, 255, 128, 10]);
      const content = Buffer.from(bytes).toString("base64");
      expect(
        yield* sandboxTools.sandbox_write({ path: "plot.png", content, encoding: "base64" }, turn),
      ).toEqual({ path: "plot.png", size: 4 });
      expect(state.files.get("plot.png")).toEqual(bytes);
      expect(
        yield* sandboxTools.sandbox_read({ path: "plot.png", encoding: "base64" }, turn),
      ).toEqual({ path: "plot.png", content, encoding: "base64", size: 4, truncated: false });
      yield* sandboxTools.sandbox_write({ path: "script.py", content: "print('π')" }, turn);
      expect(yield* sandboxTools.sandbox_read({ path: "script.py" }, turn)).toMatchObject({
        content: "print('π')",
        encoding: "utf8",
        truncated: false,
      });
      const command = { command: "python script.py", cwd: "/tmp", timeoutSeconds: 900 };
      expect(yield* sandboxTools.sandbox_exec(command, turn)).toEqual({
        exitCode: 2,
        output: "result",
        truncated: true,
        durationMs: 42,
      });
      expect(state.commands).toEqual([command]);
      const result = yield* sandboxTools.sandbox_download_artifact({ path: "plot.png" }, turn);
      expect(result).toMatchObject({
        name: "plot.png",
        mediaType: "image/png",
        size: 4,
        url: "https://app.test/download",
      });
      expect(stored.at(-1)).toEqual({
        userId: turn.userId,
        name: "plot.png",
        bytes,
        mediaType: "image/png",
      });
      const titled = yield* sandboxTools.sandbox_download_artifact(
        { path: "plot.png", title: "A labelled result" },
        turn,
      );
      expect(titled).toMatchObject({ name: "A labelled result.png", mediaType: "image/png" });
      expect(stored.at(-1)?.name).toBe("A labelled result.png");
      expect(yield* sandboxTools.sandbox_close({}, turn)).toEqual({
        closed: true,
        lifetimeSeconds: 12,
      });
      expect(
        state.owners.every(
          (owner) => owner.userId === turn.userId && owner.threadId === turn.threadId,
        ),
      ).toBe(true);
    }),
    state.sandboxes,
  );
});
for (const [name, input] of [
  ["sandbox_exec", { command: "true" }],
  ["sandbox_write", { path: "x", content: "x" }],
  ["sandbox_read", { path: "x" }],
  ["sandbox_download_artifact", { path: "x" }],
  ["sandbox_close", {}],
] as const) {
  it.effect(`${name} requires a thread before touching the sandbox`, () => {
    const state = fake();
    // The test table keeps the selected tool's input correlated at the individual branches.
    const program: Effect.Effect<
      unknown,
      TaggedToolError,
      ChatSandboxes | ArtifactStore | Crypto.Crypto
    > =
      name === "sandbox_exec"
        ? sandboxTools.sandbox_exec(input, ctx)
        : name === "sandbox_write"
          ? sandboxTools.sandbox_write(input, ctx)
          : name === "sandbox_read"
            ? sandboxTools.sandbox_read(input, ctx)
            : name === "sandbox_download_artifact"
              ? sandboxTools.sandbox_download_artifact(input, ctx)
              : sandboxTools.sandbox_close(input, ctx);
    return provide(
      program.pipe(
        Effect.result,
        Effect.map((result) => {
          expect(result).toMatchObject({ failure: { code: "invalid_input", tool: name } });
          expect(state.owners).toEqual([]);
        }),
      ),
      state.sandboxes,
    );
  });
}
for (const [error, code] of [
  [new SandboxTimeout({ operation: "exec", timeoutSeconds: 1 }), "timeout"],
  [new SandboxQuotaExceeded({ reason: "daily allowance" }), "quota_exceeded"],
  [new SandboxUnavailable({ detail: "cannot start" }), "sandbox_unavailable"],
] as const)
  it.effect(`maps ${error._tag} through the shared tool boundary`, () => {
    const state = fake();
    const sandboxes = { ...state.sandboxes, exec: () => Effect.fail(error) };
    return provide(
      runTool("sandbox_exec", turn, sandboxTools.sandbox_exec({ command: "true" }, turn)).pipe(
        Effect.result,
        Effect.map((result) =>
          expect(result).toMatchObject({
            failure: { _tag: "RuthToolError", code, tool: "sandbox_exec" },
          }),
        ),
        Effect.provideService(Analytics, recordingAnalytics()),
      ),
      sandboxes,
    );
  });
it.effect("rejects invalid base64 without writing a file", () => {
  const state = fake();
  return provide(
    sandboxTools.sandbox_write({ path: "x", content: "%%%", encoding: "base64" }, turn).pipe(
      Effect.result,
      Effect.map((result) => {
        expect(result).toMatchObject({ failure: { code: "invalid_input" } });
        expect(state.files.size).toBe(0);
      }),
    ),
    state.sandboxes,
  );
});
