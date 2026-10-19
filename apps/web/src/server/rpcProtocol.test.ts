import { AuthenticationLive } from "@avenire/auth/middleware";
import { AuthService, createAuth, makeAuthService } from "@avenire/auth/server";
import type { DatabaseClient } from "@avenire/database/client";
import { createRequire } from "node:module";
import { AssetStore } from "@avenire/ai/outputs/assets";
import { CloudReview } from "@avenire/ai/cloud/review";
import { ThreadStore } from "@avenire/ai/ruth";
import { CloudTasks } from "@avenire/ai/scheduler";
import {
  AvenireRpcs,
  CaptureId,
  FileId,
  IngestionJobId,
  NotFound,
  UserId,
  type CaptureSnapshot,
} from "@avenire/contracts";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as HttpRouter from "effect/http/HttpRouter";
import { Library, captureCandidates, type LibraryOperations } from "./library.ts";
import { filesResponse, ingestionStreamResponse, placementResponse } from "./libraryHttp.ts";
import { ApplicationHandlersLive, rpcRoutes } from "./rpcProtocol.ts";

const viewer = { id: UserId.make("owner"), name: "Owner", email: "owner@example.test" };
const other = { ...viewer, id: UserId.make("other") };
const auth = AuthService.of({
  auth: {} as AuthService["Service"]["auth"],
  getSession: (headers) =>
    Effect.succeed(
      headers.get("cookie") === "session=owner"
        ? viewer
        : headers.get("cookie") === "session=other"
          ? other
          : null,
    ),
});
const snapshot: CaptureSnapshot = {
  id: CaptureId.make("capture"),
  capturedAt: "2026-10-17T12:00:00.000Z",
  deviceId: "device",
  platform: "linux",
  windows: [],
  tabs: [],
  media: [],
  collectorNotes: [],
};
const job = {
  id: IngestionJobId.make("job"),
  fileId: FileId.make("file"),
  status: "queued" as const,
  attempts: 0,
  error: null,
  coverage: null,
  createdAt: snapshot.capturedAt,
  updatedAt: snapshot.capturedAt,
};
const payloads: Record<string, unknown> = {
  "library.getCanvas": null,
  "library.saveCanvas": { nodes: [] },
  "library.recordFileEvent": { fileId: "file", kind: "opened" },
  "library.submitCapture": { snapshot },
  "library.listFiles": {},
  "library.placeFile": { fileId: "file", folderIds: ["folder"] },
  "library.listFolders": null,
  "library.renameFolder": { folderId: "folder", name: "Renamed" },
  "library.watchIngestion": null,
  "library.setIngestionPaused": { fileId: "file", paused: true },
  "search.query": { text: "study" },
  "ruth.listThreads": null,
  "ruth.createThread": {},
  "ruth.listMessages": { threadId: "thread" },
  "ruth.setFullAccess": { threadId: "thread", enabled: false },
  "cloud.listTasks": null,
  "cloud.createTask": {
    title: "Study",
    prompt: "Read",
    schedule: { _tag: "once", at: snapshot.capturedAt },
    timeZone: "UTC",
    preHydration: [],
    delivery: { email: false },
    enabled: true,
  },
  "cloud.updateTask": { taskId: "task", patch: { title: "Updated" } },
  "cloud.deleteTask": { taskId: "task" },
  "cloud.runTaskNow": { taskId: "task" },
  "cloud.listPendingApprovals": {},
  "cloud.resolveApproval": { approvalId: "approval", decision: "skip" },
  "cloud.resolveRun": { runId: "run", decision: "skip" },
  "cloud.listRuns": {},
  "cloud.cancelRun": { runId: "run" },
  "assets.get": { assetId: "asset" },
  "assets.list": {},
};
const request = (tag: string, cookie = "session=owner", forged?: string) =>
  new Request("https://app.test/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/ndjson", ...(cookie ? { cookie } : {}) },
    body: `${JSON.stringify({ _tag: "Request", id: "1", tag, payload: payloads[tag], headers: forged ? [["cookie", forged]] : [] })}\n`,
  });

