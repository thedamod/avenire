import { ThreadId, UserId } from "@avenire/contracts";
import { Database, DatabaseError } from "@avenire/database/client";
import { describe, expect, it } from "@effect/vitest";
import { MockLanguageModelV4 } from "ai/test";
import * as Effect from "effect/Effect";
import { cloudFixture } from "../cloud/cloud-test-support.ts";
import type { RuthUIMessage } from "../message-types.ts";
import { generateThreadTitle, shouldGenerateThreadTitle, titleThread } from "./thread-title.ts";

const message = (role: RuthUIMessage["role"], text: string): RuthUIMessage => ({
  id: role,
  role,
  parts: [{ type: "text", text }],
});
const messages = [
  message("user", "Could you explain entropy and the second law of thermodynamics?"),
  message("assistant", "Entropy describes how energy disperses."),
];
const modelWith = (text: string, onGenerate = () => {}) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      onGenerate();
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 10, text: 10, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });

describe("opening conversation titles", () => {
  it("recognizes prompt excerpts across clients while preserving custom titles", () => {
    const text = "Explain  entropy\n".repeat(15);
    const opening = [message("user", text)];
    for (const title of [
      "New chat",
      "New thread",
      text.trim().slice(0, 120),
      text.trim().replace(/\s+/g, " ").slice(0, 60),
    ])
      expect(shouldGenerateThreadTitle(title, opening)).toBe(true);
    expect(shouldGenerateThreadTitle("My exam revision", opening)).toBe(false);
    expect(shouldGenerateThreadTitle("New chat", [message("user", "   ")])).toBe(false);
    const boundary = `${"a".repeat(59)} ${"b".repeat(59)} next`;
    for (const limit of [60, 120])
      expect(
        shouldGenerateThreadTitle(boundary.slice(0, limit).trim(), [message("user", boundary)]),
      ).toBe(true);
  });

  it.effect("generates a concise title using bounded text without tool or image payloads", () =>
    Effect.gen(function* () {
      const model = modelWith('Title: "Entropy and the Second Law"');
      const result = yield* generateThreadTitle(model, [
        {
          ...messages[0]!,
          parts: [
            ...messages[0]!.parts,
            { type: "file", mediaType: "image/png", url: "data:image/png;base64,private-image" },
          ],
        },
        {
          ...messages[1]!,
          parts: [...messages[1]!.parts, { type: "reasoning", text: "private-reasoning" }],
        },
        message("user", "x".repeat(10_000)),
        message("assistant", "The next example"),
        message("user", "later-message"),
      ]);
      expect(result).toBe("Entropy and the Second Law");
      const request = model.doGenerateCalls[0]!;
      const prompt = JSON.stringify(request.prompt);
      expect(prompt).toContain("Entropy describes how energy disperses");
      for (const excluded of [
        "private-image",
        "private-reasoning",
        "later-message",
        "x".repeat(2_001),
      ])
        expect(prompt).not.toContain(excluded);
      expect(request.maxOutputTokens).toBe(512);
    }),
  );

  for (const text of ["", "  \n  ", "A".repeat(81)]) {
    it.effect(`keeps the fallback for unusable output ${JSON.stringify(text)}`, () =>
      Effect.gen(function* () {
        expect(yield* generateThreadTitle(modelWith(text), messages)).toBeNull();
      }),
    );
  }

  it.effect("saves the generated title only on the owned chat", () => {
    const f = cloudFixture();
    const input = {
      model: modelWith("Entropy and the Second Law"),
      userId: UserId.make("user"),
      threadId: ThreadId.make("thread"),
      previousTitle: "New chat",
      messages,
    };
    const own = { id: "thread", userId: "user", kind: "chat", title: "New chat" };
    const other = { ...own, userId: "other" };
    const cloud = { ...own, kind: "ruth-cloud" };
    const unrelated = { ...own, id: "another-thread" };
    f.rows("ruth_thread").push(own, other, cloud, unrelated);
    return Effect.gen(function* () {
      yield* titleThread(input);
      expect(own.title).toBe("Entropy and the Second Law");
      for (const row of [other, cloud, unrelated]) expect(row.title).toBe("New chat");
    }).pipe(Effect.provideService(Database, f.database));
  });

  it.effect("preserves a manual rename made while the model is running", () => {
    const f = cloudFixture();
    const row = { id: "thread", userId: "user", kind: "chat", title: "New chat" };
    f.rows("ruth_thread").push(row);
    return Effect.gen(function* () {
      yield* titleThread({
        model: modelWith("Entropy and the Second Law", () => {
          row.title = "My exam revision";
        }),
        userId: UserId.make("user"),
        threadId: ThreadId.make("thread"),
        previousTitle: "New chat",
        messages,
      });
      expect(row.title).toBe("My exam revision");
    }).pipe(Effect.provideService(Database, f.database));
  });

  it.effect("keeps chat usable when the provider or title persistence fails", () => {
    const f = cloudFixture();
    const row = { id: "thread", userId: "user", kind: "chat", title: "New chat" };
    f.rows("ruth_thread").push(row);
    const input = {
      userId: UserId.make("user"),
      threadId: ThreadId.make("thread"),
      previousTitle: "New chat",
      messages,
    };
    const failing = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("unavailable");
      },
    });
    return Effect.gen(function* () {
      yield* titleThread({ ...input, model: undefined });
      yield* titleThread({ ...input, model: failing });
      expect(failing.doGenerateCalls).toHaveLength(1);
      expect(f.writes).toHaveLength(0);
      yield* titleThread({ ...input, model: modelWith("Entropy and the Second Law") }).pipe(
        Effect.provideService(
          Database,
          Database.of({
            ...f.database,
            use: () => Effect.fail(new DatabaseError({ cause: "unavailable" })),
          }),
        ),
      );
      expect(row.title).toBe("New chat");
    }).pipe(Effect.provideService(Database, f.database));
  });
});
