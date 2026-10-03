/**
 * Ephemeral compute for Ruth's interactive turns: Python (with matplotlib charts)
 * and Manim renders. Every call gets a fresh sandbox that is deleted afterwards,
 * so nothing a user's code does can leak into another run.
 */
import type { Sandbox } from "@daytonaio/sdk";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  attempt,
  CloudError,
  DaytonaClient,
  decodeBase64,
  requireSuccess,
  SandboxTimeout,
} from "./daytona.ts";

export class SandboxInputRejected extends Schema.TaggedError<SandboxInputRejected>()(
  "SandboxInputRejected",
  { reason: Schema.String },
) {}

export interface RunPythonInput {
  readonly code: string;
  readonly packages?: ReadonlyArray<string>;
  readonly timeoutSeconds?: number;
}

export interface RunPythonResult {
  readonly stdout: string;
  readonly exitCode: number;
  readonly charts: ReadonlyArray<{ readonly title?: string; readonly png: Uint8Array }>;
}

export interface RenderManimInput {
  readonly code: string;
  readonly sceneName: string;
  readonly quality: "l" | "m" | "h" | "k";
  readonly timeoutSeconds?: number;
}

export interface RenderManimResult {
  readonly video: Uint8Array;
  readonly stdout: string;
}

type SandboxError = CloudError | SandboxTimeout | SandboxInputRejected;

export class Sandboxes extends Context.Service<
  Sandboxes,
  {
    readonly runPython: (input: RunPythonInput) => Effect.Effect<RunPythonResult, SandboxError>;
    readonly renderManim: (
      input: RenderManimInput,
    ) => Effect.Effect<RenderManimResult, SandboxError>;
  }
>()("avenire/cloud/Sandboxes") {}

const MAX_CODE_CHARS = 60_000;
const MAX_PACKAGES = 20;
const PIP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9,._-]+\])?([<>=!~]=?[A-Za-z0-9.*+-]+)?$/;
const SCENE_NAME = /^[A-Za-z_]\w*$/;
const DEFAULT_TIMEOUT_SECONDS = 120;
const BASE_PACKAGES = ["matplotlib", "numpy"];
const MEDIA_DIR = "/tmp/media";
const SCENE_FILE = "/tmp/scene.py";

/** Returns why the input is rejected, or undefined when it is acceptable. */
export const validateSandboxInput = (input: {
  readonly code: string;
  readonly packages?: ReadonlyArray<string> | undefined;
  readonly timeoutSeconds?: number | undefined;
}): string | undefined => {
  const packages = input.packages ?? [];
  const timeout = input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  if (input.code.length > MAX_CODE_CHARS) return `Code exceeds ${MAX_CODE_CHARS} characters`;
  if (packages.length > MAX_PACKAGES) return `At most ${MAX_PACKAGES} packages are allowed`;
  const unsafe = packages.find((name) => !PIP_NAME.test(name));
  if (unsafe !== undefined) return `"${unsafe}" is not a valid pip requirement`;
  if (!Number.isInteger(timeout) || timeout < 10 || timeout > 900) {
    return "Timeout must be an integer between 10 and 900 seconds";
  }
  return undefined;
};

const validate = (input: Parameters<typeof validateSandboxInput>[0]) => {
  const reason = validateSandboxInput(input);
  return reason === undefined ? Effect.void : Effect.fail(new SandboxInputRejected({ reason }));
};

const validateScene = (input: RenderManimInput) =>
  SCENE_NAME.test(input.sceneName) &&
  new RegExp(`\\bclass\\s+${input.sceneName}\\b`).test(input.code)
    ? Effect.void
    : Effect.fail(
        new SandboxInputRejected({
          reason: `Scene class ${input.sceneName} is not defined in the source`,
        }),
      );

const exec = (
  operation: string,
  sandbox: Sandbox,
  command: string,
  options: { readonly cwd?: string; readonly timeoutSeconds?: number } = {},
) =>
  attempt(operation, () =>
    sandbox.process.executeCommand(command, options.cwd, undefined, options.timeoutSeconds),
  );

const pipInstall = (sandbox: Sandbox, packages: ReadonlyArray<string>, timeoutSeconds: number) =>
  packages.length === 0
    ? Effect.void
    : exec(
        "pipInstall",
        sandbox,
        // Names are validated against PIP_NAME, so quoting them is enough.
        `python -m pip install --quiet ${packages.map((name) => `'${name}'`).join(" ")}`,
        { timeoutSeconds },
      ).pipe(Effect.flatMap(requireSuccess("pipInstall")), Effect.asVoid);

const MANIM_SYSTEM_DEPS =
  "sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg libcairo2-dev libpango1.0-dev";