type Call = { name: string; args: unknown[] };
const fixtures = (calls: Call[]) => {
  // Fake infrastructure fails explicitly after recording the identity supplied by the real handler.
  const service = <T>(prefix: string): T =>
    new Proxy(
      {},
      {
        get:
          (_, property) =>
          (...args: unknown[]) =>
            Effect.sync(() => calls.push({ name: `${prefix}.${String(property)}`, args })).pipe(
              Effect.andThen(Effect.fail(new NotFound({ entity: "Fixture", id: "missing" }))),
            ),
      },
    ) as T;
  const library: LibraryOperations = {
    ...(Object.fromEntries(
      [
        "getFile",
        "submitCapture",
        "placeFile",
        "listFolders",
        "createFolder",
        "renameFolder",
        "setIngestionPaused",
        "getCanvas",
        "saveCanvas",
        "recordFileEvent",
      ].map((method) => [
        method,
        (service<LibraryOperations>("library") as unknown as Record<string, unknown>)[method],
      ]),
    ) as Omit<LibraryOperations, "listFiles" | "watchIngestion">),
    listFiles: (userId) =>
      Effect.sync(() => {
        calls.push({ name: "library.listFiles", args: [userId] });
        return [];
      }),
    watchIngestion: (userId) =>
      Stream.fromEffect(
        Effect.sync(() => {
          calls.push({ name: "library.watchIngestion", args: [userId] });
          return job;
        }),
      ),
  };
  return Layer.mergeAll(
    Layer.succeed(AuthService, auth),
    Layer.succeed(Library, library),
    Layer.succeed(Retrieval, service<Retrieval["Service"]>("search")),
    Layer.succeed(ThreadStore, service<ThreadStore["Service"]>("ruth")),
    Layer.succeed(CloudTasks, service<CloudTasks["Service"]>("tasks")),
    Layer.succeed(CloudReview, service<CloudReview["Service"]>("review")),
    Layer.succeed(AssetStore, service<AssetStore["Service"]>("assets")),
  );
};
const server = (calls: Call[]) =>
  HttpRouter.toWebHandler(
    rpcRoutes(
      Layer.mergeAll(ApplicationHandlersLive, AuthenticationLive).pipe(
        Layer.provide(fixtures(calls)),
      ),
    ),
    { disableLogger: true },
  );

it.effect("serves every declared method through the composed HTTP NDJSON protocol", () =>
  Effect.gen(function* () {
    const calls: Call[] = [];
    const http = server(calls);
    yield* Effect.addFinalizer(() => Effect.promise(() => http.dispose()));
    expect(Object.keys(payloads).sort()).toEqual([...AvenireRpcs.requests.keys()].sort());
    for (const [tag] of Object.entries(payloads)) {
      const response = yield* Effect.promise(() => http.handler(request(tag)));
      const text = yield* Effect.promise(() => response.text());
      expect(response.status, tag).toBe(200);
      expect(text, tag).not.toContain('"Defect"');
      expect(text, tag).not.toContain('"Die"');
      expect(text, tag).toMatch(/"(Exit|Chunk)"/);
      expect(calls.length, tag).toBeGreaterThan(0);
      const call = calls.pop()!;
      if (tag !== "assets.get") expect(call.args[0], tag).toBe(viewer.id);
      expect(calls.length, tag).toBe(0);
    }
  }).pipe(Effect.scoped),
);

it.effect(
  "uses raw HTTP authentication and preserves user isolation across concurrent RPC calls",
  () =>
    Effect.gen(function* () {
      const calls: Call[] = [];
      const http = server(calls);
      yield* Effect.addFinalizer(() => Effect.promise(() => http.dispose()));
      const responses = yield* Effect.promise(() =>
        Promise.all([
          http.handler(request("library.listFiles", "", "session=owner")),
          http.handler(request("library.listFiles", "session=forged", "session=owner")),
          http.handler(request("library.listFiles", "session=owner", "session=other")),
          http.handler(request("library.placeFile", "session=other", "session=owner")),
        ]),
      );
      const text = yield* Effect.promise(() =>
        Promise.all(responses.map((response) => response.text())),
      );
      expect(text[0]).toContain('"Unauthorized"');
      expect(text[1]).toContain('"Unauthorized"');
      expect(text[2]).toContain('"Success"');
      expect(text[3]).toContain('"NotFound"');
      expect(calls).toContainEqual({ name: "library.listFiles", args: [viewer.id] });
      expect(calls).toContainEqual({
        name: "library.placeFile",
        args: [other.id, "file", ["folder"]],
      });
      expect(calls).toHaveLength(2);
    }).pipe(Effect.scoped),
);

