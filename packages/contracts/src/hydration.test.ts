import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { CloudRun, CloudTaskInput, CloudTaskSchedule } from "./cloud.ts";
import { FileSelector, HydrationRule } from "./hydration.ts";
import { CloudRpcs } from "./rpc.ts";

const decodeSelector = Schema.decodeUnknownSync(FileSelector);

describe("hydration selectors", () => {
  it("preserves omitted selector parts and limits", () => {
    expect(decodeSelector({})).toEqual({});
    expect(Schema.decodeUnknownSync(HydrationRule)({ selector: {} })).toEqual({ selector: {} });
  });

  it("accepts inclusive day and relevance bounds", () => {
    for (const lastDays of [1, 365]) {
      for (const minRelevance of [0, 1]) {
        const input = { time: { lastDays }, topic: { query: "thermodynamics", minRelevance } };
        expect(decodeSelector(input)).toEqual(input);
      }
    }
  });

  it("rejects fractional or out-of-range days and relevance", () => {
    for (const lastDays of [0, 366, 1.5]) {
      expect(() => decodeSelector({ time: { lastDays } })).toThrow();
    }
    for (const minRelevance of [-0.01, 1.01]) {
      expect(() => decodeSelector({ topic: { query: "heat", minRelevance } })).toThrow();
    }
    expect(() => decodeSelector({ topic: { query: "" } })).toThrow();
  });
});

describe("additive Cloud contracts", () => {
  it("uses tagged cron and once schedules", () => {
    const decode = Schema.decodeUnknownSync(CloudTaskSchedule);
    expect(decode({ _tag: "cron", expression: "0 3 * * *" })).toEqual({
      _tag: "cron",
      expression: "0 3 * * *",
    });
    expect(decode({ _tag: "once", at: "2026-10-10T03:00:00Z" })._tag).toBe("once");
  });

  it("accepts a partial task patch while retaining input validation", () => {
    const rpc = CloudRpcs.requests.get("cloud.updateTask")!;
    const decode = Schema.decodeUnknownSync(rpc.payloadSchema);
    expect(decode({ taskId: "task-1", patch: { enabled: false } })).toEqual({
      taskId: "task-1",
      patch: { enabled: false },
    });
    expect(() => decode({ taskId: "task-1", patch: { title: "" } })).toThrow();
    expect(() => Schema.decodeUnknownSync(CloudTaskInput)({ enabled: false })).toThrow();
  });

  it("continues decoding legacy Cloud runs without task fields", () => {
    const input = {
      id: "run-1",
      status: "scheduled",
      windowStart: "2026-10-09T00:00:00Z",
      windowEnd: "2026-10-10T00:00:00Z",
      startedAt: null,
      finishedAt: null,
      error: null,
      artifacts: [],
    };
    expect(Schema.decodeUnknownSync(CloudRun)(input)).toEqual(input);
  });
});
