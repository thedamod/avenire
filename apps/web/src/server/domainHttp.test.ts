import { AuthService, createAuth, makeAuthService } from "@avenire/auth/server";
import {
  Database,
  DatabaseError,
  makeDatabase,
  type DatabaseClient,
} from "@avenire/database/client";
import { user as userTable, ruthThread } from "@avenire/database/schema";
import { CloudReview } from "@avenire/ai/cloud/review";
import { ThreadStoreLive } from "@avenire/ai/ruth";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { eq, inArray } from "drizzle-orm";
import * as Config from "effect/Config";
import * as Option from "effect/Option";
import { expect, it } from "@effect/vitest";
import { createRequire } from "node:module";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import {
  accessResponse,
  approvalDecisionResponse,
  approvalsResponse,
  assetResponse,
  assetsResponse,
  cancelRunResponse,
  messagesResponse,
  runsResponse,
  searchResponse,
  startRunResponse,
  taskResponse,
  tasksResponse,
  threadsResponse,
} from "./domainHttp.ts";

// Use the auth package's installed official adapter without adding a web dependency.
const authRequire = createRequire(
  new URL("../../../../packages/auth/package.json", import.meta.url),
);
const { memoryAdapter } = await import(authRequire.resolve("better-auth/adapters/memory"));
// These guards must finish before accessing a domain service. Leaving services absent also
// makes an accidental call fail with an Effect missing-service defect.
const guardOnly = (effect: Effect.Effect<Response, unknown, unknown>) =>
  effect as Effect.Effect<Response, unknown>;
const config = ConfigProvider.fromUnknown({ BETTER_AUTH_URL: "https://app.test" });
const fixture = Effect.gen(function* () {
  const auth = createAuth(
    {
      db: {} as DatabaseClient,
      sendEmail: () => undefined,
      baseURL: "https://app.test",
      secret: "domain-route-test-secret-with-at-least-32-characters",
      trustedOrigins: ["https://app.test"],
    },
    memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  );
  const context = yield* Effect.promise(() => auth.$context);
  const user = yield* Effect.promise(() =>
    context.internalAdapter.createUser(
      {
        email: "route@example.test",
        name: "Route",
        emailVerified: true,
      },
      { method: "email-password" },
    ),
  );
  const password = yield* Effect.promise(() => context.password.hash("route-password-123"));
  yield* Effect.promise(() =>
    context.internalAdapter.createAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password,
    }),
  );
  const signedIn = yield* Effect.promise(() =>
    auth.handler(
      new Request("https://app.test/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://app.test" },
        body: JSON.stringify({ email: user.email, password: "route-password-123" }),
      }),
    ),
  );
  expect(signedIn.status).toBe(200);
  const cookie = signedIn.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return { service: makeAuthService(auth), cookie, user };
});

it.effect("domain endpoints reject forged sessions before touching domain services", () =>
  Effect.gen(function* () {
    const { service } = yield* fixture;
    const request = new Request("https://app.test/api", {
      headers: { cookie: "better-auth.session_token=forged" },
    });
    const operations: Array<Effect.Effect<Response, unknown, AuthService>> = [
      guardOnly(threadsResponse(request)),
      guardOnly(messagesResponse(request, "other-thread")),
      guardOnly(tasksResponse(request)),
      guardOnly(runsResponse(request)),
      guardOnly(assetResponse(request, "other-asset")),
      guardOnly(assetsResponse(request)),
    ];
    for (const operation of operations) {
      // No domain services are provided: reaching one would fail this test with a missing-service defect.
      const response = yield* guardOnly(
        guardOnly(operation).pipe(Effect.provideService(AuthService, service)),
      );
      expect(response.status).toBe(401);
      expect(yield* Effect.promise(() => response.json())).toEqual({
        error: "Sign in to continue.",
      });
    }
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, config)),
);

it.effect(
  "real signed sessions reach schema, JSON content-type and streamed byte-limit guards",
  () =>
    Effect.gen(function* () {
      const { service, cookie } = yield* fixture;
      const request = (body: string, contentType = "application/json", path = "") =>
        new Request(`https://app.test/api${path}`, {
          method: "POST",
          headers: { cookie, origin: "https://app.test", "content-type": contentType },
          body,
        });
      const cases = [
        [searchResponse(request('{"text":"hello","limit":51}')), 400],
        [searchResponse(request('{"text":"hello","userId":"victim"}')), 400],
        [searchResponse(request("{}", "text/plain")), 415],
        [searchResponse(request("{")), 400],
        [searchResponse(request(JSON.stringify({ text: "x".repeat(2 * 1024 * 1024) }))), 413],
        [threadsResponse(request(JSON.stringify({ title: "x".repeat(201) }))), 400],
        [tasksResponse(request('{"title":"incomplete"}')), 400],
        [accessResponse(request('{"enabled":"true"}'), "thread"), 400],
        [taskResponse(request('{"enabled":true,"userId":"victim"}'), "task"), 400],
        [approvalDecisionResponse(request('{"decision":"delete"}'), "approval"), 400],
        [
          runsResponse(
            new Request("https://app.test/api/cloud/runs?limit=101", { headers: { cookie } }),
          ),
          400,
        ],
        [
          runsResponse(
            new Request("https://app.test/api/cloud/runs?limit=abc", { headers: { cookie } }),
          ),
          400,
        ],
        [
          assetsResponse(
            new Request("https://app.test/api/assets?userId=victim", { headers: { cookie } }),
          ),
          400,
        ],
      ] as const;
      for (const [operation, expected] of cases) {
        const response = yield* guardOnly(
          guardOnly(operation).pipe(Effect.provideService(AuthService, service)),
        );
        expect(response.status).toBe(expected);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
      // Forged cross-site mutations cannot enqueue or cancel work even with a real session.
      for (const operation of [startRunResponse, cancelRunResponse]) {
        const response = yield* guardOnly(
          operation(
            new Request("https://app.test/api", {
              method: "POST",
              headers: { cookie, origin: "https://attacker.test" },
            }),
            "target",
          ).pipe(Effect.provideService(AuthService, service)),
        );
        expect(response.status).toBe(403);
      }
    }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, config)),
);

