/** Lines sized like body text, shown while the editor chunk loads. */
export function NoteBodySkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-[14px] pt-1.5">
      {["92%", "100%", "84%", "40%"].map((width, index) => (
        <div key={index} className="h-3 animate-pulse rounded bg-surface-4" style={{ width }} />
      ))}
    </div>
  );
}
