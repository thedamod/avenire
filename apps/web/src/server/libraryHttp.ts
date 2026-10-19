/** REST only decodes HTTP values; Library owns every library mutation and ownership check. */
import { authenticate } from "@avenire/auth/middleware";
import {
  CreateFolderRequest,
  CurrentUser,
  FileId,
  LibraryRpcs,
  type ApiError,
} from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as RpcGroup from "effect/rpc/RpcGroup";
import { decodeRequest, domainResponse } from "./domainHttp.ts";
import { HttpRequestError, readJsonBody } from "./http.ts";
import { Library } from "./library.ts";
import { assertMutationOrigin } from "./session.ts";

type LibraryRpc = RpcGroup.Rpcs<typeof LibraryRpcs>;
/** Reuse the exact wire contract rather than maintaining a second set of request fields. */
const payload = <Tag extends LibraryRpc["_tag"]>(tag: Tag) =>
  LibraryRpcs.requests.get(tag)!.payloadSchema as Extract<
    LibraryRpc,
    { readonly _tag: Tag }
  >["payloadSchema"];
const jsonBody = Effect.fn("LibraryHttp.jsonBody")(function* (request: Request) {
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  )
    return yield* new HttpRequestError({
      status: 415,
      message: "Content-Type must be application/json.",
    });
  return yield* readJsonBody(request);
});
const body = <S extends Schema.Top & { readonly DecodingServices: never }>(
  request: Request,
  schema: S,
) => jsonBody(request).pipe(Effect.flatMap((value) => decodeRequest(schema, value)));
const fileIdBody = (request: Request, id: string) =>
  jsonBody(request).pipe(
    Effect.map((value) =>
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? { ...value, fileId: id }
        : value,
    ),
  );

export const filesResponse = (request: Request) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const filters = yield* decodeRequest(
        payload("library.listFiles"),
        Object.fromEntries(new URL(request.url).searchParams),
      );
      return yield* (yield* Library).listFiles((yield* CurrentUser).id, filters);
    }),
  );
export const fileResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      return yield* (yield* Library).getFile(
        (yield* CurrentUser).id,
        yield* decodeRequest(FileId, id),
      );
    }),
  );
export const captureResponse = (request: Request) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const { snapshot } = yield* body(request, payload("library.submitCapture"));
      return yield* (yield* Library).submitCapture((yield* CurrentUser).id, snapshot);
    }),
  );
export const placementResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const { fileId, folderIds } = yield* fileIdBody(request, id).pipe(
        Effect.flatMap((value) => decodeRequest(payload("library.placeFile"), value)),
      );
      return yield* (yield* Library).placeFile((yield* CurrentUser).id, fileId, folderIds);
    }),
  );
export const foldersResponse = (request: Request) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const library = yield* Library;
      const viewer = yield* CurrentUser;
      if (request.method === "POST") {
        const { name } = yield* body(request, CreateFolderRequest);
        return yield* library.createFolder(viewer.id, name);
      }
      return yield* library.listFolders(viewer.id);
    }),
    request.method === "POST" ? 201 : 200,
  );
export const renameFolderResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const value = yield* jsonBody(request);
      const { folderId, name } = yield* decodeRequest(
        payload("library.renameFolder"),
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? { ...value, folderId: id }
          : value,
      );
      return yield* (yield* Library).renameFolder((yield* CurrentUser).id, folderId, name);
    }),
  );
export const fileEventResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const { fileId } = yield* fileIdBody(request, id).pipe(
        Effect.flatMap((value) => decodeRequest(payload("library.recordFileEvent"), value)),
      );
      return yield* (yield* Library).recordFileEvent((yield* CurrentUser).id, fileId);
    }),
    204,
  );
export const ingestionPausedResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const { fileId, paused } = yield* fileIdBody(request, id).pipe(
        Effect.flatMap((value) => decodeRequest(payload("library.setIngestionPaused"), value)),
      );
      return yield* (yield* Library).setIngestionPaused((yield* CurrentUser).id, fileId, paused);
    }),
  );
export const ingestionStreamResponse = (request: Request) =>
  Effect.gen(function* () {
    yield* assertMutationOrigin(request);
    const viewer = yield* authenticate(request.headers);
    const library = yield* Library;
    const encoder = new TextEncoder();
    const stream = library.watchIngestion(viewer.id).pipe(
      Stream.map((job) => encoder.encode(`${JSON.stringify(job)}\n`)),
      Stream.catch((error: ApiError) =>
        Stream.succeed(encoder.encode(`${JSON.stringify({ error: error._tag })}\n`)),
      ),
    );
    return new Response(Stream.toReadableStream(stream), {
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "private, no-store",
        "x-accel-buffering": "no",
      },
    });
  }).pipe(
    Effect.catchTag("Unauthorized", () =>
      Effect.succeed(Response.json({ error: "Sign in to continue." }, { status: 401 })),
    ),
  );
