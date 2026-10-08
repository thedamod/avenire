import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import * as Schema from "effect/Schema";

import { type BenchmarkArtifact, Dataset, Manifest } from "./domain.ts";

const ffmpeg = promisify(execFile);
export const dataRoot = resolve(import.meta.dirname, "../../data/v1");
export const defaultCorpusDir = resolve(dataRoot, ".cache");
export const digest = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

export const readContracts = async () => {
  const [manifestBytes, datasetBytes] = await Promise.all([
    readFile(resolve(dataRoot, "manifest.json")),
    readFile(resolve(dataRoot, "dataset.json")),
  ]);
  return {
    manifest: Schema.decodeUnknownSync(Manifest)(JSON.parse(manifestBytes.toString("utf8"))),
    dataset: Schema.decodeUnknownSync(Dataset)(JSON.parse(datasetBytes.toString("utf8"))),
    manifestHash: digest(manifestBytes),
    datasetHash: digest(datasetBytes),
  };
};

export const artifactPath = (corpusDir: string, artifact: BenchmarkArtifact): string => {
  const root = resolve(corpusDir);
  const path = resolve(root, artifact.path);
  if (!path.startsWith(`${root}${sep}`))
    throw new Error(`Artifact path escapes corpus: ${artifact.path}`);
  return path;
};

export const verify = (artifact: BenchmarkArtifact, bytes: Uint8Array): void => {
  if (bytes.byteLength !== artifact.byteSize) {
    throw new Error(`${artifact.id}: expected ${artifact.byteSize} bytes, got ${bytes.byteLength}`);
  }
  const actual = digest(bytes);
  if (actual !== artifact.sha256) throw new Error(`${artifact.id}: SHA-256 mismatch: ${actual}`);
};

export const readArtifact = async (
  corpusDir: string,
  artifact: BenchmarkArtifact,
): Promise<Uint8Array | null> => {
  try {
    const bytes = new Uint8Array(await readFile(artifactPath(corpusDir, artifact)));
    verify(artifact, bytes);
    return bytes;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return null;
    throw cause;
  }
};

const download = async (url: string): Promise<Uint8Array> => {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "AvenireRetrievalBenchmark/0.1" },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (cause) {
      last = cause;
      if (attempt < 4) await new Promise((done) => setTimeout(done, 250 * 2 ** attempt));
    }
  }
  throw last;
};

const mediaClip = async (
  artifact: BenchmarkArtifact,
  source: Uint8Array,
  outputPath: string,
): Promise<Uint8Array> => {
  const derivation = artifact.derivation;
  if (!derivation) throw new Error(`${artifact.id}: missing media derivation`);
  const sourcePath = `${outputPath}.upstream.partial`;
  const partialPath = `${outputPath}.partial`;
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await writeFile(sourcePath, source);
    const audio = artifact.format === "ogg";
    await ffmpeg("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(derivation.startMs / 1000),
      "-t",
      String((derivation.endMs - derivation.startMs) / 1000),
      "-i",
      sourcePath,
      "-map",
      "0",
      "-c",
      "copy",
      "-map_metadata",
      "-1",
      "-fflags",
      "+bitexact",
      ...(audio
        ? ["-flags:a", "+bitexact", "-serial_offset", String(derivation.serialOffset ?? 0)]
        : ["-flags:v", "+bitexact", "-flags:a", "+bitexact"]),
      "-f",
      artifact.format,
      partialPath,
    ]);
    return new Uint8Array(await readFile(partialPath));
  } finally {
    await Promise.all([
      unlink(sourcePath).catch(() => undefined),
      unlink(partialPath).catch(() => undefined),
    ]);
  }
};

const writeAtomic = async (path: string, bytes: Uint8Array): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const partial = `${path}.download.partial`;
  try {
    await writeFile(partial, bytes);
    await rename(partial, path);
  } finally {
    await unlink(partial).catch(() => undefined);
  }
};

export interface FetchResult {
  readonly id: string;
  readonly status: "reused" | "downloaded" | "failed";
  readonly reason?: string;
}

