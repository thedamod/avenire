/** Shared conformance fixture. Model-free scoring reads the actual page's browser state. */
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import type { ComputerInput } from "../tools/computer-specs.ts";
export const CONFORMANCE_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:24px sans-serif;background:#fff;color:#111}button,input{font:24px sans-serif;margin:20px;padding:20px}#bottom{position:absolute;top:1400px}body{height:2400px}</style></head><body><button id="one">First</button><button id="two">Second</button><input id="word" aria-label="Word"><p>Click First and Second, type avenire in Word, then scroll down.</p><div id="bottom">Scroll target</div><script>window.__state={one:0,two:0,word:'',scroll:0};one.onclick=()=>window.__state.one++;two.onclick=()=>window.__state.two++;word.oninput=()=>window.__state.word=word.value;window.onscroll=()=>window.__state.scroll=window.scrollY</script></body></html>`;
export type ConformanceState = { one: number; two: number; word: string; scroll: number };
export const scoreConformance = (state: ConformanceState) => ({
  first: state.one === 1,
  second: state.two === 1,
  typed: state.word === "avenire",
  scrolled: state.scroll > 100,
  score:
    Number(state.one === 1) +
    Number(state.two === 1) +
    Number(state.word === "avenire") +
    Number(state.scroll > 100),
});
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
export interface ScriptedStep {
  readonly text?: string;
  readonly toolCalls?: ReadonlyArray<{ id: string; name: string; input: string }>;
  /** Defaults to tool-calls when the step calls tools, else stop. */
  readonly finish?: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";
}
/** A streaming mock model that plays one scripted step per request (the last repeats). */
export const scriptedModel = (steps: readonly ScriptedStep[]) => {
  let index = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const step = steps[Math.min(index++, steps.length - 1)]!;
      const finish = step.finish ?? (step.toolCalls?.length ? "tool-calls" : "stop");
      return {
        stream: convertArrayToReadableStream([
          { type: "stream-start" as const, warnings: [] },
          ...(step.text === undefined
            ? []
            : [
                { type: "text-start" as const, id: "text" },
                { type: "text-delta" as const, id: "text", delta: step.text },
                { type: "text-end" as const, id: "text" },
              ]),
          ...(step.toolCalls ?? []).map((call) => ({
            type: "tool-call" as const,
            toolCallId: call.id,
            toolName: call.name,
            input: call.input,
          })),
          {
            type: "finish" as const,
            finishReason: { unified: finish, raw: finish },
            usage,
          },
        ]),
      };
    },
  });
};
export const mockComputerModel = (actions: readonly ComputerInput[]) =>
  scriptedModel([
    ...actions.map((action, index) => ({
      toolCalls: [{ id: `conformance-${index}`, name: "computer", input: JSON.stringify(action) }],
    })),
    { text: "Finished the scripted task." },
  ]);
