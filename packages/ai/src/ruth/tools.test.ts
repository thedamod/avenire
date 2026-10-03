import { describe, expect, it } from "@effect/vitest";
import { MessageId, ThreadId } from "@avenire/contracts";
import { historyToPrompt } from "./agent.ts";
import { validateWidgetHtml } from "./tools.ts";

describe("Ruth widget HTML validation", () => {
  it("accepts self-contained local markup", () => {
    expect(validateWidgetHtml("<style>.x{color:red}</style><button>Run</button>")).toBeUndefined();
  });

  it.each([
    '<script src="https://example.com/app.js"></script>',
    '<img src="http://example.com/image.png">',
    '<a href="https://example.com">link</a>',
    "<form><input></form>",
    '<script>fetch("/secret")</script>',
    "<script>new XMLHttpRequest()</script>",
    '<script>new WebSocket("ws://example.com")</script>',
    '<script>new EventSource("/events")</script>',
  ])("rejects unsafe markup: %s", (html) => {
    expect(validateWidgetHtml(html)).toBeDefined();
  });
});

describe("historyToPrompt", () => {
  it("puts the system prompt first and replays dialogue in order", () => {
    const prompt = historyToPrompt([
      {
        id: MessageId.make("m1"),
        threadId: ThreadId.make("t1"),
        role: "user",
        parts: [{ _tag: "text", text: "Explain eigenvalues", citations: [] }],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(prompt.content.map((message) => message.role)).toEqual(["system", "user"]);
  });
});
