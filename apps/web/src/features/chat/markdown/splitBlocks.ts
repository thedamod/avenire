/**
 * Split markdown into top-level blocks at blank lines, never inside a fenced code block or a
 * `$$` math block. Completed blocks are stable strings, so their parsed output is cached and
 * only the open tail block re-parses while a reply streams.
 */
export function splitBlocks(markdown: string): string[] {
  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  let math = false;
  const flush = () => {
    if (current.some((line) => line.trim())) blocks.push(current.join("\n"));
    current = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (fence) {
      current.push(line);
      if (trimmed.startsWith(fence) && trimmed.replace(/[`~]/g, "") === "") fence = null;
      continue;
    }
    const open = /^(`{3,}|~{3,})/.exec(trimmed);
    if (open) {
      fence = open[1]!;
      current.push(line);
      continue;
    }
    if (trimmed === "$$" || (trimmed.startsWith("$$") && !trimmed.slice(2).includes("$$"))) {
      math = !math;
      current.push(line);
      continue;
    }
    if (math) {
      current.push(line);
      if (trimmed.endsWith("$$")) math = false;
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

/** True when a fenced code block in the tail block hasn't closed yet. */
export function hasOpenFence(block: string): boolean {
  let fence: string | null = null;
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (fence) {
      if (trimmed.startsWith(fence) && trimmed.replace(/[`~]/g, "") === "") fence = null;
      continue;
    }
    const open = /^(`{3,}|~{3,})/.exec(trimmed);
    if (open) fence = open[1]!;
  }
  return fence !== null;
}
