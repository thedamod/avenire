import { describe, expect, it } from "vite-plus/test";
import { annotationResults, annotationText, lastParagraph } from "./results";
const result = {
  requested: true,
  capturedAt: "2026-11-14T10:00:00.000Z",
  items: [
    {
      id: "region",
      kind: "cursor",
      x: 0.2,
      y: 0.4,
      text: "This is the region.\nIts full explanation stays readable.",
      color: "#ABC4FF80",
    },
  ],
};
const part = {
  type: "tool-native_annotate",
  state: "output-available",
  toolCallId: "call-1",
  output: result,
};
describe("mobile native annotation tool results", () => {
  it("accepts the desktop protocol and preserves complete bubble text", () => {
    const found = annotationResults([{ parts: [part] }]);
    expect(found).toHaveLength(1);
    expect(annotationText(found[0]!.result)).toBe(result.items[0]!.text);
  });
  it("never presents partial calls, other tools, or arbitrary output objects", () => {
    expect(
      annotationResults([
        {
          parts: [
            { ...part, state: "input-available" },
            { ...part, type: "tool-publish_asset" },
            { ...part, output: { items: result.items } },
          ],
        },
      ]),
    ).toEqual([]);
  });
  it("rejects invalid coordinates, code-bearing colors and excessive item counts", () => {
    for (const items of [
      [{ ...result.items[0], x: 1.1 }],
      [{ ...result.items[0], y: NaN }],
      [{ ...result.items[0], color: "url(https://bad)" }],
      Array.from({ length: 33 }, () => result.items[0]),
    ])
      expect(annotationResults([{ parts: [{ ...part, output: { ...result, items } }] }])).toEqual(
        [],
      );
  });
  it("accepts explicit clearing and dynamic-tool envelopes", () => {
    expect(
      annotationResults([
        {
          parts: [
            {
              ...part,
              type: "dynamic-tool",
              toolName: "native_annotate",
              output: { ...result, items: [] },
            },
          ],
        },
      ])[0]?.result.items,
    ).toEqual([]);
  });
});

it("shows only the latest paragraph while retaining a streaming partial paragraph", () => {
  expect(lastParagraph("Earlier explanation.\n\nThe direct answer.")).toBe("The direct answer.");
  expect(lastParagraph("Earlier.\r\n \r\nStill stream")).toBe("Still stream");
  expect(lastParagraph("Answer.\n\n")).toBe("Answer.");
  expect(lastParagraph("   ")).toBe("");
});

it("preserves an independently positioned callout and rejects invalid positions", () => {
  const output = { ...result, items: [{ ...result.items[0], labelPosition: { x: 0.05, y: 0.8 } }] };
  expect(
    annotationResults([{ parts: [{ ...part, output }] }])[0]?.result.items[0]?.labelPosition,
  ).toEqual({ x: 0.05, y: 0.8 });
  expect(
    annotationResults([
      {
        parts: [
          {
            ...part,
            output: {
              ...output,
              items: [{ ...output.items[0], labelPosition: { x: -0.1, y: 0.8 } }],
            },
          },
        ],
      },
    ]),
  ).toEqual([]);
});
