import fragmentSource from "../shaders/liquid.frag?raw";

/**
 * The WebGL2 engine behind the hero exhaust and the final-CTA glow: one shader
 * (`liquid.frag`) drawing a ribbon of liquid along a path. A scene supplies the path each
 * frame; the engine owns the GL setup, the pour-in, the pointer, pausing offscreen,
 * reduced motion and the slow-GPU fallback.
 */

export const POINTS = 96; // N in liquid.frag
const SCALE = 2; // render at half resolution; the liquid is soft and the canvas upscales

export type Pointer = {
  x: number;
  y: number;
  inside: boolean;
  /** Smoothed velocity in CSS pixels per frame, capped so the liquid only shifts slightly. */
  vx: number;
  vy: number;
  /** 0..1, eased toward 1 while the pointer is over the canvas. */
  hover: number;
};

export type LiquidFrame = {
  time: number;
  dt: number;
  width: number;
  height: number;
  reduced: boolean;
  pointer: Pointer;
};

export type LiquidScene = {
  /** `hero`: the exhaust, widening from the nozzle. `pool`: an even ribbon, faded at both ends. */
  shape: "hero" | "pool";
  /** Fade toward the canvas's bottom edge: [margin, span] in CSS pixels. */
  fade: readonly [number, number];
  /** When the liquid pours out along the path, in seconds of on-screen time. */
  pour: { delay: number; duration: number };
  /** Fills `path` (POINTS × x, y, normalised arc position) for this frame. */
  frame(frame: LiquidFrame, path: Float32Array): void;
  /** Called when the static art takes over: no WebGL2, a slow GPU, or a lost context. */
  fallback(): void;
};

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** cubic-bezier(0.23, 1, 0.32, 1), the app's --ease-out, solved for y at progress x. */
export function easeOut(x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = [0.23, 1, 0.32, 1];
  const bez = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const dx = bez(t, x1, x2) - x;
    const slope = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * t * (1 - t) + 3 * (1 - x2) * t * t;
    if (Math.abs(slope) < 1e-6) break;
    t = Math.min(Math.max(t - dx / slope, 0), 1);
  }
  return bez(t, y1, y2);
}

/** A Catmull-Rom curve through `knots`, sampled to POINTS with normalised arc length. */
export function catmullPath(knots: ReadonlyArray<readonly [number, number]>, out: Float32Array) {
  const at = (i: number) => knots[Math.min(Math.max(i, 0), knots.length - 1)] ?? [0, 0];
  const segments = knots.length - 1;
  let arc = 0;
  for (let i = 0; i < POINTS; i++) {
    const s = (i / (POINTS - 1)) * segments;
    const k = Math.min(Math.floor(s), segments - 1);
    const u = s - k;
    const [p0, p1, p2, p3] = [at(k - 1), at(k), at(k + 1), at(k + 2)];
    for (let c = 0; c < 2; c++) {
      const [a = 0, b = 0, d = 0, e = 0] = [p0[c], p1[c], p2[c], p3[c]];
      out[i * 3 + c] =
        0.5 *
        (2 * b +
          (-a + d) * u +
          (2 * a - 5 * b + 4 * d - e) * u * u +
          (-a + 3 * b - 3 * d + e) * u ** 3);
    }
    if (i > 0)
      arc += Math.hypot(
        (out[i * 3] ?? 0) - (out[i * 3 - 3] ?? 0),
        (out[i * 3 + 1] ?? 0) - (out[i * 3 - 2] ?? 0),
      );
    out[i * 3 + 2] = arc;
  }
  for (let i = 0; i < POINTS; i++) out[i * 3 + 2] = (out[i * 3 + 2] ?? 0) / arc;
}

const VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

function compile(gl: WebGL2RenderingContext) {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VERTEX);
  const fs = shader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "position");
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

