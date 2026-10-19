import { expect, it } from "@effect/vitest";
import { FileId, IngestionJobId, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import { PDFDocument } from "pdf-lib";
import { beforeEach, vi } from "vite-plus/test";

import { FileIndexer } from "../indexer.ts";
import { IngestionError, IngestionPipeline, IngestionPipelineLive } from "../pipeline.ts";
import { AcquisitionError, acquireSource } from "./acquisition.ts";
import { extract, type ExtractionServices } from "./index.ts";
import { Ocr } from "./ocr.ts";
import { MediaProcessor } from "./media.ts";
import { TranscriptCache } from "./transcript-cache.ts";
import { Transcriber } from "./transcribe.ts";
import type { SourceInput } from "./types.ts";

vi.mock("./acquisition.ts", async (original) => ({
  ...(await original<typeof import("./acquisition.ts")>()),
  acquireSource: vi.fn(() => Effect.die("Unexpected public network acquisition")),
}));

const encoder = new TextEncoder();
const source = (values: Partial<SourceInput>): SourceInput => ({
  kind: "web-page",
  title: "Captured source",
  mimeType: null,
  sourceUrl: "https://private.example.test/document",
  bytes: null,
  ...values,
});
const html = encoder.encode(
  "<!doctype html><html><head><title>Study</title></head><body><article><h1>Study</h1><p>Server parsing keeps the original captured content available to the student.</p></article></body></html>",
);
const pdf = () =>
  Effect.promise(async () => {
    const document = await PDFDocument.create();
    document.addPage();
    return document.save();
  });
const ocrCalls: Uint8Array[] = [];
const context = Context.make(
  Ocr,
  Ocr.of({
    model: "server-test",
    pdf: (bytes) =>
      Effect.sync(() => {
        ocrCalls.push(bytes);
        return [{ page: 1, markdown: "Server OCR recognizes the uploaded private PDF." }];
      }),
    image: () => Effect.die("Unexpected image OCR"),
  }),
) as Context.Context<ExtractionServices>;
const run = (input: SourceInput) => extract(input).pipe(Effect.provideContext(context));

beforeEach(() => {
  vi.clearAllMocks();
  ocrCalls.length = 0;
});

it.effect("uses stored PDF bytes and server OCR even when provenance is a private media URL", () =>
  Effect.gen(function* () {
    const bytes = yield* pdf();
    const document = yield* run(
      source({
        bytes,
        acquisitionMode: "stored",
        mimeType: "text/html",
        sourceUrl: "https://www.youtube.com/watch?v=private",
      }),
    );
    expect(document.sections[0]?.text).toContain("Server OCR");
    expect(ocrCalls).toHaveLength(1);
    expect(ocrCalls[0]).toEqual(bytes);
    expect(acquireSource).not.toHaveBeenCalled();
  }),
);

it.effect("parses a private stored HTML snapshot without following its citation URL", () =>
  Effect.gen(function* () {
    const document = yield* run(
      source({ bytes: html, mimeType: "text/html", acquisitionMode: "stored" }),
    );
    expect(
      document.sections.some((section) => section.text.includes("original captured content")),
    ).toBe(true);
    expect(acquireSource).not.toHaveBeenCalled();
  }),
);

it.effect(
  "transcribes uploaded media on the server and never acquires its private provenance URL",
  () =>
    Effect.gen(function* () {
      const bytes = encoder.encode("ID3stored audio fixture");
      let transcriptions = 0;
      const services = Context.make(
        MediaProcessor,
        MediaProcessor.of({
          probe: () => Effect.succeed({ durationSec: 1, hasVideo: false }),
          audioSegments: (original) => {
            expect(original).toEqual(bytes);
            return Effect.succeed([{ offsetSec: 0, bytes, mimeType: "audio/mpeg" }]);
          },
          embeddedCaptions: () => Effect.die("Unexpected captions"),
          sceneFrames: () => Effect.die("Unexpected frames"),
        }),
      ).pipe(
        Context.add(
          Transcriber,
          Transcriber.of({
            model: "server-test",
            transcribe: (audio) =>
              Effect.sync(() => {
                expect(audio).toEqual(bytes);
                transcriptions++;
                return [{ text: "Private lecture transcript", startSec: 0, endSec: 1 }];
              }),
          }),
        ),
        Context.add(TranscriptCache, {
          lookup: () => Effect.succeed(undefined),
          store: () => Effect.void,
        }),
      ) as Context.Context<ExtractionServices>;
      const document = yield* extract(
        source({
          bytes,
          acquisitionMode: "stored",
          sourceUrl: "https://drive.google.com/file/d/private/view",
        }),
      ).pipe(Effect.provideContext(services));
      expect(transcriptions).toBe(1);
      expect(
        document.sections.some((section) => section.text.includes("Private lecture transcript")),
      ).toBe(true);
      expect(acquireSource).not.toHaveBeenCalled();
    }),
);

it.effect("never falls back to provenance for missing or unsupported stored originals", () =>
  Effect.gen(function* () {
    for (const bytes of [null, new Uint8Array([0, 1, 2])]) {
      const result = yield* Effect.result(
        run(source({ kind: "document", bytes, acquisitionMode: "stored" })),
      );
      expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "UnsupportedSource" } });
    }
    expect(acquireSource).not.toHaveBeenCalled();
  }),
);

