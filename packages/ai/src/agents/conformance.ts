/** Shared conformance fixture. Model-free scoring reads the actual page's browser state. */
import { MockLanguageModelV4 } from "ai/test";
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
export const mockComputerModel = (actions: readonly ComputerInput[]) =>
  new MockLanguageModelV4({
    doGenerate: Array.from({ length: actions.length + 1 }, (_, index) => ({
      content:
        index < actions.length
          ? [
              {
                type: "tool-call" as const,
                toolCallId: `conformance-${index}`,
                toolName: "computer",
                input: JSON.stringify(actions[index]),
              },
            ]
          : [{ type: "text" as const, text: "Finished the scripted task." }],
      finishReason: {
        unified: index < actions.length ? ("tool-calls" as const) : ("stop" as const),
        raw: index < actions.length ? "tool_calls" : "stop",
      },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
      },
      warnings: [],
    })),
  });
