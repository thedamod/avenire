"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useIsMobile } from "~/lib/responsive";
import { NIGHT_SKY_IMAGE } from "~/components/app/NightSky";

const Lanyard = dynamic(() => import("~/components/lanyard/Lanyard"), { ssr: false });

interface PreviewProps {
  title: string;
  instructions: string;
  sources: string[];
  outputs: readonly string[];
  repeat: string;
  readyBy: string;
  email: boolean;
}

/** Paint real text into the badge texture; updating it leaves the running simulation intact. */
export function TaskLanyardPreview(props: PreviewProps) {
  const content = useDeferredValue(props);
  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  const root = useRef<HTMLDivElement>(null);
  const [frontImage, setFrontImage] = useState<string>();
  const [cardColor, setCardColor] = useState("#161616");
  const [strapColor, setStrapColor] = useState("#2e3b5e");

  useEffect(() => {
    if (!root.current || !resolvedTheme) return;
    const colors = getComputedStyle(root.current);
    const token = (name: string) => colors.getPropertyValue(name).trim();
    const accent = token("--ruth");
    const surface = token("--surface-2");
    setCardColor(surface);
    let cancelled = false;
    setStrapColor(token("--ruth-line"));
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 2880;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(2, 2);
    const sans = colors.fontFamily;
    const mono = token("--font-mono");
    const line = (text: string, x: number, y: number, maxWidth: number) => {
      let fitted = text;
      while (ctx.measureText(fitted).width > maxWidth && fitted.length)
        fitted = fitted.slice(0, -1);
      ctx.fillText(fitted === text ? text : `${fitted.trimEnd()}…`, x, y);
    };
    const paint = (sky: HTMLImageElement) => {
      if (cancelled) return;
      ctx.fillStyle = surface;
      ctx.fillRect(0, 0, 1024, 1440);
      const cropWidth = sky.height * (1024 / 760);
      ctx.drawImage(sky, (sky.width - cropWidth) / 2, 0, cropWidth, sky.height, 0, 0, 1024, 760);
      ctx.strokeStyle = "#c8d7ff";
      ctx.lineWidth = 2.5;
      // A quiet orbital study figure, on the same Ruth colors as the form.
      ctx.save();
      ctx.translate(512, 385);
      ctx.rotate(-0.35);
      for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
        ctx.save();
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, 166, 62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#c8d7ff";
      for (const [x, y] of [
        [130, 145],
        [335, 190],
        [810, 230],
        [860, 590],
        [205, 630],
      ]) {
        ctx.beginPath();
        ctx.arc(x!, y!, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = `40px ${mono}`;
      ctx.fillText("☾", 896, 120);
      ctx.fillStyle = token("--foreground");
      ctx.font = `500 60px ${sans}`;
      const title = content.title.trim() || "Your overnight task";
      // Two lines leave enough room for a long task title without shrinking the card.
      const words = title.split(/\s+/);
      let first = "";
      while (words.length && ctx.measureText(`${first} ${words[0]}`).width < 900) {
        first = `${first} ${words.shift()}`.trim();
      }
      line(first || words.shift() || "", 60, 860, 900);
      if (words.length) line(words.join(" "), 60, 928, 900);
      ctx.fillStyle = token("--ruth-text");
      ctx.font = `40px ${mono}`;
      line(`${content.repeat} · ${content.readyBy}`, 60, 1000, 900);
      ctx.strokeStyle = token("--border");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 1040);
      ctx.lineTo(1024, 1040);
      ctx.stroke();
      ctx.font = `38px ${mono}`;
      const rows = [
        ["reads", content.sources.join(" + ") || "No sources selected"],
        ["makes", content.outputs.join(", ").toLowerCase() || "From your instructions"],
        ["changes", "asks first"],
        ["delivery", content.email ? "home + email" : "morning report"],
      ];
      rows.forEach(([label, value], i) => {
        ctx.fillStyle = token("--muted-foreground");
        ctx.textAlign = "left";
        ctx.fillText(label!, 60, 1130 + i * 66);
        ctx.fillStyle = token("--foreground");
        ctx.textAlign = "right";
        line(value!, 964, 1130 + i * 66, 690);
      });
      ctx.textAlign = "left";
      ctx.fillStyle = token("--muted-foreground");
      ctx.font = `34px ${sans}`;
      line(
        content.instructions.trim() || "Set the brief. Ava takes the night shift.",
        60,
        1410,
        900,
      );
      setFrontImage(canvas.toDataURL("image/png"));
    };
    const sky = new Image();
    sky.addEventListener("load", () => paint(sky), { once: true });
    sky.src = NIGHT_SKY_IMAGE;
    return () => {
      cancelled = true;
    };
  }, [content, resolvedTheme]);

  return (
    <div
      ref={root}
      className="relative h-[340px] min-w-0 overflow-hidden bg-background/40 md:absolute md:inset-0 md:h-full"
    >
      {frontImage ? (
        <Lanyard
          frontImage={frontImage}
          cardColor={cardColor}
          strapColor={strapColor}
          size={isMobile ? 0.75 : 0.52}
          strapLength={0.12}
          strapWidth={0.55}
          finish="matte"
          metal="graphite"
          breeze={0.08}
          damping={0.75}
          intro
        />
      ) : null}
      <dl className="sr-only" aria-label="Task preview">
        <dt>Task</dt>
        <dd>{props.title || "Your overnight task"}</dd>
        <dt>Instructions</dt>
        <dd>{props.instructions}</dd>
        <dt>Schedule</dt>
        <dd>
          {props.repeat}, ready by {props.readyBy}
        </dd>
        <dt>Reads</dt>
        <dd>{props.sources.join(", ") || "No sources selected"}</dd>
        <dt>Makes</dt>
        <dd>{props.outputs.join(", ") || "From your instructions"}</dd>
        <dt>Changes</dt>
        <dd>Asks first</dd>
      </dl>
    </div>
  );
}