/** Runs `scene` on `canvas` until the returned cleanup is called. */
export function runLiquid(canvas: HTMLCanvasElement, scene: LiquidScene): () => void {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true });
  const program = gl && compile(gl);
  if (!gl || !program) {
    scene.fallback();
    return () => {};
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const loc = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    path: loc("uPath"),
    size: loc("uSize"),
    time: loc("uTime"),
    front: loc("uFront"),
    mouse: loc("uMouse"),
    vel: loc("uVel"),
    hover: loc("uHover"),
  };
  gl.uniform1f(loc("uScale"), SCALE);
  gl.uniform1f(loc("uPool"), scene.shape === "pool" ? 1 : 0);
  gl.uniform2f(loc("uFade"), scene.fade[0], scene.fade[1]);

  const path = new Float32Array(POINTS * 3);
  const pointer: Pointer = { x: -1e4, y: -1e4, inside: false, vx: 0, vy: 0, hover: 0 };
  const last = { x: -1e4, y: -1e4 };
  let width = 0;
  let height = 0;
  let time = 0;
  let dt = 0;

  const draw = () => {
    if (width === 0) return;
    scene.frame({ time, dt, width, height, reduced, pointer }, path);
    gl.uniform3fv(u.path, path);
    gl.uniform2f(u.size, width, height);
    gl.uniform1f(u.time, reduced ? 0 : time);
    const pour = easeOut((time - scene.pour.delay) / scene.pour.duration);
    gl.uniform1f(u.front, reduced ? 1.1 : -0.02 + 1.1 * pour);
    gl.uniform2f(u.mouse, pointer.x, pointer.y);
    gl.uniform2f(u.vel, pointer.vx, pointer.vy);
    gl.uniform1f(u.hover, pointer.hover);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const onPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.inside =
      pointer.x >= 0 && pointer.x <= rect.width && pointer.y >= 0 && pointer.y <= rect.height;
    if (last.x < -1e3) Object.assign(last, { x: pointer.x, y: pointer.y });
  };

  let frame = 0;
  let previous = 0;
  let visible = true;
  let degraded = false;
  let benchmarked = false;
  const tick = (now: number) => {
    dt = previous ? Math.min((now - previous) / 1000, 1 / 20) : 0;
    previous = now;
    time += dt;
    // Pointer velocity drags the liquid a little and settles when the pointer stops.
    const rawX = pointer.inside ? pointer.x - last.x : 0;
    const rawY = pointer.inside ? pointer.y - last.y : 0;
    Object.assign(last, { x: pointer.x, y: pointer.y });
    pointer.vx += (rawX - pointer.vx) * 0.18;
    pointer.vy += (rawY - pointer.vy) * 0.18;
    const speed = Math.hypot(pointer.vx, pointer.vy);
    if (speed > 12) {
      pointer.vx = (pointer.vx / speed) * 12;
      pointer.vy = (pointer.vy / speed) * 12;
    }
    pointer.hover += ((pointer.inside ? 1 : 0) - pointer.hover) * (1 - Math.exp(-dt * 6));
    draw();
    frame = requestAnimationFrame(tick);
  };

  // Slow-GPU guard: time three synchronous frames (readPixels waits for the GPU) once the
  // canvas has a size. A frame that doesn't fit in one 60Hz frame means static art instead.
  const tooSlow = () => {
    const pixel = new Uint8Array(4);
    const frameSync = () => {
      draw();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    };
    frameSync(); // the first draw compiles the shader; don't count it
    const begin = performance.now();
    for (let i = 0; i < 3; i++) frameSync();
    return (performance.now() - begin) / 3 > 1000 / 60;
  };
  const degrade = () => {
    degraded = true;
    stop();
    gl.clear(gl.COLOR_BUFFER_BIT);
    scene.fallback();
  };
  const start = () => {
    if (reduced || degraded || frame || !visible || document.hidden || width === 0) return;
    if (!benchmarked) {
      benchmarked = true;
      if (tooSlow()) return degrade();
    }
    previous = 0;
    frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.ceil(width / SCALE));
    canvas.height = Math.max(1, Math.ceil(height / SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (reduced) draw();
    else start(); // the canvas may only now have a size
  };

  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(canvas);
  const viewObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    if (visible) start();
    else stop();
  });
  viewObserver.observe(canvas);
  const onVisibility = () => (document.hidden ? stop() : start());
  const onLost = (event: Event) => {
    event.preventDefault();
    degrade();
  };
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  if (!reduced) addEventListener("pointermove", onPointer, { passive: true });
  resize();

  return () => {
    stop();
    sizeObserver.disconnect();
    viewObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("webglcontextlost", onLost);
    removeEventListener("pointermove", onPointer);
  };
}