export const fetchCorpus = async (corpusDir: string): Promise<FetchResult[]> => {
  const { manifest } = await readContracts();
  const sources = new Map<string, Promise<Uint8Array>>();
  const artifacts = manifest.artifacts.filter((artifact) => artifact.downloadUrl !== undefined);
  const results: FetchResult[] = [];
  for (const artifact of artifacts) {
    try {
      if (await readArtifact(corpusDir, artifact)) {
        results.push({ id: artifact.id, status: "reused" });
        continue;
      }
      const url = artifact.downloadUrl;
      if (!url) throw new Error("Missing download URL");
      let pending = sources.get(url);
      if (!pending) {
        pending = download(url);
        sources.set(url, pending);
      }
      const upstream = await pending;
      const upstreamSize = artifact.upstreamByteSize ?? artifact.byteSize;
      const upstreamHash = artifact.upstreamSha256 ?? artifact.sha256;
      if (upstream.byteLength !== upstreamSize || digest(upstream) !== upstreamHash) {
        throw new Error(`${artifact.id}: upstream size or SHA-256 mismatch`);
      }
      const path = artifactPath(corpusDir, artifact);
      const output = artifact.derivation ? await mediaClip(artifact, upstream, path) : upstream;
      verify(artifact, output);
      await writeAtomic(path, output);
      results.push({ id: artifact.id, status: "downloaded" });
    } catch (cause) {
      results.push({ id: artifact.id, status: "failed", reason: String(cause) });
    }
  }
  return results;
};

const referenceDataRoot = resolve(
  dataRoot,
  "../../../../context/avenire/packages/retrieval-benchmark/data",
);

const importFromReference = async (
  corpusDir: string,
  artifact: BenchmarkArtifact,
): Promise<FetchResult> => {
  try {
    if (await readArtifact(corpusDir, artifact)) return { id: artifact.id, status: "reused" };
    const sourcePath = resolve(referenceDataRoot, artifact.path);
    if (!sourcePath.startsWith(`${referenceDataRoot}${sep}`))
      throw new Error("Source path escapes v1 data root");
    const bytes = new Uint8Array(await readFile(sourcePath));
    verify(artifact, bytes);
    await writeAtomic(artifactPath(corpusDir, artifact), bytes);
    return { id: artifact.id, status: "downloaded" };
  } catch (cause) {
    const missing = cause instanceof Error && "code" in cause && cause.code === "ENOENT";
    return {
      id: artifact.id,
      status: "failed",
      reason: missing
        ? `Missing local ${artifact.id.startsWith("mit-") ? "MIT archive" : "fixture"} file: ${artifact.path}; v1 provides no download URL`
        : String(cause),
    };
  }
};

/**
 * MIT OpenCourseWare serves a course's static resources at the course URL plus the
 * resource's file name, which is the last segment of the manifest path.
 */
const ocwUrl = (artifact: BenchmarkArtifact): string | undefined =>
  artifact.canonicalUrl?.startsWith("https://ocw.mit.edu/courses/")
    ? `${artifact.canonicalUrl.replace(/\/?$/, "/")}${artifact.path.split("/").at(-1)}`
    : undefined;

export const importMit = async (corpusDir: string): Promise<FetchResult[]> => {
  const { manifest } = await readContracts();
  return Promise.all(
    manifest.artifacts
      .filter((artifact) => artifact.id.startsWith("mit-"))
      .map(async (artifact): Promise<FetchResult> => {
        if ((await readArtifact(corpusDir, artifact)) !== null) {
          return { id: artifact.id, status: "reused" };
        }
        const url = ocwUrl(artifact);
        if (url === undefined) return importFromReference(corpusDir, artifact);
        try {
          const bytes = await download(url);
          verify(artifact, bytes);
          await writeAtomic(artifactPath(corpusDir, artifact), bytes);
          return { id: artifact.id, status: "downloaded" };
        } catch (cause) {
          return { id: artifact.id, status: "failed", reason: String(cause) };
        }
      }),
  );
};

export const importLocalFixtures = async (corpusDir: string): Promise<FetchResult[]> => {
  const { manifest } = await readContracts();
  return Promise.all(
    manifest.artifacts
      .filter((artifact) => artifact.downloadUrl === undefined && !artifact.id.startsWith("mit-"))
      .map((artifact) => importFromReference(corpusDir, artifact)),
  );
};
