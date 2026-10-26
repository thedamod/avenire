import { capturePairingResponse } from "~/server/capturePairing";
import { domainRuntime } from "~/server/applicationRuntime";
import { AuthServicesLive } from "~/server/authRuntime";
import { DatabaseLive } from "@avenire/database/client";
import * as Layer from "effect/Layer";
export const runtime = "nodejs";
const pairing = domainRuntime(Layer.mergeAll(AuthServicesLive, DatabaseLive));
export const GET = (request: Request) => pairing.runRoute(capturePairingResponse(request));
