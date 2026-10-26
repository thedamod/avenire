import { capturePairingResponse } from "~/server/capturePairing";
import { domainRuntime } from "~/server/applicationRuntime";
import { AuthServicesLive } from "~/server/authRuntime";
export const runtime = "nodejs";
const pairing = domainRuntime(AuthServicesLive);
export const GET = (request: Request) => pairing.runRoute(capturePairingResponse(request));
