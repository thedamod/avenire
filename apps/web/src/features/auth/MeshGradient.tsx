"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@avenire/ui/lib/utils";

/** The brand mesh (v1 marketing shader). Colours are hex so no DOM round-trip is needed to parse them. */
export const MESH_COLORS = ["#06111f", "#ff4f7b", "#4f8cff", "#ffd166", "#20e3b2"] as const;

const VERTEX = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT = `
  precision mediump float;
  varying vec2 v_uv;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform vec3 u_colors[5];

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 uv = v_uv;
    uv.x *= u_resolution.x / u_resolution.y;

    float t = u_time;
    vec2 p0 = 0.52 + 0.35 * vec2(sin(0.7 * t), cos(0.9 * t));
    vec2 p1 = 0.48 + 0.35 * vec2(sin(0.6 * t + 1.7), cos(0.8 * t + 2.3));
    vec2 p2 = 0.50 + 0.38 * vec2(sin(0.9 * t + 0.7), cos(0.7 * t + 1.7));
    vec2 p3 = 0.46 + 0.33 * vec2(sin(0.5 * t + 2.9), cos(1.1 * t + 0.2));
    vec2 p4 = 0.50 + 0.30 * vec2(sin(0.8 * t - 1.4), cos(0.6 * t - 0.9));

    vec2 m = u_mouse * 0.12;
    p0 += m; p1 -= m; p2 += m * 0.5; p3 -= m * 0.5; p4 += m * 0.3;

    float w0 = smoothstep(0.85, 0.05, distance(uv, p0));
    float w1 = smoothstep(0.85, 0.05, distance(uv, p1));
    float w2 = smoothstep(0.90, 0.05, distance(uv, p2));
    float w3 = smoothstep(0.95, 0.05, distance(uv, p3));
    float w4 = smoothstep(0.90, 0.05, distance(uv, p4));

    vec3 col = u_colors[0] * w0 + u_colors[1] * w1 + u_colors[2] * w2 + u_colors[3] * w3 + u_colors[4] * w4;
    col /= w0 + w1 + w2 + w3 + w4 + 1e-3;

    col += (hash(uv * u_resolution * 0.5 + u_time) - 0.5) * 0.02;
    col *= smoothstep(1.1, 0.35, length(uv - vec2(0.5)));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const hexToRgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
};

/** CSS stand-in shown until the first frame, without WebGL, and as the reduced-motion still. */
const STATIC_MESH = `radial-gradient(60% 55% at 22% 30%, ${MESH_COLORS[1]}cc, transparent 70%),
  radial-gradient(55% 60% at 78% 38%, ${MESH_COLORS[2]}cc, transparent 70%),
  radial-gradient(50% 50% at 62% 80%, ${MESH_COLORS[3]}99, transparent 70%),
  radial-gradient(55% 55% at 25% 82%, ${MESH_COLORS[4]}99, transparent 70%),
  ${MESH_COLORS[0]}`;

/**
 * Animated mesh gradient. Kept cheap: renders at a fraction of device pixels (the image is
 * a soft blur, so resolution is invisible), stops when the tab is hidden or the canvas is
 * offscreen, and draws a single still frame under prefers-reduced-motion.
 */
export function MeshGradient({
  className,
  speed = 0.5,
  resolutionScale = 0.5,
  paused = false,
  initialTime = 7,
}: {
  className?: string;
  speed?: number;
  resolutionScale?: number;
  paused?: boolean;
  initialTime?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { alpha: false, antialias: false });
    if (!canvas || !gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    // eslint-disable-next-line react/hooks -- WebGL API, not a React hook.
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    gl.uniform3fv(
      gl.getUniformLocation(program, "u_colors"),
      new Float32Array(MESH_COLORS.flatMap(hexToRgb)),
    );

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const target = { x: 0, y: 0 };
    const mouse = { x: 0, y: 0 };
    let visible = true;
    let frame = 0;
    // Time only advances while frames are drawn, so resuming does not jump.
    let elapsed = initialTime;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * resolutionScale;
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uResolution, width, height);
    };

    const draw = () => {
      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const tick = (now: number) => {
      elapsed += (Math.min(now - last, 64) / 1000) * speed;
      last = now;
      // Ease toward the pointer instead of snapping to it.
      mouse.x += (target.x - mouse.x) * 0.04;
      mouse.y += (target.y - mouse.y) * 0.04;
      draw();
      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      resize();
      if (paused || reduceMotion.matches || !visible || document.hidden) {
        draw();
        return;
      }
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      target.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      target.y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      sync();
    });
    observer.observe(canvas);
    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (frame === 0) draw();
    });
    resizeObserver.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    reduceMotion.addEventListener("change", sync);
    if (finePointer) window.addEventListener("pointermove", onPointer, { passive: true });

    sync();
    setReady(true);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduceMotion.removeEventListener("change", sync);
      window.removeEventListener("pointermove", onPointer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [speed, resolutionScale, paused, initialTime]);

  return (
    <div
      aria-hidden
      className={cn("overflow-hidden", className)}
      style={{ background: STATIC_MESH }}
    >
      <canvas
        ref={canvasRef}
        className="auth-mesh-canvas block size-full"
        data-ready={ready || undefined}
      />
    </div>
  );
}
