/** HTTP adapters call the same authenticated handlers as RPC, without a network loop. */
import { authenticate } from "@avenire/auth/middleware";
import {
  ApprovalDecision,
  AssetId,
  CloudRunId,
  CloudTaskId,
  CloudTaskInput,
  CloudTaskPatch,
  CreateThreadRequest,
  CurrentUser,
  ListAssetsRequest,
  ListCloudApprovalsRequest,
  ListCloudRunsRequest,
  PendingApprovalId,
  SearchQuery,
  ThreadId,
} from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { AssetsHandlers, CloudHandlers, RuthHandlers, SearchHandlers } from "./domainRpc.ts";
import { HttpRequestError, readJsonBody } from "./http.ts";
import { assertMutationOrigin } from "./session.ts";

export const decodeRequest = <S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  value: unknown,
) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(
      () => new HttpRequestError({ status: 400, message: "Invalid request parameters." }),
    ),
  );
const jsonBody = Effect.fn("DomainHttp.jsonBody")(function* (request: Request) {
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
const query = (request: Request) => Object.fromEntries(new URL(request.url).searchParams);
const AccessBody = Schema.Struct({ enabled: Schema.Boolean });
const DecisionBody = Schema.Struct({ decision: ApprovalDecision });

/** Errors are sanitized here so both tests and production exercise the same status mapping. */
export const domainResponse = <E, R>(
  request: Request,
  operation: Effect.Effect<unknown, E, R | CurrentUser>,
  status = 200,
) =>
  Effect.gen(function* () {
    yield* assertMutationOrigin(request);
    const viewer = yield* authenticate(request.headers);
    const result = yield* operation.pipe(Effect.provideService(CurrentUser, viewer));
    return status === 204
      ? new Response(null, { status })
      : Response.json(result, {
          status,
          headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
        });
  }).pipe(
    Effect.catchIf(
      (error): error is E & { readonly _tag: string } =>
        typeof error === "object" && error !== null && "_tag" in error,
      (error) => {
        const tag = error._tag;
        const status =
          error instanceof HttpRequestError
            ? error.status
            : tag === "Unauthorized"
              ? 401
              : tag === "NotFound"
                ? 404
                : tag === "Conflict"
                  ? 409
                  : 500;
        const message =
          error instanceof HttpRequestError
            ? error.message
            : status === 401
              ? "Sign in to continue."
              : status === 404
                ? "Resource not found."
                : status === 409
                  ? "This action conflicts with the current state."
                  : "The request could not be completed.";
        return Effect.succeed(
          Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } }),
        );
      },
    ),
  );

export const searchResponse = (request: Request) =>
  domainResponse(
    request,
    body(request, SearchQuery).pipe(Effect.flatMap(SearchHandlers["search.query"])),
  );
export const threadsResponse = (request: Request) =>
  domainResponse(
    request,
    request.method === "POST"
      ? body(request, CreateThreadRequest).pipe(Effect.flatMap(RuthHandlers["ruth.createThread"]))
      : RuthHandlers["ruth.listThreads"](),
    request.method === "POST" ? 201 : 200,
  );
export const messagesResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    decodeRequest(ThreadId, id).pipe(
      Effect.flatMap((threadId) => RuthHandlers["ruth.listMessages"]({ threadId })),
    ),
  );
export const accessResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const threadId = yield* decodeRequest(ThreadId, id);
      const { enabled } = yield* body(request, AccessBody);
      return yield* RuthHandlers["ruth.setFullAccess"]({ threadId, enabled });
    }),
  );
export const tasksResponse = (request: Request) =>
  domainResponse(
    request,
    request.method === "POST"
      ? body(request, CloudTaskInput).pipe(Effect.flatMap(CloudHandlers["cloud.createTask"]))
      : CloudHandlers["cloud.listTasks"](),
    request.method === "POST" ? 201 : 200,
  );
export const taskResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const taskId = yield* decodeRequest(CloudTaskId, id);
      if (request.method === "DELETE") return yield* CloudHandlers["cloud.deleteTask"]({ taskId });
      const patch = yield* body(request, CloudTaskPatch);
      return yield* CloudHandlers["cloud.updateTask"]({ taskId, patch });
    }),
    request.method === "DELETE" ? 204 : 200,
  );
export const startRunResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    decodeRequest(CloudTaskId, id).pipe(
      Effect.flatMap((taskId) => CloudHandlers["cloud.runTaskNow"]({ taskId })),
    ),
    202,
  );
export const runsResponse = (request: Request) =>
  domainResponse(
    request,
    Effect.suspend(() => {
      const values = query(request);
      return decodeRequest(ListCloudRunsRequest, {
        ...values,
        ...(values.limit === undefined ? {} : { limit: Number(values.limit) }),
      }).pipe(Effect.flatMap(CloudHandlers["cloud.listRuns"]));
    }),
  );
export const cancelRunResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    decodeRequest(CloudRunId, id).pipe(
      Effect.flatMap((runId) => CloudHandlers["cloud.cancelRun"]({ runId })),
    ),
  );
export const approvalsResponse = (request: Request) =>
  domainResponse(
    request,
    Effect.suspend(() => {
      const values = query(request);
      return decodeRequest(ListCloudApprovalsRequest, {
        ...values,
        ...(values.includeResolved === "true"
          ? { includeResolved: true }
          : values.includeResolved === "false"
            ? { includeResolved: false }
            : {}),
      }).pipe(Effect.flatMap(CloudHandlers["cloud.listPendingApprovals"]));
    }),
  );
export const approvalDecisionResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const approvalId = yield* decodeRequest(PendingApprovalId, id);
      const { decision } = yield* body(request, DecisionBody);
      return yield* CloudHandlers["cloud.resolveApproval"]({ approvalId, decision });
    }),
  );
export const runDecisionResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const runId = yield* decodeRequest(CloudRunId, id);
      const { decision } = yield* body(request, DecisionBody);
      return yield* CloudHandlers["cloud.resolveRun"]({ runId, decision });
    }),
  );
export const assetsResponse = (request: Request) =>
  domainResponse(
    request,
    decodeRequest(ListAssetsRequest, query(request)).pipe(
      Effect.flatMap(AssetsHandlers["assets.list"]),
    ),
  );
export const assetResponse = (request: Request, id: string) =>
  domainResponse(
    request,
    decodeRequest(AssetId, id).pipe(
      Effect.flatMap((assetId) => AssetsHandlers["assets.get"]({ assetId })),
    ),
  );
