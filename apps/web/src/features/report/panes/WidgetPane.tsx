"use client";

import { useContext } from "react";
import { WidgetFrame } from "@avenire/ui/widget-frame";

import { FigureFrame, TimelineContext } from "~/features/chat/timeline/TimelineRows";
import { clockTime } from "../logic/report.ts";
import { useReport } from "../ReportContext.ts";

/** A widget Ruth built overnight, at the pane's full width (16c / M16). */
export default function WidgetPane({
  url,
  title,
  createdAt,
}: {
  readonly url: string;
  readonly title: string;
  readonly figure: number;
  readonly createdAt: string;
}) {
  const { colorScheme, themeTokens } = useContext(TimelineContext);
  const { askRuth } = useReport();
  return (
    <div className="flex flex-col gap-4 px-4 pt-3 pb-10 md:px-7 md:pt-8">
      <FigureFrame title={title}>
        <WidgetFrame
          url={url}
          title={title}
          colorScheme={colorScheme}
          tokens={themeTokens}
          initialHeight={480}
        />
      </FigureFrame>
      <div className="flex items-start gap-4 text-[13px] leading-[18px]">
        <p className="min-w-0 flex-1 text-muted-foreground">
          Built by Ava overnight{createdAt ? ` · ${clockTime(createdAt)}` : ""} · runs on this
          device
        </p>
        <button
          type="button"
          onClick={() => askRuth(`Walk me through the “${title}” figure, part by part.`)}
          className="shrink-0 text-ruth-text transition-colors hover:text-foreground"
        >
          Ask Ava about it
        </button>
      </div>
    </div>
  );
}
