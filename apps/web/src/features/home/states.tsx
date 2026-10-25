import { Skeleton } from "@avenire/ui/components/skeleton";
import { Button } from "@avenire/ui/components/button";
import { errorMessage } from "~/lib/rpc";

/** Rows sized like the real ones so nothing jumps when data lands. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="-mx-4 divide-y divide-border md:mx-0 md:rounded-[10px] md:border md:border-border">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-[62px] items-center gap-3 px-4 md:h-[54px] md:gap-4">
          <Skeleton className="size-[34px] md:size-4" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ErrorRow({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-border px-4 py-3 text-[13px]">
      <span className="min-w-0 flex-1 text-foreground-soft">
        Couldn't load this. <span className="text-muted-foreground">{errorMessage(error)}</span>
      </span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
