/** Declarative images only: importing this module never builds or publishes a snapshot. */
import { DaytonaNotFoundError, Image, type Daytona } from "@daytonaio/sdk";
import * as Effect from "effect/Effect";

import { attempt } from "./daytona.ts";
import { CHAT_SANDBOX_LIMITS } from "./chatSandbox.ts";

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
) {
  return yield* attempt("getSnapshot", () => daytona.snapshot.get(name)).pipe(
    Effect.catchTag("CloudError", (error) =>
      error.cause instanceof DaytonaNotFoundError
        ? attempt("createSnapshot", () =>
            daytona.snapshot.create({ name, image, resources: CHAT_SANDBOX_LIMITS.resources }),
          )
        : Effect.fail(error),
    ),
  );
});
