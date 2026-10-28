import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { accessForHttp, failureAccess } from "./access.ts";
import { AcquisitionError } from "./acquisition.ts";
import { ExtractionError, SourceAccessError } from "./types.ts";
import { extractWeb } from "./web.ts";
import { extract, type ExtractionServices } from "./index.ts";
import { MediaProcessor } from "./media.ts";
import { RemoteMedia, RemoteMediaError } from "./remote.ts";
const html = (body: string) => `<html><head><title>Study</title></head><body>${body}</body></html>`;
it.effect("401 and 402 have typed access, while 403 requires login or subscription evidence", () =>
  Effect.sync(() => {
    expect(accessForHttp(401)).toBe("login-required");
    expect(accessForHttp(402)).toBe("paywalled");
    expect(accessForHttp(403)).toBeUndefined();
    expect(accessForHttp(403, html("Forbidden by firewall"))).toBeUndefined();
    expect(
      accessForHttp(403, html('<form><input type="password">Sign in to continue</form>')),
    ).toBe("login-required");
    expect(accessForHttp(403, html("<div data-paywall>Subscribe to read</div>"))).toBe("paywalled");
    expect(accessForHttp(429, html("Too many requests"))).toBeUndefined();
    expect(accessForHttp(500)).toBeUndefined();
    expect(
      failureAccess(
        new ExtractionError({
          source: "public-fetch",
          cause: new AcquisitionError({ reason: "http", status: 401, cause: "HTTP failure" }),
        }),
      ),
    ).toBe("login-required");
    expect(
      failureAccess(new AcquisitionError({ reason: "network", cause: "Network offline" })),
    ).toBeUndefined();
    expect(failureAccess({ status: 401, cause: "Provider authentication" })).toBeUndefined();
  }),
);
it.effect(
  "HTML classification travels with extracted text and preserves subscriber access evidence",
  () =>
    Effect.gen(function* () {
      const blocked = yield* extractWeb(
        "https://example.org",
        new TextEncoder().encode(
          html(
            '<script type="application/ld+json">{"isAccessibleForFree":false,"wordCount":1000}</script><article>Abstract</article><div class="paywall">Subscribe</div>',
          ),
        ),
      );
      expect(blocked.access).toBe("paywalled");
      const readable = yield* extractWeb(
        "https://example.org",
        new TextEncoder().encode(
          html(
            '<script type="application/ld+json">{"isAccessibleForFree":false}</script><article>' +
              "Readable content ".repeat(150) +
              '</article><div class="paywall" hidden>Subscribe</div>',
          ),
        ),
      );
      expect(readable.access).toBe("open");
    }),
);
it.effect(
  "remote metadata access and network failures survive extraction instead of becoming unsupported",
  () =>
    Effect.gen(function* () {
      for (const cause of [
        new AcquisitionError({ reason: "http", status: 402, cause: "HTTP failure" }),
        new AcquisitionError({ reason: "network", cause: "Network offline" }),
      ]) {
        const result = yield* extract({
          kind: "audio",
          title: "Lecture",
          sourceUrl: "https://example.org/audio.mp3",
          mimeType: null,
          bytes: null,
        }).pipe(
          Effect.provideContext(
            Context.make(
              RemoteMedia,
              RemoteMedia.of({
                metadata: () => Effect.fail(new RemoteMediaError({ operation: "metadata", cause })),
                captions: () => Effect.die("unused"),
                audio: () => Effect.die("unused"),
              }),
            ) as Context.Context<ExtractionServices>,
          ),
          Effect.result,
        );
        expect(result).toMatchObject({ failure: { _tag: "ExtractionError" } });
        if (result._tag === "Failure")
          expect(failureAccess(result.failure)).toBe(
            cause.status === 402 ? "paywalled" : undefined,
          );
      }
    }),
);

it.effect("remote caption and audio access observations survive optional extraction steps", () =>
  Effect.gen(function* () {
    for (const operation of ["captions", "audio"] as const) {
      const cause = new AcquisitionError({
        reason: "http",
        status: operation === "captions" ? 401 : 402,
        cause: "Access required",
      });
      const remote = RemoteMedia.of({
        metadata: () =>
          Effect.succeed({
            title: "Lecture",
            chapters: [],
            subtitleLanguages: [],
            automaticCaptionLanguages: [],
          }),
        captions: () =>
          operation === "captions"
            ? Effect.fail(new RemoteMediaError({ operation, cause }))
            : Effect.succeed(undefined),
        audio: () => Effect.fail(new RemoteMediaError({ operation: "audio", cause })),
      });
      const result = yield* extract({
        kind: "audio",
        title: "Lecture",
        sourceUrl: "https://example.org/lecture.mp3",
        mimeType: null,
        bytes: null,
      }).pipe(
        Effect.provideContext(
          Context.make(RemoteMedia, remote).pipe(
            Context.add(MediaProcessor, {} as MediaProcessor["Service"]),
          ) as Context.Context<ExtractionServices>,
        ),
        Effect.result,
      );
      expect(result).toMatchObject({ failure: { _tag: "ExtractionError" } });
      if (result._tag === "Failure")
        expect(failureAccess(result.failure)).toBe(
          operation === "captions" ? "login-required" : "paywalled",
        );
    }
  }),
);
