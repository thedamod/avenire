/**
 * Ruth's chat message type: an AI SDK `UIMessage` with Ruth's metadata, data
 * parts and tools. Web and mobile import this type-only.
 */
import type { InferUITools, UIMessage } from "ai";
import * as Schema from "effect/Schema";

import { type RuthTools } from "./tools/index.ts";
import { standardSchema } from "./tools/schema.ts";

export type { PageContextResult, RuthTools } from "./tools/index.ts";

export const RuthMessageMetadata = Schema.Struct({
  createdAt: Schema.String,
  /** Library objects the user referenced in the composer. */
  references: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        kind: Schema.Literals(["item", "cluster", "canvasNode"]),
        id: Schema.String,
      }),
    ),
  ),
});
export type RuthMessageMetadata = typeof RuthMessageMetadata.Type;

export const SubagentData = Schema.Struct({
  subagentId: Schema.String,
  kind: Schema.Literal("video"),
  status: Schema.String,
  stage: Schema.optionalKey(Schema.String),
  progress: Schema.optionalKey(Schema.Number),
});

export const CloudRunData = Schema.Struct({ runId: Schema.String });

export type RuthDataParts = {
  subagent: typeof SubagentData.Type;
  "cloud-run": typeof CloudRunData.Type;
};

export type RuthUIMessage = UIMessage<RuthMessageMetadata, RuthDataParts, InferUITools<RuthTools>>;

/** Schemas `validateUIMessages` checks stored messages against. */
export const ruthMessageSchemas = {
  metadataSchema: standardSchema(RuthMessageMetadata),
  dataSchemas: {
    subagent: standardSchema(SubagentData),
    "cloud-run": standardSchema(CloudRunData),
  },
};

/** A client's message may omit metadata; the server stamps `createdAt` itself. */
export const incomingMessageSchemas = {
  ...ruthMessageSchemas,
  metadataSchema: standardSchema(
    Schema.UndefinedOr(
      Schema.Struct({
        createdAt: Schema.optionalKey(Schema.String),
        references: RuthMessageMetadata.fields.references,
      }),
    ),
  ),
};