it.effect(
  "thread HTTP operations persist through ThreadStore and reject another owner's ids",
  (context) =>
    Effect.gen(function* () {
      const url = yield* Config.option(Config.String("DOMAIN_TEST_DATABASE_URL"));
      if (Option.isNone(url))
        return context.skip(
          "Set DOMAIN_TEST_DATABASE_URL to an isolated migrated PostgreSQL database.",
        );
      const connection = yield* Effect.acquireRelease(
        Effect.sync(() => makeDatabase(url.value)),
        ({ sql: client }) => Effect.promise(() => client.end({ timeout: 5 })),
      );
      const database = Database.of({
        db: connection.db,
        use: (fn) =>
          Effect.tryPromise({
            try: () => fn(connection.db),
            catch: (cause) => new DatabaseError({ cause }),
          }),
        useTransaction: (fn) =>
          Effect.tryPromise({
            try: () => connection.db.transaction(fn),
            catch: (cause) => new DatabaseError({ cause }),
          }),
      });
      const { service, cookie, user: viewer } = yield* fixture;
      const foreignId = crypto.randomUUID();
      const foreignThread = crypto.randomUUID();
      yield* database.use(async (db) => {
        await db.insert(userTable).values([
          {
            id: viewer.id,
            name: viewer.name,
            email: `${viewer.id}@route.test`,
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: foreignId,
            name: "Other",
            email: `${foreignId}@route.test`,
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
        await db
          .insert(ruthThread)
          .values({ id: foreignThread, userId: foreignId, title: "Private" });
      });
      const perform = <E>(
        operation: Effect.Effect<Response, E, import("@avenire/ai/ruth").ThreadStore | AuthService>,
      ) =>
        operation.pipe(
          Effect.provide(ThreadStoreLive),
          Effect.provideService(Database, database),
          Effect.provide(NodeServices.layer),
          Effect.provideService(AuthService, service),
          Effect.provideService(ConfigProvider.ConfigProvider, config),
        );
      const request = (method: string, value?: unknown) =>
        new Request("https://app.test/api/ruth/threads", {
          method,
          headers: { cookie, origin: "https://app.test", "content-type": "application/json" },
          ...(value === undefined ? {} : { body: JSON.stringify(value) }),
        });
      yield* Effect.gen(function* () {
        const created = yield* perform(threadsResponse(request("POST", { title: "Study" })));
        expect(created.status).toBe(201);
        const thread = yield* Effect.promise(() => created.json());
        expect(thread).toMatchObject({ title: "Study", fullAccess: false });
        const rows = yield* database.use((db) =>
          db.select().from(ruthThread).where(eq(ruthThread.id, thread.id)),
        );
        expect(rows[0]?.userId).toBe(viewer.id);
        const messages = yield* perform(messagesResponse(request("GET"), thread.id));
        expect(yield* Effect.promise(() => messages.json())).toEqual([]);
        const changed = yield* perform(
          accessResponse(request("PATCH", { enabled: true }), thread.id),
        );
        expect(changed.status).toBe(200);
        expect(yield* Effect.promise(() => changed.json())).toMatchObject({ fullAccess: true });
        const listed = yield* perform(threadsResponse(request("GET")));
        expect(yield* Effect.promise(() => listed.json())).toEqual([
          expect.objectContaining({ id: thread.id, fullAccess: true }),
        ]);
        expect((yield* perform(messagesResponse(request("GET"), foreignThread))).status).toBe(404);
        expect(
          (yield* perform(accessResponse(request("PATCH", { enabled: true }), foreignThread)))
            .status,
        ).toBe(404);
        const foreign = yield* database.use((db) =>
          db.select().from(ruthThread).where(eq(ruthThread.id, foreignThread)),
        );
        expect(foreign[0]?.fullAccess).toBe(false);
      }).pipe(
        Effect.ensuring(
          database
            .use((db) => db.delete(userTable).where(inArray(userTable.id, [viewer.id, foreignId])))
            .pipe(Effect.orDie),
        ),
      );
    }),
);

it.effect("approval HTTP accepts optional resolved boolean and rejects invalid values", () =>
  Effect.gen(function* () {
    const { service, cookie } = yield* fixture;
    const seen: (boolean | undefined)[] = [];
    const review = CloudReview.of({
      list: (_userId, _runId, includeResolved) =>
        Effect.sync(() => {
          seen.push(includeResolved);
          return [];
        }),
      resolve: () => Effect.die("Not used"),
      resolveRun: () => Effect.die("Not used"),
    });
    for (const value of [
      "",
      "&includeResolved=true",
      "&includeResolved=false",
      "&includeResolved=invalid",
    ]) {
      const response = yield* approvalsResponse(
        new Request(`https://app.test/api/cloud/approvals?runId=run${value}`, {
          headers: { cookie },
        }),
      ).pipe(
        Effect.provideService(AuthService, service),
        Effect.provideService(CloudReview, review),
      );
      expect(response.status).toBe(value.endsWith("invalid") ? 400 : 200);
    }
    expect(seen).toEqual([undefined, true, false]);
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, config)),
);
