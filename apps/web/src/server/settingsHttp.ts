import { CurrentUser, type ScreenSharingPermission } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import { domainResponse } from "./domainHttp.ts";
import { ScreenSharing } from "./settings.ts";

export const screenSharingResponse = (request: Request) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const viewer = yield* CurrentUser;
      const enabled = yield* (yield* ScreenSharing).enabled(viewer);
      return {
        userId: viewer.id,
        sessionId: viewer.sessionId ?? "",
        enabled,
      } satisfies ScreenSharingPermission;
    }),
  );
