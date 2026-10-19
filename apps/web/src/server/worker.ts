import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Layer from "effect/Layer";
import { WorkerLive } from "./workerLive.ts";

NodeRuntime.runMain(Layer.launch(WorkerLive));
