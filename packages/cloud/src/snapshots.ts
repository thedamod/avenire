/** Declarative image only. Importing this module never builds or publishes a snapshot. */
import { DaytonaNotFoundError, Image, type Daytona } from "@daytonaio/sdk";
import * as Effect from "effect/Effect";
import { fileURLToPath } from "node:url";

import { attempt } from "./daytona.ts";

export const AVENIRE_SNAPSHOT = "avenire-sandbox-v1";
/** Daytona 0.220.0 fixes resources on the snapshot; create-from-snapshot has no override. */
export const SANDBOX_RESOURCES = { cpu: 4, memory: 8, disk: 30 } as const;
/** manimgx requires Python 3.13 or newer. */
export const PYTHON_VERSION = "3.13";
/** Retained until the server-agent migration removes the Pi imports. */
export const PI_VERSION = "0.83.0";

const wallpaper = fileURLToPath(new URL("../assets/wallpaper.svg", import.meta.url));
const wallpaperScript = fileURLToPath(new URL("../assets/set-wallpaper.sh", import.meta.url));
const wallpaperAutostart = fileURLToPath(
  new URL("../assets/avenire-wallpaper.desktop", import.meta.url),
);

/** Support the Debian variants used by Daytona's base; fail on unknown distributions. */
export const avenireSandboxImage = Image.base("daytonaio/sandbox")
  // The science venv is the default `python`; /usr/bin/python3 stays the distro interpreter for KiCad.
  .dockerfileCommands([
    "USER root",
    "ENV PATH=/opt/avenire/python/bin:/usr/local/bin:/usr/bin:$PATH",
  ])
  .runCommands(
    // TeX stays for report generation (manimgx bundles its own typesetting and encoder).
    "set -eu; . /etc/os-release; case \"$ID:$VERSION_CODENAME\" in debian:bookworm|debian:trixie) ;; *) echo 'Unsupported Daytona base distribution for KiCad 9' >&2; exit 1;; esac; apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl build-essential pkg-config ffmpeg texlive-latex-base texlive-latex-extra texlive-fonts-recommended python3; rm -rf /var/lib/apt/lists/*",
    // The base already carries most of Daytona's desktop stack. Install only missing packages.
    "set -eu; missing=''; for package in xvfb xfce4 xfce4-terminal xfconf x11vnc novnc dbus-x11 libx11-6 libxrandr2 libxext6 libxrender1 libxfixes3 libxss1 libxtst6 libxi6; do if ! dpkg-query -W -f='${db:Status-Abbrev}' \"$package\" 2>/dev/null | grep -q '^ii'; then missing=\"$missing $package\"; fi; done; if [ -n \"$missing\" ]; then apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $missing; fi; rm -rf /var/lib/apt/lists/*",
    // KiCad's pcbnew SWIG binding belongs to the distro Python: run KiCad scripts with /usr/bin/python3.
    "set -eu; . /etc/os-release; if [ \"$VERSION_CODENAME\" = bookworm ]; then printf '%s\\n' 'deb http://deb.debian.org/debian bookworm-backports main' > /etc/apt/sources.list.d/avenire-bookworm-backports.list; apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends -t bookworm-backports kicad; else apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends kicad; fi; test \"$(kicad-cli version | cut -d. -f1)\" -ge 9; /usr/bin/python3 -c 'import pcbnew'; rm -rf /var/lib/apt/lists/*",
    // manimgx needs Python 3.13+; uv installs a prebuilt interpreter instead of compiling one.
    `set -eu; curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh; export UV_PYTHON_INSTALL_DIR=/opt/avenire/uv-python; uv python install ${PYTHON_VERSION}; uv venv --python ${PYTHON_VERSION} /opt/avenire/python; uv pip install --python /opt/avenire/python/bin/python --no-cache numpy scipy pandas openpyxl sympy matplotlib networkx scikit-learn polars Pillow imageio manimgx playwright; /opt/avenire/python/bin/python -c 'import numpy, scipy, pandas, openpyxl, sympy, matplotlib, networkx, sklearn, polars, PIL, imageio, manimgx; from playwright.sync_api import sync_playwright'`,
    "set -eu; curl -fsSL https://deb.nodesource.com/setup_24.x | bash -; DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nodejs; npm install -g corepack@0.34.5; corepack enable; corepack prepare pnpm@11.17.0 --activate; node --version | grep -q '^v24\\.'; pnpm --version | grep -qx '11.17.0'; rm -rf /var/lib/apt/lists/*",
    "set -eu; PLAYWRIGHT_BROWSERS_PATH=/opt/avenire/browsers /opt/avenire/python/bin/python -m playwright install --with-deps chromium; chmod -R a+rX /opt/avenire; mkdir -p /home/daytona/workspace; chown -R daytona:daytona /home/daytona/workspace",
  )
  .addLocalFile(wallpaper, "/usr/share/backgrounds/avenire/wallpaper.svg")
  .addLocalFile(wallpaperScript, "/usr/local/bin/avenire-set-wallpaper")
  .addLocalFile(wallpaperAutostart, "/home/daytona/.config/autostart/avenire-wallpaper.desktop")
  .runCommands(
    "chmod 0755 /usr/local/bin/avenire-set-wallpaper; chown daytona:daytona /home/daytona/.config; chown -R daytona:daytona /home/daytona/.config/autostart; chmod 0644 /home/daytona/.config/autostart/avenire-wallpaper.desktop /usr/share/backgrounds/avenire/wallpaper.svg",
  )
  .env({
    PLAYWRIGHT_BROWSERS_PATH: "/opt/avenire/browsers",
    VNC_RESOLUTION: "1024x768",
  })
  .dockerfileCommands(["USER daytona"]);

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
