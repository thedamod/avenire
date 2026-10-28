import { expect, it } from "@effect/vitest";
import { SourceWorkQueue } from "./work-queue.ts";

it("keeps a slot available for a document while videos wait", async () => {
  const queue = new SourceWorkQueue(3, 10);
  const started: string[] = [];
  const releases: (() => void)[] = [];
  const block = (name: string) => async () => {
    started.push(name);
    await new Promise<void>((resolve) => releases.push(resolve));
  };
  const jobs = [
    queue.run(100, block("video1")),
    queue.run(100, block("video2")),
    queue.run(100, block("video3")),
  ];
  await queue.run(1, async () => {
    started.push("document");
  });
  expect(started).toEqual(["video1", "video2", "document"]);
  releases.shift()!();
  releases.shift()!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(started).toContain("video3");
  releases.shift()!();
  await Promise.all(jobs);
});
