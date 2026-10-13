import { readFile } from "node:fs/promises";
import { buildWidgetDocument } from "../../../ui/src/widgets/protocol.ts";
import { WIDGET_THEME_TOKENS } from "../../../ui/src/styles/tokens.ts";
/** API.md is the source Ruth sees; never keep a second copy of these examples. */
export async function widgetPages() {
  const api = await readFile(new URL("../../../widget-kit/API.md", import.meta.url), "utf8");
  const examples = [...api.matchAll(/```html\n([\s\S]*?)\n```/g)].map((m) => m[1]!);
  const names = ["pendulum", "three-body", "curve-fit", "iso"];
  if (examples.length !== names.length)
    throw new Error(`Expected four complete API widgets, found ${examples.length}`);
  return names.flatMap((name, i) =>
    (["light", "dark"] as const).map((theme) => ({
      name: `${name}-${theme}`,
      html: buildWidgetDocument({
        html: examples[i]!,
        title: `${name} ${theme}`,
        colorScheme: theme,
        tokens: WIDGET_THEME_TOKENS[theme],
        kitsOrigin: "http://127.0.0.1:8765",
      }),
    })),
  );
}
