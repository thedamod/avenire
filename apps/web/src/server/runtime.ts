import { RuthLive } from "@avenire/ai/ruth";
import { AuthLive } from "@avenire/auth/server";
import { ChatSandboxesLive, ChatSandboxSweeperLive } from "@avenire/cloud/chat-sandbox";
import { CloudBoxesLive } from "@avenire/cloud/cloud-box";
import { CloudReviewLive } from "@avenire/ruth-kit/review";
import { DaytonaClientLive } from "@avenire/cloud/daytona";
import { DatabaseLive } from "@avenire/database/client";
import { EmbedderLive } from "@avenire/ingestion/embed";
import { GraphSearchLive } from "@avenire/ingestion/graph/search";
import { IngestionModelsLive } from "@avenire/ingestion/models";
import { RetrievalLive } from "@avenire/ingestion/retrieval";
import { SemanticCacheLive } from "@avenire/ingestion/retrieval/cache";
import { QueryPlannerLive } from "@avenire/ingestion/retrieval/planner";
import { RerankerLive } from "@avenire/ingestion/retrieval/rerank";
import { ArtifactStoreLive, ArtifactSweeperLive } from "@avenire/ruth-kit/artifacts";
import { RunTokensLive } from "@avenire/ruth-kit/run-tokens";
import { SandboxMeterLive } from "@avenire/ruth-kit/sandbox-meter";
import { WidgetStoreLive } from "@avenire/ruth-kit/widgets";
import { AnalyticsLive } from "@avenire/shared/observability";
import { StorageLive } from "@avenire/storage/storage";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { HttpRequestError } from "./http.ts";
import { WidgetHostLive } from "./widgetHost.ts";

const InfrastructureLive = Layer.mergeAll(
  DatabaseLive,
  StorageLive,
  NodeServices.layer,
  AnalyticsLive,
  DaytonaClientLive,
  WidgetHostLive,
);
const ProvidersLive = Layer.mergeAll(
  EmbedderLive,
  RerankerLive,
  QueryPlannerLive.pipe(Layer.provide(IngestionModelsLive)),
);
const RetrievalServicesLive = RetrievalLive.pipe(
  Layer.provideMerge(Layer.mergeAll(GraphSearchLive, SemanticCacheLive)),
  Layer.provideMerge(ProvidersLive),
);
const ToolsLive = Layer.mergeAll(
  RetrievalServicesLive,
  WidgetStoreLive,
  ArtifactStoreLive,
  RunTokensLive,
  AuthLive,
  CloudBoxesLive,
  ChatSandboxesLive.pipe(Layer.provideMerge(SandboxMeterLive)),
).pipe(Layer.provideMerge(InfrastructureLive));
export const ServerLive = Layer.mergeAll(
  RuthLive,
  CloudReviewLive,
  ChatSandboxSweeperLive,
  ArtifactSweeperLive,
).pipe(Layer.provideMerge(ToolsLive));
type ServerServices = Layer.Success<typeof ServerLive>;
let runtime:
  | ManagedRuntime.ManagedRuntime<ServerServices, Layer.Error<typeof ServerLive>>
  | undefined;
const serverRuntime = () => (runtime ??= ManagedRuntime.make(ServerLive));

/** One scope keeps sandbox state and sweeper fibers alive across requests. */
export const runRoute = <E>(
  effect: Effect.Effect<Response, E, ServerServices>,
): Promise<Response> =>
  serverRuntime()
    .runPromise(
      effect.pipe(
        Effect.catchIf(
          (error): error is E & HttpRequestError => error instanceof HttpRequestError,
          (error) =>
            Effect.succeed(Response.json({ error: error.message }, { status: error.status })),
        ),
        Effect.catchCause((cause) =>
          Effect.logError("Server route failed", cause).pipe(
            Effect.as(
              Response.json({ error: "The request could not be completed." }, { status: 500 }),
            ),
          ),
        ),
      ),
    )
    .catch(() => Response.json({ error: "The server is unavailable." }, { status: 500 }));
