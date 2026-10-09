import { AuthLive } from "@avenire/auth/server";
import { ChatSandboxesLive } from "@avenire/cloud/chat-sandbox";
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
import { ArtifactStoreLive } from "@avenire/ruth-kit/artifacts";
import { RunTokensLive } from "@avenire/ruth-kit/run-tokens";
import { SandboxMeterLive } from "@avenire/ruth-kit/sandbox-meter";
import { WidgetStoreLive } from "@avenire/ruth-kit/widgets";
import { AnalyticsLive } from "@avenire/shared/observability";
import { StorageLive } from "@avenire/storage/storage";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { WidgetHostLive } from "./widgetHost.ts";
import { CloudTasksLive } from "@avenire/ai/scheduler";

export const InfrastructureLive = Layer.mergeAll(
  DatabaseLive,
  StorageLive,
  NodeServices.layer,
  FetchHttpClient.layer,
  AnalyticsLive,
  DaytonaClientLive,
  WidgetHostLive,
);
export const ProvidersLive = Layer.mergeAll(
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
export const ServicesLive = Layer.mergeAll(CloudTasksLive, CloudReviewLive).pipe(
  Layer.provideMerge(ToolsLive),
);
