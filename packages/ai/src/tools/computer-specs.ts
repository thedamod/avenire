/** Client-safe schemas; no Daytona or database runtime imports. */
import * as Schema from "effect/Schema";
import { tool } from "ai";
import { standardSchema } from "./schema.ts";

const integer = (min: number, max: number) =>
  Schema.Int.check(Schema.isBetween({ minimum: min, maximum: max }));
const coordinate = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1600 }));
export const ComputerInput = Schema.Struct({
  action: Schema.Literals([
    "screenshot",
    "click",
    "double_click",
    "right_click",
    "move",
    "drag",
    "scroll",
    "type",
    "key",
    "hotkey",
    "wait",
  ]),
  x: Schema.optionalKey(coordinate),
  y: Schema.optionalKey(coordinate),
  toX: Schema.optionalKey(coordinate),
  toY: Schema.optionalKey(coordinate),
  direction: Schema.optionalKey(Schema.Literals(["up", "down", "left", "right"])),
  amount: Schema.optionalKey(integer(1, 100)),
  text: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(10000))),
  keys: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(5))),
  region: Schema.optionalKey(
    Schema.Struct({ x: coordinate, y: coordinate, width: coordinate, height: coordinate }),
  ),
});
export type ComputerInput = typeof ComputerInput.Type;
export const ComputerOutput = Schema.Struct({
  action: Schema.String,
  profile: Schema.String,
  coordinateContract: Schema.String,
  crop: Schema.NullOr(
    Schema.Struct({
      x: Schema.Number,
      y: Schema.Number,
      width: Schema.Number,
      height: Schema.Number,
    }),
  ),
  screenshot: Schema.Struct({
    id: Schema.String,
    data: Schema.String,
    mediaType: Schema.Literal("image/png"),
    sizeBytes: Schema.Int,
    width: Schema.Int,
    height: Schema.Int,
  }),
});
const spec = <I, O>(
  name: string,
  description: string,
  input: Schema.Codec<I>,
  output: Schema.Codec<O>,
) => ({
  name,
  description,
  inputSchema: standardSchema(input),
  outputSchema: standardSchema(output),
});
const path = Schema.NonEmptyString.check(Schema.isMaxLength(4096));
const command = Schema.NonEmptyString.check(Schema.isMaxLength(20000));
const job = Schema.Struct({ jobId: Schema.NonEmptyString });
export const COMPUTER_TOOL_SPECS = {
  computer: spec(
    "computer",
    "Perform one desktop action and inspect a fresh screenshot. Coordinates follow the active model profile in the system prompt. Crops are in that same space; returned crop pixels do not change the coordinate contract.",
    ComputerInput,
    ComputerOutput,
  ),
  screen_read: spec(
    "screen_read",
    "Read compact AT-SPI accessibility nodes before pixel interaction. Bounds use the active coordinate contract. Sparse/empty browser trees require screenshot fallback; do not invent nodes.",
    Schema.Struct({
      mode: Schema.Literals(["tree", "find"]),
      role: Schema.optionalKey(Schema.String),
      name: Schema.optionalKey(Schema.String),
      limit: Schema.optionalKey(integer(1, 200)),
    }),
    Schema.Struct({
      profile: Schema.String,
      nodes: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          role: Schema.String,
          name: Schema.String,
          actions: Schema.Array(Schema.String),
          bounds: Schema.NullOr(
            Schema.Struct({
              x: Schema.Number,
              y: Schema.Number,
              width: Schema.Number,
              height: Schema.Number,
            }),
          ),
        }),
      ),
      truncated: Schema.Boolean,
      note: Schema.String,
    }),
  ),
  box_exec: spec(
    "box_exec",
    "Run a bounded shell command in the isolated box workspace. timeoutSec is 1–900; output capped at 64 KiB. Hydrated inputs are source material; never edit them. Use box_command_start for long jobs.",
    Schema.Struct({ command, timeoutSec: Schema.optionalKey(integer(1, 900)) }),
    Schema.Struct({ exitCode: Schema.Int, output: Schema.String, truncated: Schema.Boolean }),
  ),
  box_command_start: spec(
    "box_command_start",
    "Start a long shell job in a Daytona session. Save the returned jobId and poll status/logs. Job ids persist across Cloud worker restarts.",
    Schema.Struct({ command }),
    Schema.Struct({ jobId: Schema.String, commandId: Schema.String }),
  ),
  box_command_status: spec(
    "box_command_status",
    "Reattach to a known job and read its exit status; null means running.",
    job,
    Schema.Struct({ jobId: Schema.String, exitCode: Schema.NullOr(Schema.Int) }),
  ),
  box_command_logs: spec(
    "box_command_logs",
    "Read the last 64 KiB of a known job's logs.",
    job,
    Schema.Struct({ jobId: Schema.String, output: Schema.String }),
  ),
  box_command_cancel: spec(
    "box_command_cancel",
    "Terminate a known job by deleting its isolated Daytona session.",
    job,
    Schema.Struct({ jobId: Schema.String, cancelled: Schema.Boolean }),
  ),
  box_read: spec(
    "box_read",
    "Read a UTF-8 file up to 1 MiB in the workspace or this user's read-only hydrated input root. Symlinks escaping those roots are rejected.",
    Schema.Struct({ path }),
    Schema.Struct({ path: Schema.String, content: Schema.String }),
  ),
  box_write: spec(
    "box_write",
    "Write UTF-8 content up to 10 MiB under /home/daytona/workspace. Hydrated inputs are read-only; symlink escapes are rejected.",
    Schema.Struct({ path, content: Schema.String.check(Schema.isMaxLength(10 * 1024 * 1024)) }),
    Schema.Struct({ path: Schema.String, sizeBytes: Schema.Int }),
  ),
  box_list: spec(
    "box_list",
    "List at most 200 entries in the workspace or this user's hydrated input root.",
    Schema.Struct({ path: Schema.optionalKey(path) }),
    Schema.Struct({
      entries: Schema.Array(
        Schema.Struct({ name: Schema.String, isDir: Schema.Boolean, size: Schema.Number }),
      ),
      truncated: Schema.Boolean,
    }),
  ),
};
export const computerToolSpecs = {
  computer: tool(COMPUTER_TOOL_SPECS.computer),
  screen_read: tool(COMPUTER_TOOL_SPECS.screen_read),
  box_exec: tool(COMPUTER_TOOL_SPECS.box_exec),
  box_command_start: tool(COMPUTER_TOOL_SPECS.box_command_start),
  box_command_status: tool(COMPUTER_TOOL_SPECS.box_command_status),
  box_command_logs: tool(COMPUTER_TOOL_SPECS.box_command_logs),
  box_command_cancel: tool(COMPUTER_TOOL_SPECS.box_command_cancel),
  box_read: tool(COMPUTER_TOOL_SPECS.box_read),
  box_write: tool(COMPUTER_TOOL_SPECS.box_write),
  box_list: tool(COMPUTER_TOOL_SPECS.box_list),
};
