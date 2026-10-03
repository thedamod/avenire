import * as Layer from "effect/Layer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { DatabaseLive } from "@avenire/database/client";
import { MailerLive } from "@avenire/emailer/mailer";
import { ObservabilityLive } from "@avenire/shared/observability";
import { OutboxWorker } from "./outbox.ts";

const AppLive = OutboxWorker.pipe(
  Layer.provide(Layer.mergeAll(MailerLive, DatabaseLive, ObservabilityLive, NodeServices.layer)),
);

NodeRuntime.runMain(Layer.launch(AppLive));
