import { expect, it } from "@effect/vitest";
import { runInNewContext } from "node:vm";
import { instrumentation } from "./instrumentation.ts";

const setup = () => {
  const gl = {
    NO_ERROR: 0,
    errorCode: 0,
    getError() {
      const e = this.errorCode;
      this.errorCode = 0;
      return e;
    },
    COMPILE_STATUS: 1,
    LINK_STATUS: 2,
    compileShader: (_shader: unknown) => {},
    getShaderParameter: (shader: { valid: boolean }) => shader.valid,
    getShaderInfoLog: () => "Invalid fragment shader",
    linkProgram: (_program: unknown) => {},
    getProgramParameter: (program: { valid: boolean }) => program.valid,
    getProgramInfoLog: () => "Program link failed",
    drawArrays: () => {},
    drawElements: () => {},
  };
  class Canvas extends EventTarget {
    getContext(kind: string) {
      return kind === "2d" ? {} : kind === "webgl" ? gl : null;
    }
  }
  const window = {
    addEventListener: () => {},
    fetch: async () => {},
    requestAnimationFrame: () => 0,
  } as Record<string, any>;
  const document = {
    body: {
      innerText: "",
      scrollHeight: 100,
      scrollWidth: 400,
      getBoundingClientRect: () => ({ height: 100 }),
    },
    documentElement: { scrollWidth: 400 },
  };
  runInNewContext(instrumentation, {
    window,
    document,
    HTMLCanvasElement: Canvas,
    EventTarget,
    innerWidth: 400,
    getComputedStyle: () => ({ visibility: "visible" }),
  });
  return { window, Canvas, gl, measure: () => window.__avenirePreview.measure() };
};
it("distinguishes Canvas 2D from an actual linked and drawn shader", () => {
  const f = setup();
  const canvas = new f.Canvas();
  canvas.getContext("2d");
  expect(f.measure().rendering).toMatchObject({
    canvas2d: 1,
    webgl: 0,
    programsLinked: 0,
    drawCalls: 0,
  });
  const gl = new f.Canvas().getContext("webgl") as typeof f.gl;
  gl.compileShader({ valid: true });
  gl.linkProgram({ valid: true });
  gl.drawArrays();
  expect(f.measure()).toMatchObject({
    errors: [],
    rendering: { canvas2d: 1, webgl: 1, programsLinked: 1, drawCalls: 1 },
  });
});
it("reports shader compile/link errors and lost contexts even if the widget swallows errors", () => {
  const f = setup();
  const canvas = new f.Canvas();
  const gl = canvas.getContext("webgl") as typeof f.gl;
  gl.compileShader({ valid: false });
  gl.linkProgram({ valid: false });
  canvas.dispatchEvent(new Event("webglcontextlost"));
  const report = f.measure();
  expect(report.errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "shader", message: "Invalid fragment shader" }),
      expect.objectContaining({ kind: "shader", message: "Program link failed" }),
      expect.objectContaining({ kind: "webgl", message: "WebGL context lost" }),
    ]),
  );
  expect(report.rendering).toMatchObject({ webgl: 0, programsLinked: 0, contextsLost: 1 });
});
it("allows WebGL 1 fallback after a failed WebGL 2 probe", () => {
  const f = setup();
  const canvas = new f.Canvas();
  canvas.getContext("webgl2");
  canvas.getContext("webgl");
  expect(f.measure().errors).toEqual([]);
});
it("reports an unavailable WebGL renderer once", () => {
  const f = setup();
  new f.Canvas().getContext("webgl2");
  expect(f.measure().errors).toEqual([expect.objectContaining({ kind: "webgl" })]);
  expect(f.measure().errors).toEqual([]);
});

it("rejects a failed GPU draw without hiding its error from widget code", () => {
  const f = setup();
  const gl = new f.Canvas().getContext("webgl") as typeof f.gl;
  gl.linkProgram({ valid: true });
  gl.errorCode = 0x0502;
  gl.drawArrays();
  const report = f.measure();
  expect(report.rendering.drawCalls).toBe(0);
  expect(report.errors).toEqual([
    expect.objectContaining({ kind: "webgl", message: "WebGL error after drawArrays: 0x502" }),
  ]);
  expect(gl.getError()).toBe(0x0502);
  expect(gl.getError()).toBe(0);
});
