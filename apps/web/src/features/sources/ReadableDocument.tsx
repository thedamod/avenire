"use client";
import { type ReactNode, type RefObject, useEffect, useId, useRef } from "react";
import { cn } from "@avenire/ui/lib/utils";

/** The cited passage, then shorter prefixes: long quotes rarely survive as one text node. */
function terms(q: string) {
  const clean = q.replace(/\s+/g, " ").trim().toLowerCase();
  if (!clean) return [];
  const words = clean.split(" ");
  return [
    ...new Set([
      clean,
      clean.slice(0, 180).trim(),
      words.slice(0, 12).join(" "),
      words.slice(0, 6).join(" "),
    ]),
  ];
}

export function ReadableDocument({
  children,
  q = "",
  scrollRoot,
  className,
  bare = false,
}: {
  children: ReactNode;
  /** Highlight only: no reading typography, for renderers that lay out their own pages. */
  bare?: boolean;
  q?: string | undefined;
  /** Scroll this container to the first highlight once per passage. */
  scrollRoot?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const name = `source-find-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let timer: ReturnType<typeof setTimeout>;
    let scrolled = false;
    function find(term: string) {
      const hits: Range[] = [];
      const walker = document.createTreeWalker(node!, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode as Text;
        if (text.parentElement?.closest("script,style,button")) continue;
        const value = text.data.replace(/\s/g, " ").toLowerCase();
        let from = value.indexOf(term);
        while (from >= 0) {
          const range = document.createRange();
          range.setStart(text, from);
          range.setEnd(text, from + term.length);
          hits.push(range);
          from = value.indexOf(term, from + term.length);
        }
      }
      return hits;
    }
    function update() {
      if (!node) return;
      let hits: Range[] = [];
      for (const term of terms(q)) {
        hits = find(term);
        if (hits.length) break;
      }
      // Paint ranges without changing DOM nodes owned by React or the markdown renderer.
      if (typeof Highlight !== "undefined" && CSS.highlights)
        CSS.highlights.set(name, new Highlight(...hits));
      const container = scrollRoot?.current;
      if (!scrolled && container && hits[0]) {
        scrolled = true;
        const at = hits[0].getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTop += at - container.clientHeight / 3;
      }
    }
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(update, 100);
    });
    update();
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      CSS.highlights?.delete(name);
    };
  }, [q, name, scrollRoot]);
  return (
    <div>
      <style>{`::highlight(${name}) { background: color-mix(in srgb, var(--ruth) 30%, transparent); color: inherit; }`}</style>
      <div
        ref={root}
        className={cn(
          !bare &&
            "mx-auto max-w-[68ch] px-4 py-6 text-[15px] leading-7 [&_h1]:my-5 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:my-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:my-3 [&_h3]:font-semibold [&_p]:my-3 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:px-2 [&_img]:max-w-full",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
