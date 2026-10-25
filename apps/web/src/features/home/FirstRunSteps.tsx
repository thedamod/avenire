import { Kbd } from "@avenire/ui/components/kbd";
import { NOTEBOOK_COLORS } from "~/components/app";

/** Three getting-started steps next to the New notebook tile on an empty library (06 / M06). */
export function FirstRunSteps() {
  return (
    <ol className="grid min-w-0 shrink-0 grid-cols-1 divide-y divide-border rounded-[10px] border border-border max-md:w-[calc(100vw-32px-132px)] max-md:min-w-[260px] md:h-[172px] md:flex-1 md:grid-cols-3 md:divide-x md:divide-y-0">
      <Step index="01" title="Capture what's open">
        <span className="flex gap-1">
          <Kbd>⌥</Kbd>
          <Kbd>C</Kbd>
        </span>
        <span className="max-md:hidden">
          A PDF, a lecture video or a web page. It lands in Sources.
        </span>
        <span className="md:hidden">
          Press ⌥C in the Avenire app on your computer. It shows up here.
        </span>
      </Step>
      <Step index="02" title="Make a notebook per course">
        <span className="flex gap-1">
          {[NOTEBOOK_COLORS.blue, NOTEBOOK_COLORS.pink, NOTEBOOK_COLORS.yellow].map((color) => (
            <span key={color} className="h-4 w-3 rounded-[2px]" style={{ background: color }} />
          ))}
        </span>
        Or leave things unfiled. Ruth can sort them tonight.
      </Step>
      <Step index="03" title="Ask about any of it">
        <span className="inline-flex h-6 w-fit items-center rounded-full bg-ruth-tint px-2.5 text-xs font-semibold text-ruth-text">
          Ask Ruth
        </span>
        Answers cite the exact page or minute.
      </Step>
    </ol>
  );
}

function Step({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  const [badge, ...text] = Array.isArray(children) ? children : [children];
  return (
    <li className="flex flex-col gap-2 p-4 md:px-[18px] md:pt-[18px]">
      <span className="font-mono text-[11px] text-muted-foreground">{index}</span>
      {badge}
      <span className="text-[13.5px] font-semibold">{title}</span>
      <span className="text-[12.5px] leading-[18px] text-foreground-soft">{text}</span>
    </li>
  );
}
