import { useEffect, useRef, useState } from "react";
import flow from "../assets/hero-flow.webp";
import rocketImage from "../assets/hero-rocket.webp";
import { catmullPath, easeOut, runLiquid, smoothstep } from "../lib/liquid.ts";

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
const FRAME = 1440; // the art frame (`hero-frame` in marketing.css)
/** The rocket's arrival along its heading, in seconds and CSS pixels. */
const ARRIVE = { delay: 0.1, duration: 1.3, fade: 0.6, from: [-70, 70] as const };

/**
 * The hero's rocket and its liquid exhaust. Server-rendered as the static plume and
 * rocket; `.js` CSS hides both until this takes over, and the static plume returns if
 * the liquid can't run.
 */
export default function HeroArt() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rocketRef = useRef<HTMLImageElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const rocket = rocketRef.current;
    if (!canvas || !rocket) return;
    // The rocket leans a few pixels toward the pointer on a spring.
    const tilt = { x: 0, y: 0, vx: 0, vy: 0 };
    const knots: Array<[number, number]> = KNOTS.map(([x, y]) => [x, y]);

    return runLiquid(canvas, {
      shape: "hero",
      fade: [60, 260],
      pour: { delay: 0.2, duration: 2.6 },
      frame({ time, dt, width, height, reduced, pointer }, path) {
        const targetX = pointer.inside ? (pointer.x / width - 0.5) * 14 : 0;
        const targetY = pointer.inside ? (pointer.y / height - 0.5) * 10 : 0;
        tilt.vx = (tilt.vx + (targetX - tilt.x) * 120 * dt) * Math.exp(-14 * dt);
        tilt.vy = (tilt.vy + (targetY - tilt.y) * 120 * dt) * Math.exp(-14 * dt);
        tilt.x += tilt.vx * dt;
        tilt.y += tilt.vy * dt;

        const arrive = reduced ? 1 : easeOut((time - ARRIVE.delay) / ARRIVE.duration);
        const bob = reduced ? 0 : smoothstep(1, 2.2, time);
        const nozzleX = (1 - arrive) * ARRIVE.from[0] + Math.sin(time * 0.7) * 2 * bob + tilt.x;
        const nozzleY = (1 - arrive) * ARRIVE.from[1] + Math.sin(time * 1.15) * 5 * bob + tilt.y;
        rocket.style.transform = `translate3d(${nozzleX}px, ${nozzleY}px, 0)`;
        rocket.style.opacity = String(
          reduced ? 1 : smoothstep(ARRIVE.delay, ARRIVE.delay + ARRIVE.fade, time),
        );

        // The nozzle end follows the rocket (centred 1440 frame, pinned right below 1440);
        // the far end always rides the viewport's left edge.
        const frameLeft = width >= FRAME ? (width - FRAME) / 2 : width - FRAME;
        KNOTS.forEach(([x, y], i) => {
          const follow = FOLLOW[i] ?? 0;
          knots[i] = [
            x + frameLeft * smoothstep(120, 820, x) + nozzleX * follow,
            y + nozzleY * follow,
          ];
        });
        catmullPath(knots, path);
      },
      fallback() {
        rocket.style.transform = "";
        rocket.style.opacity = "1";
        setFallback(true);
      },
    });
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
      <img
        src={flow.src}
        alt=""
        width={flow.width}
        height={flow.height}
        data-liquid-fallback=""
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
