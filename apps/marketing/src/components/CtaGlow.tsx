import { useEffect, useRef, useState } from "react";
import glow from "../assets/cta-glow.webp";
import { catmullPath, runLiquid } from "../lib/liquid.ts";

/**
 * The final CTA's glow: the hero's liquid again, as a low arc of light under the email
 * field, like a horizon at night. It pours in from the right the first time the section
 * is on screen. The crest sits below the form so it never runs behind the headline.
 */
export default function CtaGlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const knots: Array<[number, number]> = [];
    return runLiquid(canvas, {
      shape: "pool",
      fade: [0, 140],
      pour: { delay: 0.15, duration: 2.4 },
      frame({ width: w, height: h }, path) {
        knots.splice(
          0,
          knots.length,
          [w + 120, h + 64],
          [w * 0.8, h + 5],
          [w * 0.5, h - 7],
          [w * 0.2, h + 5],
          [-120, h + 64],
        );
        catmullPath(knots, path);
      },
      fallback: () => setFallback(true),
    });
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <img
        src={glow.src}
        alt=""
        width={glow.width}
        height={glow.height}
        loading="lazy"
        data-liquid-fallback=""
        data-visible={fallback ? "" : undefined}
        className="absolute inset-0 size-full object-cover object-bottom"
      />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
