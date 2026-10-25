"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ReadableDocument } from "./ReadableDocument";
import { cn } from "@avenire/ui/lib/utils";

const ChatMarkdown = dynamic(
  () => import("~/features/chat/markdown/Markdown").then((module) => module.ChatMarkdown),
  { ssr: false },
);

type Block = { readonly tag: "h" | "p" | "li" | "quote" | "pre"; readonly text: string };

const TEXT_MIME = /^text\/(plain|markdown|x-markdown)|^application\/(markdown|x-markdown)/;
const HTML_MIME = /^text\/html|^application\/xhtml/;

/** Whether the stored file is text we can show inline. */
export function isReadableText(mimeType: string | null): boolean {
  return !!mimeType && (TEXT_MIME.test(mimeType) || HTML_MIME.test(mimeType));
}

/**
 * Readable text of an HTML snapshot, parsed without running anything: headings, paragraphs,
 * list items, quotes and code, from the article (or main, or body).
 */
function htmlBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script,style,noscript,nav,header,footer,aside,form,svg,iframe")
    .forEach((node) => node.remove());
  const root = doc.querySelector("article") ?? doc.querySelector("main") ?? doc.body;
  const blocks: Block[] = [];
  root?.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,pre").forEach((node) => {
    // Text inside a list item, quote or code block belongs to that block.
    if (node.parentElement?.closest("li,blockquote,pre")) return;
    const text = node.textContent?.replace(/\s+/g, node.tagName === "PRE" ? "$&" : " ").trim();
    if (!text) return;
    const tag = /^H\d$/.test(node.tagName)
      ? "h"
      : node.tagName === "LI"
        ? "li"
        : node.tagName === "BLOCKQUOTE"
          ? "quote"
          : node.tagName === "PRE"
            ? "pre"
            : "p";
    blocks.push({ tag, text });
  });
  return blocks;
}

/** A web page, document or selection rendered as calm text, in the note typography. */
export function TextView({
  url,
  mimeType,
  compact,
  onUnavailable,
  q,
}: {
  q?: string | undefined;
  url: string;
  mimeType: string;
  compact: boolean;
  onUnavailable: () => void;
}) {
  const [content, setContent] = useState<{ markdown: string } | { blocks: Block[] } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then((text) => {
        if (HTML_MIME.test(mimeType)) {
          const blocks = htmlBlocks(text);
          if (blocks.length) setContent({ blocks });
          else onUnavailable();
        } else setContent({ markdown: text });
      })
      .catch((cause: unknown) => {
        if ((cause as Error).name !== "AbortError") onUnavailable();
      });
    return () => controller.abort();
    // onUnavailable is a stable fallback switch.
  }, [url, mimeType]);

  if (!content)
    return (
      <div aria-hidden="true" className={cn("flex flex-col gap-3.5 pt-2", compact && "px-5")}>
        {["90%", "100%", "86%", "60%", "96%", "40%"].map((width, index) => (
          <div key={index} className="h-3 animate-pulse rounded bg-surface-4" style={{ width }} />
        ))}
      </div>
    );

  return (
    <ReadableDocument q={q}>
      <article
        className={cn(
          "text-[16px] leading-[26px] md:text-[15px] md:leading-[27px]",
          compact && "px-5",
        )}
      >
        {"markdown" in content ? (
          <ChatMarkdown text={content.markdown} />
        ) : (
          <div className="flex flex-col gap-3 md:gap-4">
            {content.blocks.map((block, index) => {
              switch (block.tag) {
                case "h":
                  return (
                    <h2
                      key={index}
                      className="mt-3 border-b border-border pb-2.5 text-[18px] leading-6 font-semibold md:text-[20px]"
                    >
                      {block.text}
                    </h2>
                  );
                case "li":
                  return (
                    <p key={index} className="pl-4 -indent-3">
                      • {block.text}
                    </p>
                  );
                case "quote":
                  return (
                    <blockquote
                      key={index}
                      className="border-l-2 border-input pl-3 text-foreground-soft"
                    >
                      {block.text}
                    </blockquote>
                  );
                case "pre":
                  return (
                    <pre
                      key={index}
                      className="overflow-x-auto rounded-lg border border-border bg-surface-2 px-3.5 py-3 font-mono text-[13px] leading-5"
                    >
                      {block.text}
                    </pre>
                  );
                default:
                  return <p key={index}>{block.text}</p>;
              }
            })}
          </div>
        )}
      </article>
    </ReadableDocument>
  );
}
