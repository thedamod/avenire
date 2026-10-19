import { RuthCloudLive } from "@avenire/ai/ruth-cloud";
import { CloudRunsLive, CloudSchedulerLive } from "@avenire/ai/scheduler";
import { ChatSandboxSweeperLive } from "@avenire/cloud/chat-sandbox";
import { ArchivePurgeLive } from "@avenire/storage/archive";
import { ImageDescriberLive } from "@avenire/ingestion/extract/describe";
import { MediaProcessorLive } from "@avenire/ingestion/extract/media";
import { OcrLive } from "@avenire/ingestion/extract/ocr";
import { RemoteMediaLive } from "@avenire/ingestion/extract/remote";
import { TranscriberLive } from "@avenire/ingestion/extract/transcribe";
import { TranscriptCacheLive } from "@avenire/ingestion/extract/transcript-cache";
import { GraphExtractorLive } from "@avenire/ingestion/graph/extract";
import { GraphIndexerLive } from "@avenire/ingestion/graph/indexer";
import { FileIndexerLive } from "@avenire/ingestion/indexer";
import { IngestionModelsLive } from "@avenire/ingestion/models";
import { IngestionPipelineLive } from "@avenire/ingestion/pipeline";
import { IngestionWorkerLive } from "@avenire/ingestion/worker";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import { ServicesLive } from "./services.ts";
import { cleanupUploads, SourceUploadsLive } from "./sourceUploads.ts";

const ExtractionLive = Layer.mergeAll(
  OcrLive,
  ImageDescriberLive,
  TranscriberLive,
  TranscriptCacheLive,
  MediaProcessorLive,
  RemoteMediaLive,
).pipe(Layer.provideMerge(IngestionModelsLive));
const IndexingLive = FileIndexerLive.pipe(
  Layer.provideMerge(GraphIndexerLive.pipe(Layer.provideMerge(GraphExtractorLive))),
  Layer.provideMerge(IngestionModelsLive),
);
const PipelineLive = IngestionPipelineLive.pipe(
  Layer.provideMerge(Layer.mergeAll(ExtractionLive, IndexingLive)),
);
const ExecutorLive = CloudRunsLive.pipe(Layer.provideMerge(RuthCloudLive));
const UploadCleanupLive = Layer.effectDiscard(cleanupUploads.pipe(Effect.forkScoped)).pipe(
  Layer.provide(SourceUploadsLive),
);

/** A single graph shares infrastructure with the request runtime; the worker owns every background fiber. */
export const WorkerLive = Layer.mergeAll(
  IngestionWorkerLive.pipe(Layer.provide(PipelineLive)),
  ArchivePurgeLive,
  CloudSchedulerLive.pipe(Layer.provideMerge(ExecutorLive)),
  ChatSandboxSweeperLive,
  UploadCleanupLive,
).pipe(Layer.provideMerge(ServicesLive));