it.effect("streams ingestion over HTTP RPC and REST without a model provider", () =>
  Effect.gen(function* () {
    const calls: Call[] = [];
    const http = server(calls);
    yield* Effect.addFinalizer(() => Effect.promise(() => http.dispose()));
    const rpc = yield* Effect.promise(() => http.handler(request("library.watchIngestion")));
    expect(yield* Effect.promise(() => rpc.text())).toContain('"status":"queued"');
    const rest = yield* ingestionStreamResponse(
      new Request("https://app.test/api/library/ingestion/stream", {
        headers: { cookie: "session=owner" },
      }),
    ).pipe(Effect.provide(fixtures(calls)));
    expect(rest.headers.get("content-type")).toBe("application/x-ndjson");
    expect(JSON.parse(yield* Effect.promise(() => rest.text()))).toEqual(job);
  }).pipe(Effect.scoped),
);

it.effect(
  "REST rejects missing authentication, cross-site mutation and malformed filters before service execution",
  () =>
    Effect.gen(function* () {
      const calls: Call[] = [];
      const anonymous = yield* filesResponse(new Request("https://app.test/api/library/files"));
      expect(anonymous.status).toBe(401);
      const badFilter = yield* filesResponse(
        new Request("https://app.test/api/library/files?placement=foreign", {
          headers: { cookie: "session=owner" },
        }),
      );
      expect(badFilter.status).toBe(400);
      const badOrigin = yield* placementResponse(
        new Request("https://app.test/api/library/files/file/folders", {
          method: "PUT",
          headers: {
            cookie: "session=owner",
            origin: "https://attacker.test",
            "content-type": "application/json",
          },
          body: JSON.stringify({ folderIds: ["folder"] }),
        }),
        "file",
      );
      expect(badOrigin.status).toBe(403);
      expect(calls).toHaveLength(0);
    }).pipe(
      Effect.provide(fixtures([])),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ BETTER_AUTH_URL: "https://app.test" }),
      ),
    ),
);

it.effect(
  "server capture policy strips clipboard, blocked media and diagnostic content before persistence",
  () =>
    Effect.sync(() => {
      const result = captureCandidates({
        ...snapshot,
        selectionText: "clipboard secret",
        collectorNotes: ["secret diagnostic"],
        tabs: [
          {
            url: "https://study.test/chapter#one",
            title: "Study",
            activeInWindow: true,
            selectionText: "Source-bound text",
            engagement: { dwellMs: 1, scrollDepthPct: 1, mediaPlaying: false },
          },
          {
            url: "https://mail.google.com/inbox",
            title: "Private message",
            activeInWindow: false,
            selectionText: "email secret",
            engagement: { dwellMs: 1, scrollDepthPct: 0, mediaPlaying: false },
          },
        ],
        media: [
          { appName: "Chrome", title: "Private browsing", url: "https://study.test/private" },
        ],
      });
      const serialized = JSON.stringify(result);
      for (const secret of [
        "clipboard secret",
        "secret diagnostic",
        "email secret",
        "Private message",
        "/private",
      ])
        expect(serialized).not.toContain(secret);
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]?.url).toBe("https://study.test/chapter");
      expect(serialized).not.toContain("Source-bound text");
    }),
);

