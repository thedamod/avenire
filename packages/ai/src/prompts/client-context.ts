import type { DesktopScreenObservation, PageContext } from "@avenire/contracts";

export interface ClientPromptContext {
  readonly page?: Pick<PageContext, "platform" | "surface" | "contentWidthPx"> | undefined;
  readonly screen?: Pick<DesktopScreenObservation, "width" | "height"> | undefined;
}

/** Local-device layout is separate from the isolated cloud computer's coordinate profile. */
export function describeClientContext({ page, screen }: ClientPromptContext): readonly string[] {
  if (!page) return [];
  return [
    "",
    "## Current client and annotation layout",
    `This turn comes from ${page.platform === "mobile" ? "a mobile phone" : `the ${page.platform} client`}. Surface: ${page.surface}. Available content width: ${Math.max(1, page.contentWidthPx)} logical pixels.`,
    ...(screen
      ? [
          `The attached local capture is ${screen.width} × ${screen.height} pixels (${screen.height >= screen.width ? "portrait" : "landscape"}); the preview is scaled to fit above the composer and answer paragraph.`,
        ]
      : []),
    "Use the supplied client context for local annotations. The computer/screen_read coordinate profile describes a separate cloud desktop, not this device. Annotation x/y coordinates must identify the real target in the full capture; the renderer can place its bubble elsewhere and connect it with a leader arrow. Do not move an anchor off its target merely to make room for text.",
    "These annotation layout rules apply on every device: use a few concise 2–6 word callouts, leave clear gaps between their whole text boxes, and keep explanations in the final answer paragraph. Scale density to the available viewport rather than assuming desktop space. Never pile labels over a cluster of controls.",
    "Labels may be far from their targets. Set labelPosition to a clear area (normalized top-left of the text box) independently of x/y, which must remain on the actual target. A leader arrow must connect the label to that target. Prefer empty margins and distribute callouts around the subject instead of covering it. Black letterbox areas may hold labels, but are not source content or valid invented targets.",
    "Consider the size of the rendered text boxes, not just distance between anchor points. If there is insufficient space, use fewer text labels and text-free highlights for the remaining targets. Replace or clear the current set as focus changes; do not issue multiple sets pretending their labels accumulate in separate positions.",
  ];
}
