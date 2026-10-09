/** Declarative images only: importing this module never builds or publishes a snapshot. */
import { DaytonaNotFoundError, Image, type Daytona } from "@daytonaio/sdk";
import * as Effect from "effect/Effect";

import { attempt } from "./daytona.ts";

export const AVENIRE_CHAT_SNAPSHOT = "avenire-chat";
export const avenireChatImage = Image.debianSlim("3.12")
  .runCommands(
    "apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config ffmpeg libcairo2-dev libpango1.0-dev texlive-latex-base texlive-latex-extra texlive-fonts-recommended dvisvgm && rm -rf /var/lib/apt/lists/*",
  )
  .pipInstall([
    "numpy",
    "scipy",
    "pandas",
    "sympy",
    "matplotlib",
    "networkx",
    "scikit-learn",
    "polars",
    "manim",
  ]);

/** Snapshot resources define the allocation for every sandbox created from it. */
export const ensureSnapshot = Effect.fn("Snapshots.ensureSnapshot")(function* (
  daytona: Daytona,
  name: string,
  image: Image,
  resources: { cpu: number; memory: number; disk: number },
) {
  return yield* attempt("getSnapshot", () => daytona.snapshot.get(name)).pipe(
    Effect.catchTag("CloudError", (error) =>
      error.cause instanceof DaytonaNotFoundError
        ? attempt("createSnapshot", () => daytona.snapshot.create({ name, image, resources }))
        : Effect.fail(error),
    ),
  );
});

export const PI_VERSION = "0.83.0";
export const AVENIRE_RUTH_CLOUD_SNAPSHOT = "avenire-ruth-cloud";
// Preserve the desktop/VNC packages in Daytona's base image for computer use.
export const avenireRuthCloudImage = Image.base("daytonaio/sandbox")
  .dockerfileCommands(["USER root"])
  .runCommands(
    "apt-get update && apt-get install -y --no-install-recommends curl ca-certificates python3 python3-numpy python3-pandas python3-scipy python3-matplotlib && rm -rf /var/lib/apt/lists/*",
    "curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*",
    `npm i -g @earendil-works/pi-coding-agent@${PI_VERSION}`,
    "mkdir -p /opt/avenire/browser && cd /opt/avenire/browser && npm install playwright && PLAYWRIGHT_BROWSERS_PATH=/opt/avenire/browser/browsers npx playwright install --with-deps chromium && chmod -R a+rX /opt/avenire/browser && mkdir -p /home/daytona/workspace && ln -s /opt/avenire/browser/node_modules /home/daytona/workspace/node_modules && chown -R daytona:daytona /home/daytona/workspace",
  )
  .env({
    PLAYWRIGHT_BROWSERS_PATH: "/opt/avenire/browser/browsers",
    NODE_PATH: "/opt/avenire/browser/node_modules",
  })
  .dockerfileCommands(["USER daytona"]);
