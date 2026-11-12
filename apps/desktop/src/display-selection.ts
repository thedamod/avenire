/** The compositor session is Linux-specific; DISPLAY alone can also mean XWayland. */
export function usesWayland(
  platform: NodeJS.Platform,
  sessionType: string,
  waylandDisplay: string,
): boolean {
  return (
    platform === "linux" &&
    sessionType !== "x11" &&
    (sessionType === "wayland" || waylandDisplay.length > 0)
  );
}

type Bounds = { x: number; y: number; width: number; height: number };
export type NativeScreen = Bounds & { id: string };

/** Electron/Qt can differ by one logical pixel at fractional display scales. */
export function matchNativeScreen(
  area: Bounds,
  screens: readonly NativeScreen[] | undefined,
): NativeScreen {
  const matches = screens?.filter((candidate) =>
    (["x", "y", "width", "height"] as const).every(
      (key) => Math.abs(candidate[key] - area[key]) <= 1,
    ),
  );
  if (matches?.length !== 1 || !matches[0])
    throw new Error("Native overlay could not match the selected display");
  return matches[0];
}

export function displayStillPresent(
  id: number,
  area: Bounds,
  displays: readonly { id: number; bounds: Bounds }[],
): boolean {
  return displays.some(
    (display) =>
      display.id === id &&
      (["x", "y", "width", "height"] as const).every((key) => display.bounds[key] === area[key]),
  );
}

export type WaylandOutput = Bounds & { name: string; scale: number };

/** Bind XWayland logical bounds to one authoritative compositor output. */
export function matchHyprlandOutput(area: Bounds, value: unknown): WaylandOutput {
  if (!Array.isArray(value) || value.length > 64)
    throw new Error("Wayland output inventory is unavailable");
  const matches = value.filter((output) => {
    if (
      !output ||
      typeof output !== "object" ||
      typeof output.name !== "string" ||
      !output.name ||
      output.name.length > 200 ||
      /[\u0000-\u001f]/.test(output.name) ||
      !Number.isFinite(output.x) ||
      !Number.isFinite(output.y) ||
      !Number.isFinite(output.width) ||
      output.width <= 0 ||
      !Number.isFinite(output.height) ||
      output.height <= 0 ||
      !Number.isFinite(output.scale) ||
      output.scale <= 0 ||
      output.disabled === true ||
      output.dpmsStatus === false
    )
      return false;
    return (
      Math.abs(output.x - area.x) <= 1 &&
      Math.abs(output.y - area.y) <= 1 &&
      Math.abs(output.width / output.scale - area.width) <= 1 &&
      Math.abs(output.height / output.scale - area.height) <= 1
    );
  });
  const output = matches[0];
  if (matches.length !== 1 || !output)
    throw new Error("Wayland output mapping is ambiguous or disagrees with the selected display");
  if (output.transform !== 0 || (output.mirrorOf && output.mirrorOf !== "none"))
    throw new Error("Wayland rotated or mirrored output mapping is unsupported");
  return {
    name: output.name,
    x: output.x,
    y: output.y,
    width: output.width,
    height: output.height,
    scale: output.scale,
  };
}

export function sameWaylandOutput(left: WaylandOutput, right: WaylandOutput): boolean {
  return (["name", "x", "y", "width", "height", "scale"] as const).every(
    (key) => left[key] === right[key],
  );
}