it.effect(
  "real Better Auth sessions authenticate RPC transport, reject spoofing and honor revocation",
  () =>
    Effect.gen(function* () {
      const authRequire = createRequire(
        new URL("../../../../packages/auth/package.json", import.meta.url),
      );
      const { memoryAdapter } = yield* Effect.promise(
        () => import(authRequire.resolve("better-auth/adapters/memory")),
      );
      const instance = createAuth(
        {
          db: {} as DatabaseClient,
          baseURL: "https://app.test",
          secret: "rpc-test-secret-with-at-least-thirty-two-characters",
          trustedOrigins: ["https://app.test"],
        },
        memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      );
      const context = yield* Effect.promise(() => instance.$context);
      const password = "rpc-session-password-123";
      const hash = yield* Effect.promise(() => context.password.hash(password));
      const sessions: Array<{ cookie: string; id: string }> = [];
      for (const name of ["owner", "other"]) {
        const user = yield* Effect.promise(() =>
          context.internalAdapter.createUser(
            { email: `${name}@rpc.test`, name, emailVerified: true },
            { method: "email-password" },
          ),
        );
        yield* Effect.promise(() =>
          context.internalAdapter.createAccount({
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: hash,
          }),
        );
        const response = yield* Effect.promise(() =>
          instance.handler(
            new Request("https://app.test/api/auth/sign-in/email", {
              method: "POST",
              headers: { "content-type": "application/json", origin: "https://app.test" },
              body: JSON.stringify({ email: user.email, password }),
            }),
          ),
        );
        expect(response.status).toBe(200);
        sessions.push({
          id: user.id,
          cookie: response.headers
            .getSetCookie()
            .map((value) => value.split(";")[0])
            .join("; "),
        });
      }
      const [owner, other] = sessions;
      const calls: Call[] = [];
      const layers = Layer.mergeAll(
        fixtures(calls),
        Layer.succeed(AuthService, makeAuthService(instance)),
      );
      const http = HttpRouter.toWebHandler(
        rpcRoutes(
          Layer.mergeAll(ApplicationHandlersLive, AuthenticationLive).pipe(Layer.provide(layers)),
        ),
        { disableLogger: true },
      );
      yield* Effect.addFinalizer(() => Effect.promise(() => http.dispose()));
      for (const [cookie, metadata, expected] of [
        ["", owner!.cookie, "Unauthorized"],
        ["better-auth.session_token=forged", owner!.cookie, "Unauthorized"],
        [owner!.cookie, other!.cookie, "Success"],
        [other!.cookie, owner!.cookie, "Success"],
      ]) {
        const response = yield* Effect.promise(() =>
          http.handler(request("library.listFiles", cookie, metadata)),
        );
        expect(yield* Effect.promise(() => response.text())).toContain(`"${expected}"`);
      }
      expect(calls.map((call) => call.args[0])).toEqual([owner!.id, other!.id]);
      const revoked = yield* Effect.promise(() =>
        instance.handler(
          new Request("https://app.test/api/auth/sign-out", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: "https://app.test",
              cookie: owner!.cookie,
            },
            body: "{}",
          }),
        ),
      );
      expect(revoked.status).toBe(200);
      const response = yield* Effect.promise(() =>
        http.handler(request("library.listFiles", owner!.cookie)),
      );
      expect(yield* Effect.promise(() => response.text())).toContain('"Unauthorized"');
      expect(calls).toHaveLength(2);
    }).pipe(Effect.scoped),
);

it.effect("cancelling the REST or RPC response releases the ingestion stream", () =>
  Effect.gen(function* () {
    for (const transport of ["rest", "rpc"]) {
      let released = false;
      const library = Layer.effect(
        Library,
        Effect.map(Library, (service) => ({
          ...service,
          watchIngestion: () =>
            Stream.concat(Stream.succeed(job), Stream.fromEffect(Effect.never)).pipe(
              Stream.ensuring(
                Effect.sync(() => {
                  released = true;
                }),
              ),
            ),
        })),
      ).pipe(Layer.provide(fixtures([])));
      const layers = Layer.mergeAll(fixtures([]), library);
      const http = HttpRouter.toWebHandler(
        rpcRoutes(
          Layer.mergeAll(ApplicationHandlersLive, AuthenticationLive).pipe(Layer.provide(layers)),
        ),
        { disableLogger: true },
      );
      yield* Effect.addFinalizer(() => Effect.promise(() => http.dispose()));
      const response =
        transport === "rpc"
          ? yield* Effect.promise(() => http.handler(request("library.watchIngestion")))
          : yield* ingestionStreamResponse(
              new Request("https://app.test/api/library/ingestion/stream", {
                headers: { cookie: "session=owner" },
              }),
            ).pipe(Effect.provide(layers));
      const reader = response.body!.getReader();
      expect((yield* Effect.promise(() => reader.read())).done).toBe(false);
      yield* Effect.promise(() => reader.cancel());
      yield* Effect.promise(() => expect.poll(() => released).toBe(true));
    }
  }).pipe(Effect.scoped),
);

it.effect("composed RPC masks infrastructure defects instead of disclosing credentials", () =>
  Effect.gen(function* () {
    const base = fixtures([]);
    const broken = Layer.effect(
      Library,
      Effect.map(Library, (library) => ({
        ...library,
        listFiles: () =>
          Effect.die(new Error("postgres://owner:private-password@database/private")),
      })),
    ).pipe(Layer.provide(base));
    const http = HttpRouter.toWebHandler(
      rpcRoutes(
        Layer.mergeAll(ApplicationHandlersLive, AuthenticationLive).pipe(
          Layer.provide(Layer.mergeAll(base, broken)),
        ),
      ),
      { disableLogger: true },
    );
    yield* Effect.addFinalizer(() => Effect.promise(() => http.dispose()));
    const response = yield* Effect.promise(() => http.handler(request("library.listFiles")));
    const body = yield* Effect.promise(() => response.text());
    expect(body).toContain('"InternalError"');
    expect(body).not.toContain("private-password");
    expect(body).not.toContain('"Defect"');
  }).pipe(Effect.scoped),
);
