import { expect, it, vi } from "vite-plus/test";
import { FileId, IngestionJobId, type IngestionJob } from "@avenire/contracts";
import {
  invalidateLibrary,
  pruneJobs,
  subscribeLibraryProjection,
  updateLatestJob,
} from "./library-projections.ts";

it("invalidates all mounted metadata projections without reloading canvas geometry or another session", () => {
  const runtime = {};
  const folders = vi.fn(),
    files = vi.fn(),
    geometry = vi.fn(),
    other = vi.fn();
  const unsubscribe = subscribeLibraryProjection(runtime, "canvas-folders", folders);
  subscribeLibraryProjection(runtime, "inbox-files", files);
  subscribeLibraryProjection(runtime, "canvas-nodes", geometry);
  subscribeLibraryProjection({}, "canvas-folders", other);
  invalidateLibrary(runtime, ["folders"]);
  expect(folders).toHaveBeenCalledTimes(1);
  expect(files).not.toHaveBeenCalled();
  expect(geometry).not.toHaveBeenCalled();
  expect(other).not.toHaveBeenCalled();
  unsubscribe();
  invalidateLibrary(runtime);
  expect(folders).toHaveBeenCalledTimes(1);
  expect(files).toHaveBeenCalledTimes(1);
});

it("indexes latest attempts, rejects replay rollback and prunes nonvisible files", () => {
  const fileId = FileId.make("file");
  const job: IngestionJob = {
    id: IngestionJobId.make("job"),
    fileId,
    status: "indexed",
    attempts: 1,
    error: null,
    coverage: null,
    createdAt: "2026-01-02",
    updatedAt: "2026-01-03",
  };
  const jobs = updateLatestJob(new Map(), job);
  expect(updateLatestJob(jobs, { ...job, status: "queued", updatedAt: "2026-01-02" })).toBe(jobs);
  expect(updateLatestJob(jobs, { ...job, createdAt: "2026-01-01", updatedAt: "2026-01-04" })).toBe(
    jobs,
  );
  expect(updateLatestJob(jobs, job, new Set())).toBe(jobs);
  expect(jobs.get(fileId)).toBe(job);
  expect(pruneJobs(jobs, new Set()).size).toBe(0);
});
