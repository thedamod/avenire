import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class WidgetHost extends Context.Service<WidgetHost, { readonly host: string }>()(
  "avenire/web/WidgetHost",
) {}
export const WidgetHostLive = Layer.effect(
  WidgetHost,
  Effect.gen(function* () {
    const origin = yield* Config.String("WIDGET_ORIGIN").pipe(
      Config.withDefault("https://widgets.avenire.space"),
    );
    return { host: new URL(origin).host.toLowerCase() };
  }),
);
/** Isolation applies to every path, including API and framework assets on the widget host. */
export const widgetHostDecision = (
  host: string,
  path: string,
  widgetHost: string,
): "widget" | "app" | "reject" => {
  const widgetPath = path.startsWith("/w/") || path.startsWith("/kits/");
  if (host.toLowerCase() === widgetHost.toLowerCase()) return widgetPath ? "widget" : "reject";
  return widgetPath ? "reject" : "app";
};
