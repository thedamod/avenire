import { screenSharingResponse } from "~/server/settingsHttp";
import { runScreenSharingRoute } from "~/server/applicationRuntime";
export const runtime = "nodejs";
export const GET = (request: Request) => runScreenSharingRoute(screenSharingResponse(request));
