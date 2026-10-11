import { WidgetStore } from "@avenire/ai/outputs/widgets";
import { WIDGET_RESPONSE_CSP } from "@avenire/ui/widget-protocol";
import * as Effect from "effect/Effect";
import { runRoute } from "~/server/runtime";
import { WidgetHost, widgetHostDecision } from "~/server/widgetHost";

export const runtime = "nodejs";
export const GET = async (request: Request, context: { params: Promise<{ token: string }> }) => {
  const { token } = await context.params;
  return runRoute(
    Effect.gen(function* () {
      const policy = yield* WidgetHost;
      const url = new URL(request.url);
      if (
        widgetHostDecision(request.headers.get("host") ?? url.host, url.pathname, policy.host) !==
        "widget"
      )
        return new Response(null, { status: 404 });
      const store = yield* WidgetStore;
      const bytes = yield* store.load(token);
      return new Response(new TextDecoder().decode(bytes), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": WIDGET_RESPONSE_CSP({ frameAncestors: store.frameAncestors }),
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }).pipe(
      Effect.catchTag("ObjectNotFound", () => Effect.succeed(new Response(null, { status: 404 }))),
    ),
  );
};
