/** Declarative image only. Importing this module never builds or publishes a snapshot. */
import { DaytonaNotFoundError, Image, type Daytona } from "@daytonaio/sdk";
import * as Effect from "effect/Effect";
import { fileURLToPath } from "node:url";
import { DESKTOP_FILES, DESKTOP_PACKAGES } from "./desktop.ts";

import { attempt } from "./daytona.ts";

export const AVENIRE_SNAPSHOT = "avenire-sandbox-v6";
/** Daytona 0.220.0 fixes resources on the snapshot; create-from-snapshot has no override.
 * 10 GB is the per-sandbox disk maximum on the current Daytona plan. */
export const SANDBOX_RESOURCES = { cpu: 4, memory: 8, disk: 10 } as const;
/** manimgx requires Python 3.13 or newer. */
export const PYTHON_VERSION = "3.13";

/** Support the Debian variants used by Daytona's base; fail on unknown distributions. */
const runtimeImage = Image.base("daytonaio/sandbox:0.9.0-slim")
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
    `set -eu; curl -fsSL https://astral.sh/uv/0.13.0/install.sh -o /tmp/uv-install.sh; echo '283cbef4bdaca819bd896b0dacb8a085c4c05dbc880642aa5001d97bc4db74ba  /tmp/uv-install.sh' | sha256sum -c -; env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh /tmp/uv-install.sh; rm /tmp/uv-install.sh; export UV_PYTHON_INSTALL_DIR=/opt/avenire/uv-python; uv python install ${PYTHON_VERSION}; uv venv --python ${PYTHON_VERSION} /opt/avenire/python; uv pip install --python /opt/avenire/python/bin/python --no-cache numpy scipy pandas openpyxl sympy matplotlib networkx scikit-learn polars Pillow imageio manimgx playwright; /opt/avenire/python/bin/python -c 'import numpy, scipy, pandas, openpyxl, sympy, matplotlib, networkx, sklearn, polars, PIL, imageio, manimgx; from playwright.sync_api import sync_playwright'`,
    // pnpm installed globally (not via Corepack) so every user gets the pinned version offline.
    "set -eu; curl -fsSL https://raw.githubusercontent.com/nodesource/distributions/c6e581b0d24e5d043476ddb947d70e6fe10e83c9/scripts/deb/setup_24.x -o /tmp/node-setup.sh; echo '6e3d580f5bd7ccf2aa1e8df8d35c60d78e873c3ff8beb282c9bebd914904ad72  /tmp/node-setup.sh' | sha256sum -c -; bash /tmp/node-setup.sh; rm /tmp/node-setup.sh; DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nodejs; npm install -g pnpm@11.17.0; node --version | grep -q '^v24\\.'; pnpm --version | grep -qx '11.17.0'; rm -rf /var/lib/apt/lists/*",
    "set -eu; PLAYWRIGHT_BROWSERS_PATH=/opt/avenire/browsers /opt/avenire/python/bin/python -m playwright install --with-deps chromium; chmod -R a+rX /opt/avenire; mkdir -p /home/daytona/workspace; chown -R daytona:daytona /home/daytona/workspace",
  )
  .runCommands(
    `set -eu; apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ${DESKTOP_PACKAGES}; rm -rf /var/lib/apt/lists/*`,
  )
  .env({
    PLAYWRIGHT_BROWSERS_PATH: "/opt/avenire/browsers",
    CHROME_PATH: "/usr/local/bin/avenire-figure-chromium",
    VNC_RESOLUTION: "1600x900",
    XCURSOR_THEME: "Bibata-Modern-Ice",
    XCURSOR_SIZE: "24",
  });

export const avenireSandboxImage = DESKTOP_FILES.reduce(
  (image, [file, target]) =>
    image.addLocalFile(
      fileURLToPath(new URL(`../assets/desktop/${file}`, import.meta.url)),
      target,
    ),
  runtimeImage,
)
  .runCommands(
    "set -eu; sh /tmp/install-graphite.sh; rm /tmp/install-graphite.sh; apt-get purge -y sassc; rm -rf /var/lib/apt/lists/*",
    "set -eu; for package in plank xfce4-screensaver xscreensaver light-locker xfce4-power-manager; do if dpkg-query -W -f='${db:Status-Abbrev}' \"$package\" 2>/dev/null | grep -q '^ii'; then apt-get purge -y \"$package\"; fi; done; rm -rf /home/daytona/.cache/sessions /home/daytona/Desktop/*",
    "chmod +x /usr/local/bin/avenire-browser /usr/local/bin/avenire-desktop-session; chown -R daytona:daytona /home/daytona/.config /home/daytona/.Xresources",
  )
  .addLocalFile(
    fileURLToPath(new URL("../assets/figure-chromium", import.meta.url)),
    "/usr/local/bin/avenire-figure-chromium",
  )
  .runCommands("chmod 755 /usr/local/bin/avenire-figure-chromium")
  .addLocalDir(
    fileURLToPath(new URL("../assets/figures/", import.meta.url)),
    "/opt/avenire/figures",
  )
  .runCommands("chown -R root:root /opt/avenire/figures; chmod -R a+rX,a-w /opt/avenire/figures")
  .dockerfileCommands(["USER daytona"]);

export const ensureSnapshot = Effect.fn("Snapshots.ensureSnapshot")(function* (
  daytona: Daytona,
  name: string,
  image: Image,
  resources: { cpu: number; memory: number; disk: number },
  options: { readonly onLogs?: (chunk: string) => void } = {},
) {
  return yield* attempt("getSnapshot", () => daytona.snapshot.get(name)).pipe(
    Effect.catchTag("CloudError", (error) =>
      error.cause instanceof DaytonaNotFoundError
        ? attempt("createSnapshot", () =>
            daytona.snapshot.create({ name, image, resources }, options),
          )
        : Effect.fail(error),
    ),
  );
});
