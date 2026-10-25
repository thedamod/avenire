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

describe("Cloud task contracts", () => {
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

  it("requires task occurrence fields on every Cloud run", () => {
    const input = {
      id: "run-1",
      status: "scheduled",
      taskId: "task-1",
      taskTitle: "Nightly study digest",
      scheduledFor: "2026-10-10T03:00:00Z",
      attempt: 1,
      summary: null,
      folderId: null,
      reportMessageId: null,
      startHere: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      assets: [],
    };
    expect(Schema.decodeUnknownSync(CloudRun)(input)).toEqual(input);
    for (const field of ["taskId", "taskTitle", "scheduledFor", "attempt", "summary"]) {
      const legacy: Record<string, unknown> = { ...input };
      delete legacy[field];
      expect(() => Schema.decodeUnknownSync(CloudRun)(legacy)).toThrow();
    }
    for (const name of ["cloud.getSchedule", "cloud.setSchedule", "cloud.runNow"])
      expect(CloudRpcs.requests.has(name)).toBe(false);
  });
});
