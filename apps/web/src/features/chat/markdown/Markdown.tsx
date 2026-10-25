"use client";

import "katex/dist/katex.min.css";
import "./markdown.css";

import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { Check, Copy } from "lucide-react";
import { cn } from "@avenire/ui/lib/utils";

import {
  citationHref,
  citationLabel,
  linkCitations,
  type CitationMap,
} from "../logic/citations.ts";
import { hasOpenFence, splitBlocks } from "./splitBlocks.ts";

const EMPTY: CitationMap = new Map();
/** The thread's chunk → source map; chips read it at render time so cached blocks stay valid. */
export const CitationContext = createContext<CitationMap>(EMPTY);

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex);

/** The bits of a hast node this file reads. */
interface HastNode {
  readonly type: string;
  readonly value?: string;
  readonly tagName?: string;
  readonly properties?: Record<string, unknown>;
  readonly children?: readonly HastNode[];
}

function textOf(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return node.children?.map(textOf).join("") ?? "";
}

const SAFE_HREF = /^(https?:|mailto:|\/|#|cite:)/i;

const components: Components = {
  a: ({ href, children }) => {
    const url = typeof href === "string" ? href : "";
    if (url.startsWith("cite:"))
      return <CitationChip chunkId={url.slice(5)}>{children}</CitationChip>;
    if (!SAFE_HREF.test(url)) return <span>{children}</span>;
    const external = /^https?:/i.test(url);
    return (
      <a href={url} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
        {children}
      </a>
    );
  },
  img: ({ src, alt }) =>
    typeof src === "string" && /^https?:/i.test(src) ? (
      <img src={src} alt={typeof alt === "string" ? alt : ""} loading="lazy" />
    ) : null,
  pre: ({ node }) => {
    const code = (node as HastNode | undefined)?.children?.find(
      (child) => child.type === "element" && child.tagName === "code",
    );
    const className = code?.properties?.className;
    const classes = Array.isArray(className) ? className.map(String) : [];
    const lang = classes.find((name) => name.startsWith("language-"))?.slice(9) ?? "text";
    return <CodeBlock code={code ? textOf(code).replace(/\n$/, "") : ""} lang={lang} />;
  },
  table: ({ children }) => (
    <div className="ruth-md-table">
      <table>{children}</table>
    </div>
  ),
};

function render(source: string): ReactNode {
  const tree = processor.runSync(processor.parse(source));
  return toJsxRuntime(tree, { Fragment, jsx, jsxs, components, passNode: true });
}

/** Parsed blocks by source. Remounting a virtualised row reuses the React tree, no re-parse. */
const blockCache = new Map<string, ReactNode>();
const BLOCK_CACHE_LIMIT = 600;

function renderCached(source: string): ReactNode {
  const hit = blockCache.get(source);
  if (hit !== undefined) {
    blockCache.delete(source);
    blockCache.set(source, hit);
    return hit;
  }
  const node = render(source);
  blockCache.set(source, node);
  if (blockCache.size > BLOCK_CACHE_LIMIT) blockCache.delete(blockCache.keys().next().value!);
  return node;
}

const MarkdownBlock = memo(function MarkdownBlock({
  source,
  open,
}: {
  readonly source: string;
  /** The streaming tail: parsed fresh each update and never cached. */
  readonly open: boolean;
}) {
  if (open) {
    // An unclosed fence would swallow the rest; render it as plain code until it closes.
    if (hasOpenFence(source)) {
      const fenceAt = source.search(/(^|\n)\s*(`{3,}|~{3,})/);
      const before = source.slice(0, fenceAt);
      const code = source.slice(fenceAt).replace(/^\s*(`{3,}|~{3,})[^\n]*\n?/, "");
      return (
        <>
          {before.trim() ? render(before) : null}
          <CodeBlock code={code} lang="text" streaming />
        </>
      );
    }
    return <>{render(source)}</>;
  }
  return <>{renderCached(source)}</>;
});

/**
 * Ruth's prose: GFM, KaTeX math, highlighted code, citation chips. Split into blocks so a
 * streaming reply only re-parses its last block.
 */
export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  streaming = false,
  className,
}: {
  readonly text: string;
  readonly streaming?: boolean;
  readonly className?: string;
}) {
  const citations = useContext(CitationContext);
  const blocks = useMemo(() => splitBlocks(linkCitations(text, citations)), [text, citations]);
  return (
    <div className={cn("ruth-md", className)}>
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} source={block} open={streaming && index === blocks.length - 1} />
      ))}
    </div>
  );
});

function CitationChip({
  chunkId,
  children,
}: {
  readonly chunkId: string;
  readonly children: ReactNode;
}) {
  const citation = useContext(CitationContext).get(chunkId);
  if (!citation) return <span className="ruth-cite">{children}</span>;
  return (
    <a className="ruth-cite" href={citationHref(citation)} title={citation.title}>
      {citationLabel(citation)}
    </a>
  );
}

const highlighted = new Map<string, string>();

async function highlight(code: string, lang: string): Promise<string> {
  const key = `${lang}\u0000${code}`;
  const hit = highlighted.get(key);
  if (hit) return hit;
  const { codeToHtml } = await import("shiki");
  let html: string;
  try {
    html = await codeToHtml(code, { lang, theme: "github-dark-default" });
  } catch {
    html = await codeToHtml(code, { lang: "text", theme: "github-dark-default" });
  }
  highlighted.set(key, html);
  return html;
}

function CodeBlock({
  code,
  lang,
  streaming = false,
}: {
  readonly code: string;
  readonly lang: string;
  readonly streaming?: boolean;
}) {
  const [html, setHtml] = useState(() => highlighted.get(`${lang}\u0000${code}`) ?? null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (streaming || lang === "text") return;
    let live = true;
    void highlight(code, lang).then((value) => {
      if (live) setHtml(value);
    });
    return () => {
      live = false;
    };
  }, [code, lang, streaming]);
  return (
    <div className="ruth-code group/code">
      <div className="ruth-code-bar">
        <span>{lang === "text" ? "" : lang}</span>
        {streaming ? null : (
          <button
            type="button"
            aria-label="Copy code"
            onClick={() => {
              void navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        )}
      </div>
      {html ? (
        // Shiki escapes the source; the markup is its own spans.
        <div className="ruth-code-body" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="ruth-code-body">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