it.effect("acquires public HTML anonymously then parses on the server", () =>
  Effect.gen(function* () {
    vi.mocked(acquireSource).mockReturnValueOnce(
      Effect.succeed({ bytes: html, mimeType: "text/html; charset=utf-8" }),
    );
    const document = yield* run(source({ acquisitionMode: "public-url" }));
    expect(
      document.sections.some((section) => section.text.includes("original captured content")),
    ).toBe(true);
    expect(acquireSource).toHaveBeenCalledWith("https://private.example.test/document", {
      maxBytes: 50 * 1024 * 1024,
    });
  }),
);

it.effect.each(["pdf", "web-page"] as const)(
  "acquires a public %s PDF and dispatches its actual bytes to server OCR",
  (kind) =>
    Effect.gen(function* () {
      const bytes = yield* pdf();
      vi.mocked(acquireSource).mockReturnValueOnce(
        Effect.succeed({ bytes: new Uint8Array(bytes), mimeType: "application/octet-stream" }),
      );
      const document = yield* run(
        source({
          kind,
          acquisitionMode: "public-url",
          sourceUrl: "https://public.example.test/download?id=123",
        }),
      );
      expect(document.sections[0]?.text).toContain("Server OCR");
      expect(ocrCalls).toHaveLength(1);
      expect(acquireSource).toHaveBeenCalledTimes(1);
    }),
);

it.effect.each([401, 403])(
  "returns device acquisition guidance on HTTP %s without trying session credentials",
  (status) =>
    Effect.gen(function* () {
      vi.mocked(acquireSource).mockReturnValueOnce(
        Effect.fail(new AcquisitionError({ reason: "network", cause: "Access required", status })),
      );
      const result = yield* Effect.result(run(source({ acquisitionMode: "public-url" })));
      expect(result).toMatchObject({
        failure: { _tag: "UnsupportedSource", reason: expect.stringContaining("on your device") },
      });
      if (result._tag === "Failure") {
        expect(
          new IngestionError({ stage: "extracting", cause: result.failure }).message,
        ).toContain("on your device");
      }
      expect(acquireSource).toHaveBeenCalledTimes(1);
    }),
);

it.effect("does not treat a PDF login response as the original PDF", () =>
  Effect.gen(function* () {
    vi.mocked(acquireSource).mockReturnValueOnce(
      Effect.succeed({ bytes: html, mimeType: "text/html" }),
    );
    const result = yield* Effect.result(
      run(source({ kind: "pdf", acquisitionMode: "public-url" })),
    );
    expect(result).toMatchObject({
      failure: { _tag: "UnsupportedSource", reason: expect.stringContaining("on your device") },
    });
    expect(ocrCalls).toHaveLength(0);
  }),
);

it.effect("fails the pipeline at original storage read without any URL fallback or indexing", () =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const db = {
      query: {
        file: {
          findFirst: async () => ({ ...source({}), storageKey: "missing-private-original" }),
        },
      },
    };
    const database = Database.of({
      db: db as never,
      use: (fn) => Effect.promise(() => fn(db as never)),
      useTransaction: () => Effect.die("Unexpected publication"),
    });
    const services = Context.make(Database, database).pipe(
      Context.add(Storage, storage),
      Context.add(FileIndexer, { index: () => Effect.die("Must not index unavailable originals") }),
    ) as Context.Context<Database | Storage | FileIndexer | Crypto.Crypto | ExtractionServices>;
    const program = Effect.gen(function* () {
      const pipeline = yield* IngestionPipeline;
      return yield* Effect.result(
        pipeline.run({
          id: IngestionJobId.make("job"),
          userId: UserId.make("owner"),
          fileId: FileId.make("file"),
          generation: 1,
          claimToken: "token",
          attempts: 1,
        }),
      );
    }).pipe(Effect.provide(IngestionPipelineLive), Effect.provideContext(services));
    expect(yield* program).toMatchObject({
      failure: {
        _tag: "IngestionError",
        stage: "reading the source",
        cause: { _tag: "ObjectNotFound" },
      },
    });
    expect(acquireSource).not.toHaveBeenCalled();
  }).pipe(Effect.provide(StorageMemory)),
);
