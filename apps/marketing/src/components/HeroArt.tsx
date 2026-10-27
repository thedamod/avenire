import { useEffect, useRef, useState } from "react";
import flow from "../assets/hero-flow.webp";
import rocketImage from "../assets/hero-rocket.webp";
import fragmentSource from "../shaders/hero-flow.frag?raw";

/** Knots of the exhaust path in 1440-wide design pixels (from hero_flow.py): nozzle first. */
const KNOTS: ReadonlyArray<readonly [number, number]> = [
  [1115, 381],
  [1082, 470],
  [1034, 580],
  [964, 700],
  [820, 800],
  [560, 862],
  [300, 900],
  [120, 880],
  [10, 780],
  [-60, 600],
  [-90, 420],
  [-100, 260],
];
/** How much each knot follows the rocket when it moves: the stream bends, it doesn't slide. */
const FOLLOW = [1, 0.85, 0.6, 0.35, 0.15];
const POINTS = 96; // N in hero-flow.frag
const FRAME = 1440; // the art frame (`hero-frame` in marketing.css)
const SCALE = 2; // render at half resolution; the plume is soft and the canvas upscales

const VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** cubic-bezier(0.23, 1, 0.32, 1), the app's --ease-out, solved for y at progress x. */
function easeOut(x: number) {
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

/**
 * The path in hero CSS pixels. The nozzle end follows the rocket (centred 1440 frame,
 * pinned right below 1440); the far end always rides the viewport's left edge.
 */
function buildPath(width: number, nozzleX: number, nozzleY: number, out: Float32Array) {
  const frameLeft = width >= FRAME ? (width - FRAME) / 2 : width - FRAME;
  const knots = KNOTS.map(([x, y], i) => {
    const follow = FOLLOW[i] ?? 0;
    return [x + frameLeft * smoothstep(120, 820, x) + nozzleX * follow, y + nozzleY * follow];
  });
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

/** Arrival, pour and hover timings in seconds. */
const ARRIVE = { delay: 0.1, duration: 1.3, fade: 0.6, from: [-70, 70] as const };
const POUR = { delay: 0.2, duration: 2.6 };

/**
 * The hero's rocket and its liquid exhaust (WebGL2). Server-rendered as the static
 * plume and rocket; `.js` CSS hides both until this takes over, and it shows the static
 * plume again if WebGL2 isn't available.
 */
export default function HeroArt() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rocketRef = useRef<HTMLImageElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const rocket = rocketRef.current;
    if (!canvas || !rocket) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true });
    const program = gl && compile(gl);
    if (!gl || !program) {
      rocket.style.opacity = "1";
      setFallback(true);
      return;
    }

    // WebGL's useProgram, not a React hook.
    // oxlint-disable-next-line react/hooks
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const loc = (name: string) => gl.getUniformLocation(program, name);
    const u = {
      path: loc("uPath"),
      size: loc("uSize"),
      scale: loc("uScale"),
      time: loc("uTime"),
      front: loc("uFront"),
      mouse: loc("uMouse"),
      vel: loc("uVel"),
      hover: loc("uHover"),
    };
    gl.uniform1f(u.scale, SCALE);

    const path = new Float32Array(POINTS * 3);
    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.ceil(width / SCALE));
      canvas.height = Math.max(1, Math.ceil(height / SCALE));
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (reduced) draw();
      else start(); // the canvas may only now have a size (it's hidden below lg)
    };

    // Pointer state, eased in the frame loop.
    const pointer = { x: -1e4, y: -1e4, inside: false };
    const last = { x: -1e4, y: -1e4 };
    const vel = { x: 0, y: 0 };
    const tilt = { x: 0, y: 0, vx: 0, vy: 0 };
    let hover = 0;
    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.inside = pointer.y >= 0 && pointer.y <= rect.height;
      if (last.x < -1e3) Object.assign(last, { x: pointer.x, y: pointer.y });
    };

    let time = 0;
    function draw() {
      if (!gl || width === 0) return;
      const arrive = reduced ? 1 : easeOut((time - ARRIVE.delay) / ARRIVE.duration);
      const bob = reduced ? 0 : smoothstep(1, 2.2, time);
      const nozzleX = (1 - arrive) * ARRIVE.from[0] + Math.sin(time * 0.7) * 2 * bob + tilt.x;
      const nozzleY = (1 - arrive) * ARRIVE.from[1] + Math.sin(time * 1.15) * 5 * bob + tilt.y;
      if (rocket) {
        rocket.style.transform = `translate3d(${nozzleX}px, ${nozzleY}px, 0)`;
        rocket.style.opacity = String(
          reduced ? 1 : smoothstep(ARRIVE.delay, ARRIVE.delay + ARRIVE.fade, time),
        );
      }
      buildPath(width, nozzleX, nozzleY, path);
      gl.uniform3fv(u.path, path);
      gl.uniform2f(u.size, width, height);
      gl.uniform1f(u.time, reduced ? 0 : time);
      gl.uniform1f(
        u.front,
        reduced ? 1.1 : -0.02 + 1.1 * easeOut((time - POUR.delay) / POUR.duration),
      );
      gl.uniform2f(u.mouse, pointer.x, pointer.y);
      gl.uniform2f(u.vel, vel.x, vel.y);
      gl.uniform1f(u.hover, hover);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    let frame = 0;
    let previous = 0;
    let visible = true;
    let degraded = false;
    let benchmarked = false;
    const tick = (now: number) => {
      const dt = previous ? Math.min((now - previous) / 1000, 1 / 20) : 0;
      previous = now;
      time += dt;

      // Pointer velocity drags the liquid and settles when the pointer stops.
      const rawX = pointer.inside ? pointer.x - last.x : 0;
      const rawY = pointer.inside ? pointer.y - last.y : 0;
      Object.assign(last, { x: pointer.x, y: pointer.y });
      vel.x += (rawX - vel.x) * 0.18;
      vel.y += (rawY - vel.y) * 0.18;
      const speed = Math.hypot(vel.x, vel.y);
      if (speed > 12) Object.assign(vel, { x: (vel.x / speed) * 12, y: (vel.y / speed) * 12 });
      hover += ((pointer.inside ? 1 : 0) - hover) * (1 - Math.exp(-dt * 6));

      // The rocket leans a few pixels toward the pointer on a spring.
      const targetX = pointer.inside && width ? (pointer.x / width - 0.5) * 14 : 0;
      const targetY = pointer.inside && height ? (pointer.y / height - 0.5) * 10 : 0;
      tilt.vx = (tilt.vx + (targetX - tilt.x) * 120 * dt) * Math.exp(-14 * dt);
      tilt.vy = (tilt.vy + (targetY - tilt.y) * 120 * dt) * Math.exp(-14 * dt);
      tilt.x += tilt.vx * dt;
      tilt.y += tilt.vy * dt;

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
      frameSync(); // first draw compiles the shader; don't count it
      const begin = performance.now();
      for (let i = 0; i < 3; i++) frameSync();
      return (performance.now() - begin) / 3 > 1000 / 60;
    };
    const degrade = () => {
      degraded = true;
      gl.clear(gl.COLOR_BUFFER_BIT);
      rocket.style.transform = "";
      rocket.style.opacity = "1";
      setFallback(true);
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
      stop();
      setFallback(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onLost);
    if (!reduced) addEventListener("pointermove", onPointer, { passive: true });
    resize();
    start();

    return () => {
      stop();
      sizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
      <img
        src={flow.src}
        alt=""
        width={flow.width}
        height={flow.height}
        data-hero-fallback=""
        data-visible={fallback ? "" : undefined}
        className="absolute inset-0 size-full object-cover object-top"
      />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      <div className="hero-frame">
        <img
          ref={rocketRef}
          src={rocketImage.src}
          alt=""
          width={rocketImage.width}
          height={rocketImage.height}
          data-hero-rocket=""
          className="absolute top-15 right-3.5 w-150 will-change-transform"
        />
      </div>
    </div>
  );
}
