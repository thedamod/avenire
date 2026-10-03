/**
 * Persistent desktop sandboxes for Ruth Cloud's nightly runs. Unlike the
 * ephemeral `Sandboxes`, a box lives for a whole run, has a display for
 * computer use, and records its screen so the user can watch what Ruth did.
 */
import type { Sandbox } from "@daytonaio/sdk";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import type * as Scope from "effect/Scope";

import { attempt, CloudError, DaytonaClient, decodeBase64 } from "./daytona.ts";

export const WORKSPACE_DIR = "/home/daytona/workspace";

export interface DesktopBox {
  readonly id: string;
  readonly shell: (
    command: string,
    options?: { readonly cwd?: string; readonly timeoutSeconds?: number },
  ) => Effect.Effect<{ readonly stdout: string; readonly exitCode: number }, CloudError>;
  readonly writeFile: (path: string, bytes: Uint8Array) => Effect.Effect<void, CloudError>;
  readonly readFile: (path: string) => Effect.Effect<Uint8Array, CloudError>;
  readonly listFiles: (
    dir: string,
  ) => Effect.Effect<
    ReadonlyArray<{ readonly name: string; readonly isDirectory: boolean }>,
    CloudError
  >;
  readonly screenshot: Effect.Effect<Uint8Array, CloudError>;
  /** Stops the screen recording and returns the video, if one is running. */
  readonly stopRecording: Effect.Effect<Option.Option<Uint8Array>, CloudError>;
}

export class DesktopBoxes extends Context.Service<
  DesktopBoxes,
  {
    /** Opens a recording desktop box; closing the scope stops recording and deletes the box. */
    readonly open: (input: {
      readonly userId: string;
      readonly runId: string;
    }) => Effect.Effect<DesktopBox, CloudError, Scope.Scope>;
  }
>()("avenire/cloud/DesktopBoxes") {}

const makeBox = (sandbox: Sandbox, recordingId: Ref.Ref<Option.Option<string>>): DesktopBox => ({
  id: sandbox.id,
  shell: (command, options = {}) =>
    attempt("shell", () =>
      sandbox.process.executeCommand(
        command,
        options.cwd ?? WORKSPACE_DIR,
        undefined,
        options.timeoutSeconds,
      ),
    ).pipe(Effect.map(({ result, exitCode }) => ({ stdout: result, exitCode }))),
  writeFile: (path, bytes) =>
    attempt("writeFile", () => sandbox.fs.uploadFile(Buffer.from(bytes), path)),
  readFile: (path) =>
    attempt("readFile", () => sandbox.fs.downloadFile(path)).pipe(
      Effect.map((bytes) => new Uint8Array(bytes)),
    ),
  listFiles: (dir) =>
    attempt("listFiles", () => sandbox.fs.listFiles(dir)).pipe(
      Effect.map((files) => files.map((file) => ({ name: file.name, isDirectory: file.isDir }))),
    ),
  screenshot: attempt("screenshot", () => sandbox.computerUse.screenshot.takeFullScreen()).pipe(
    Effect.flatMap(({ screenshot }) =>
      screenshot === undefined
        ? Effect.fail(new CloudError({ operation: "screenshot", detail: "no image returned" }))
        : Effect.succeed(decodeBase64(screenshot)),
    ),
  ),
  stopRecording: Ref.getAndSet(recordingId, Option.none()).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(Option.none<Uint8Array>()),
        onSome: (id) =>
          attempt("stopRecording", () => sandbox.computerUse.recording.stop(id)).pipe(
            Effect.flatMap((recording) =>
              attempt("downloadRecording", () => sandbox.fs.downloadFile(recording.filePath)),
            ),
            Effect.map((bytes) => Option.some(new Uint8Array(bytes))),
          ),
      }),
    ),
  ),
});

export const DesktopBoxesLive = Layer.effect(
  DesktopBoxes,
  Effect.gen(function* () {
    const daytona = yield* DaytonaClient;
    const snapshot = yield* Config.String("DAYTONA_DESKTOP_SNAPSHOT").pipe(
      Config.withDefault("daytonaio/sandbox"),
    );

    return DesktopBoxes.of({
      open: Effect.fn("DesktopBoxes.open")(function* ({ userId, runId }) {
        const sandbox = yield* Effect.acquireRelease(
          attempt("createDesktopBox", () =>
            daytona.create({
              snapshot,
              autoStopInterval: 60,
              labels: { app: "ruth-cloud", userId, runId },
            }),
          ),
          (sandbox) =>
            attempt("deleteDesktopBox", () => sandbox.delete()).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("Failed to delete desktop box", cause),
              ),
            ),
        );
        yield* attempt("startComputerUse", () => sandbox.computerUse.start());
        yield* attempt("createWorkspace", () => sandbox.fs.createFolder(WORKSPACE_DIR, "755"));
        const recording = yield* attempt("startRecording", () =>
          sandbox.computerUse.recording.start(`ruth-${runId}`),
        );
        const recordingId = yield* Ref.make(Option.some(recording.id));
        const box = makeBox(sandbox, recordingId);
        // Runs before the delete finalizer above, so an unfinished recording is stopped cleanly.
        yield* Effect.addFinalizer(() =>
          box.stopRecording.pipe(
            Effect.catchCause((cause) => Effect.logWarning("Failed to stop recording", cause)),
          ),
        );
        return box;
      }),
    });
  }),
);
