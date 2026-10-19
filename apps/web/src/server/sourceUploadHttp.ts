import { CreateSourceUpload, CurrentUser, SourceUploadId } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import { decodeRequest, domainResponse } from "./domainHttp.ts";
import { HttpRequestError, readJsonBody } from "./http.ts";
import { SourceUploads } from "./sourceUploads.ts";
import { WidgetHost, widgetHostDecision } from "./widgetHost.ts";

const asHttpError = <A, E, R>(operation: Effect.Effect<A, E, R>) =>
  operation.pipe(
    Effect.catchIf(
      (error): error is E & { _tag: "SourceUploadError"; status: number; message: string } =>
        typeof error === "object" &&
        error !== null &&
        "_tag" in error &&
        error._tag === "SourceUploadError",
      (error) =>
        Effect.fail(new HttpRequestError({ status: error.status, message: error.message })),
    ),
  );

/** Uploads bypass Next's buffering proxy, so enforce widget isolation before authentication. */
const uploadResponse = <E, R>(
  request: Request,
  operation: Effect.Effect<unknown, E, R | CurrentUser>,
  status = 200,
) =>
  Effect.gen(function* () {
    const policy = yield* WidgetHost;
    const url = new URL(request.url);
    if (
      widgetHostDecision(request.headers.get("host") ?? url.host, url.pathname, policy.host) !==
      "app"
    )
      return new Response(null, { status: 404 });
    return yield* domainResponse(request, operation, status);
  });

export const createUploadResponse = (request: Request) =>
  uploadResponse(
    request,
    Effect.gen(function* () {
      const input = yield* readJsonBody(request).pipe(
        Effect.flatMap((body) => decodeRequest(CreateSourceUpload, body)),
      );
      return yield* asHttpError((yield* SourceUploads).create((yield* CurrentUser).id, input));
    }),
    201,
  );
export const putUploadResponse = (request: Request, id: string) =>
  uploadResponse(
    request,
    Effect.gen(function* () {
      const uploadId = yield* decodeRequest(SourceUploadId, id);
      return yield* asHttpError(
        (yield* SourceUploads).put((yield* CurrentUser).id, uploadId, request),
      );
    }),
  );
export const cancelUploadResponse = (request: Request, id: string) =>
  uploadResponse(
    request,
    Effect.gen(function* () {
      const uploadId = yield* decodeRequest(SourceUploadId, id);
      return yield* asHttpError((yield* SourceUploads).cancel((yield* CurrentUser).id, uploadId));
    }),
    204,
  );
