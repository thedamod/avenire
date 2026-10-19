import { describe, expect, it, vi } from "vite-plus/test";
import { ThreadId } from "@avenire/contracts";
import { conversationSession, ConversationSession, questionAnswer } from "./conversation.ts";

for (const platform of ["web", "native"])
  describe(`${platform} conversation lifecycle`, () => {
    it("restores thread, draft and pending decisions when the adapter remounts", async () => {
      const runtime = {};
      const session = conversationSession<{ pending: string }>(runtime);
      const load = vi.fn(async () => ({
        threadId: ThreadId.make("saved"),
        messages: [{ pending: "question-1" }],
      }));
      await Promise.all([session.hydrate(load), session.hydrate(load)]);
      session.draft = "draft answer";
      const adapter = session.retain(() => ({ messages: session.messages }));
      const restored = conversationSession<{ pending: string }>(runtime);
      expect(restored.retain(() => ({}))).toBe(adapter);
      expect(restored.draft).toBe("draft answer");
      expect(restored.messages).toEqual([{ pending: "question-1" }]);
      const create = vi.fn(async () => ThreadId.make("unwanted"));
      expect(await restored.ensureThread(create)).toBe("saved");
      expect(create).not.toHaveBeenCalled();
      expect(load).toHaveBeenCalledTimes(1);
      expect(conversationSession({})).not.toBe(restored);
    });
    it("creates one thread under concurrent sends and submits each tool decision once", async () => {
      const session = new ConversationSession();
      await session.hydrate(async () => ({ messages: [] }));
      const create = vi.fn(async () => ThreadId.make("new"));
      await Promise.all([session.ensureThread(create), session.ensureThread(create)]);
      expect(create).toHaveBeenCalledTimes(1);
      const output = vi.fn(async () => {});
      const answer = questionAnswer("call-7", "  custom answer  ");
      await Promise.all([
        session.respondOnce(answer.toolCallId, () => output()),
        session.respondOnce(answer.toolCallId, () => output()),
      ]);
      expect(answer).toEqual({
        tool: "ask_user",
        toolCallId: "call-7",
        output: { answers: ["custom answer"] },
      });
      expect(output).toHaveBeenCalledTimes(1);
      expect(() => questionAnswer("call-7", " ")).toThrow("Enter an answer");
    });
    it("allows retry after a failed decision and blocks send before failed hydration", async () => {
      const session = new ConversationSession();
      await expect(
        session.hydrate(async () => {
          throw new Error("offline");
        }),
      ).rejects.toThrow("offline");
      await expect(session.ensureThread(async () => ThreadId.make("new"))).rejects.toThrow(
        "not ready",
      );
      await expect(
        session.respondOnce("tool", async () => {
          throw new Error("offline");
        }),
      ).rejects.toThrow("offline");
      const retry = vi.fn();
      await session.respondOnce("tool", retry);
      expect(retry).toHaveBeenCalledTimes(1);
    });
  });