const installManim = (sandbox: Sandbox, timeoutSeconds: number) =>
  exec("installManimSystemDeps", sandbox, MANIM_SYSTEM_DEPS, { timeoutSeconds }).pipe(
    Effect.flatMap(requireSuccess("installManimSystemDeps")),
    Effect.andThen(pipInstall(sandbox, ["manim", ...BASE_PACKAGES], timeoutSeconds)),
  );

type CodeRunResponse = Awaited<ReturnType<Sandbox["process"]["codeRun"]>>;

const chartsFrom = (response: CodeRunResponse): RunPythonResult["charts"] =>
  (response.artifacts?.charts ?? []).flatMap((chart) =>
    chart.png === undefined
      ? []
      : [{ ...(chart.title ? { title: chart.title } : {}), png: decodeBase64(chart.png) }],
  );

const runCode = (sandbox: Sandbox, code: string, timeoutSeconds: number) =>
  attempt("codeRun", () => sandbox.process.codeRun(code, undefined, timeoutSeconds)).pipe(
    // The SDK timeout is enforced inside the sandbox; this guards against a hung API call.
    Effect.timeoutOrElse({
      duration: `${timeoutSeconds + 30} seconds`,
      orElse: () => Effect.fail(new SandboxTimeout({ operation: "codeRun", timeoutSeconds })),
    }),
  );

const renderScene = Effect.fnUntraced(function* (
  sandbox: Sandbox,
  input: RenderManimInput,
  timeoutSeconds: number,
) {
  yield* attempt("uploadManimSource", () =>
    sandbox.fs.uploadFile(Buffer.from(input.code), SCENE_FILE),
  );
  const rendered = yield* exec(
    "renderManim",
    sandbox,
    `manim render -q${input.quality} --media_dir ${MEDIA_DIR} ${SCENE_FILE} ${input.sceneName}`,
    { cwd: "/tmp", timeoutSeconds },
  ).pipe(Effect.flatMap(requireSuccess("renderManim")));
  const located = yield* exec(
    "locateManimVideo",
    sandbox,
    `find ${MEDIA_DIR}/videos -name '${input.sceneName}.mp4' -print -quit`,
  );
  const path = located.result.trim();
  if (path === "") {
    return yield* new CloudError({ operation: "locateManimVideo", detail: "no video rendered" });
  }
  const video = yield* attempt("downloadManimVideo", () => sandbox.fs.downloadFile(path));
  return { video: new Uint8Array(video), stdout: rendered.result };
});

export const SandboxesLive = Layer.effect(
  Sandboxes,
  Effect.gen(function* () {
    const daytona = yield* DaytonaClient;
    const pythonSnapshot = yield* Config.option(Config.String("DAYTONA_PYTHON_SNAPSHOT"));
    const manimSnapshot = yield* Config.option(Config.String("DAYTONA_MANIM_SNAPSHOT"));

    const withSandbox = <A, E>(
      snapshot: Option.Option<string>,
      use: (sandbox: Sandbox) => Effect.Effect<A, E>,
    ) =>
      Effect.acquireUseRelease(
        attempt("createSandbox", () =>
          daytona.create({
            language: "python",
            ephemeral: true,
            // Safety net: if delete fails, the sandbox still stops (and is then deleted).
            autoStopInterval: 15,
            ...Option.match(snapshot, {
              onNone: () => ({}),
              onSome: (name) => ({ snapshot: name }),
            }),
          }),
        ),
        use,
        (sandbox) =>
          attempt("deleteSandbox", () => sandbox.delete()).pipe(
            Effect.catchCause((cause) => Effect.logWarning("Failed to delete sandbox", cause)),
          ),
      );

    return Sandboxes.of({
      runPython: Effect.fn("Sandboxes.runPython")(function* (input) {
        yield* validate(input);
        const timeout = input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
        // A custom snapshot ships its own base packages.
        const packages = Option.isSome(pythonSnapshot)
          ? (input.packages ?? [])
          : [...BASE_PACKAGES, ...(input.packages ?? [])];
        const response = yield* withSandbox(pythonSnapshot, (sandbox) =>
          pipInstall(sandbox, packages, timeout).pipe(
            Effect.andThen(runCode(sandbox, input.code, timeout)),
          ),
        );
        return {
          stdout: response.result,
          exitCode: response.exitCode,
          charts: chartsFrom(response),
        };
      }),

      renderManim: Effect.fn("Sandboxes.renderManim")(function* (input) {
        yield* validate(input);
        yield* validateScene(input);
        const timeout = input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
        return yield* withSandbox(manimSnapshot, (sandbox) =>
          Option.isSome(manimSnapshot)
            ? renderScene(sandbox, input, timeout)
            : installManim(sandbox, timeout).pipe(
                Effect.andThen(renderScene(sandbox, input, timeout)),
              ),
        );
      }),
    });
  }),
);
