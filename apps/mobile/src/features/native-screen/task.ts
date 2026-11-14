/* eslint-disable no-await-in-loop -- Annotation replacement/clear requests must retain stream order. */
import { DefaultChatTransport, readUIMessageStream } from "ai";
import type { RuthUIMessage } from "@avenire/ai/message-types";
import {
  DesktopScreenObservation,
  RUTH_CHAT_PATH,
  ThreadId,
  type PageContext,
} from "@avenire/contracts";
import { call, makeClientRuntime, disposeClientRuntime } from "@avenire/client-runtime/rpc";
import * as Schema from "effect/Schema";
import { fetch as expoFetch } from "expo/fetch";
import { apiUrl, authClient, getCookieHeader } from "../../state/auth";
import { colors } from "../../theme/tokens";
import { nativeScreenBridge } from "./native";
import { annotationResults, annotationText, lastParagraph } from "./results";

/** Headless JS uses the same auth, RPC and AI SDK transport as mobile chat, with no navigation. */
export async function runAvaTask(input: { session: string; question: string; threadId?: string }) {
  const native = nativeScreenBridge();
  if (!native) return;
  const bridge = native;
  const show = (session: string, text: string, done: boolean, thread: string) =>
    native.updateResponse(session, lastParagraph(text), done, thread);

  const runtime = makeClientRuntime({
    baseUrl: apiUrl,
    getAuthHeaders: getCookieHeader,
    credentials: "omit",
  });
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 230_000);
  const poll = setInterval(() => {
    void bridge
      .isSessionActive(input.session)
      .then((active) => {
        if (!active) abort.abort();
      })
      .catch(() => abort.abort());
  }, 1500);
  let threadId = input.threadId ?? "";
  let response = "";
  try {
    const auth = await authClient.getSession();
    if (!auth.data?.user) throw new Error("Sign in to Avenire first, then open Ava again.");
    await bridge.bindOwner(auth.data.user.id);
    if (!(await bridge.isSessionActive(input.session))) return;
    const settings = await call(runtime, (client) => client["settings.get"]());
    let capture: typeof DesktopScreenObservation.Type | undefined;
    if (settings.settings.shareScreenWithAi === true) {
      try {
        capture = Schema.decodeUnknownSync(DesktopScreenObservation)(
          await bridge.getScreenContext(input.session),
        );
      } catch {
        await show(
          input.session,
          "Screen context is unavailable. Answering your text prompt…",
          false,
          threadId,
        );
      }
    }
    if (!threadId)
      threadId = (
        await call(runtime, (client) =>
          client["ruth.createThread"]({ title: input.question.slice(0, 120) }),
        )
      ).id;
    if (abort.signal.aborted || !(await bridge.isSessionActive(input.session))) return;
    await show(input.session, "Thinking…", false, threadId);
    const message: RuthUIMessage = {
      id: `ava-${input.session}-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text: input.question }],
    };
    const transport = new DefaultChatTransport<RuthUIMessage>({
      api: `${apiUrl}${RUTH_CHAT_PATH}`,
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      credentials: "omit",
      headers: getCookieHeader,
      prepareSendMessagesRequest: () => ({
        body: {
          threadId: ThreadId.make(threadId),
          message,
          page: {
            surface: "ephemeral",
            platform: "mobile",
            contentWidthPx: 360,
            colorScheme: "dark",
            themeTokens: { ...colors },
            fonts: { body: "Geist", mono: "Geist Mono" },
          } satisfies PageContext,
          ...(capture ? { screenContext: capture, nativeAnnotationAvailable: true } : {}),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
      }),
    });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: threadId,
      messageId: undefined,
      messages: [message],
      abortSignal: abort.signal,
    });
    const seen = new Set<string>();
    let labels = "";
    for await (const reply of readUIMessageStream<RuthUIMessage>({
      stream,
      terminateOnError: true,
    })) {
      const text = reply.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n\n");
      for (const { callId, result } of annotationResults([reply])) {
        if (seen.has(callId) || result.capturedAt !== capture?.capturedAt) continue;
        seen.add(callId);
        labels =
          annotationText(result) ||
          (result.items.length ? "Screen annotations updated." : "Screen annotations cleared.");
        const fresh = await call(runtime, (client) => client["settings.get"]());
        if (
          fresh.settings.shareScreenWithAi === true &&
          (await bridge.isSessionActive(input.session))
        ) {
          try {
            await bridge.presentAnnotations(input.session, JSON.stringify(result));
          } catch {
            /* Complete label text remains in the transcript below. */
          }
        }
      }
      response = text || labels || "Thinking…";
      await show(input.session, response, false, threadId);
    }
    await show(
      input.session,
      response && response !== "Thinking…" ? response : "No reply was returned. Please try again.",
      true,
      threadId,
    );
  } catch (error) {
    await show(
      input.session,
      `${response ? response + "\n\n" : ""}${abort.signal.aborted ? "Reply stopped." : error instanceof Error ? error.message : "Could not reach Ava. Please try again."}`,
      true,
      threadId,
    );
  } finally {
    clearInterval(poll);
    clearTimeout(timeout);
    await disposeClientRuntime(runtime);
  }
}
