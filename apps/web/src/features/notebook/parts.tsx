export { EmptyLine } from "~/features/home/NotesTab";
export { ErrorRow } from "~/features/home/states";

/** "Notes 9", "Sources 22": 13.5/500 with a muted count (15/600 on phone), actions on the right. */
export function SectionHeading({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count: number | undefined;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <h2 id={id} className="flex items-baseline gap-1.5">
        <span className="text-[15px] leading-5 font-semibold md:text-[13.5px] md:font-medium">
          {label}
        </span>
        {count !== undefined ? (
          <span className="text-[13px] text-muted-foreground tabular-nums md:text-xs">{count}</span>
        ) : null}
      </h2>
      {children}
    </div>
  );
}
