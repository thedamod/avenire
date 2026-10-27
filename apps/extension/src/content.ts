import type { CapturePosition, TextQuote } from "@avenire/contracts";

export function selectionQuote(
  selection: Selection | null,
  body: HTMLElement | null,
): TextQuote | undefined {
  if (!selection?.rangeCount || selection.isCollapsed || !body) return undefined;
  const range = selection.getRangeAt(0);
  const parent =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  if (parent?.closest("input, textarea, [contenteditable=true]")) return undefined;
  const text = selection.toString();
  const exact = text.slice(0, 500);
  if (!exact.trim()) return undefined;
  const before = range.cloneRange();
  before.selectNodeContents(body);
  before.setEnd(range.startContainer, range.startOffset);
  const after = range.cloneRange();
  after.selectNodeContents(body);
  after.setStart(range.endContainer, range.endOffset);
  return {
    exact,
    prefix: before.toString().slice(-32),
    suffix: (text.slice(500) + after.toString()).slice(0, 32),
  };
}

export function restorePosition(
  position: CapturePosition,
  doc: Document = document,
  win: Window = window,
): void {
  let matched = false;
  const quote = position.textQuote;
  if (quote && doc.body) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest("script, style, noscript, [hidden], input, textarea"))
          return NodeFilter.FILTER_REJECT;
        for (let current: Element | null = parent; current; current = current.parentElement) {
          const style = win.getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
            return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes: { node: Node; start: number; end: number }[] = [];
    let text = "";
    while (walker.nextNode() && text.length < 2_000_000) {
      const node = walker.currentNode;
      const start = text.length;
      text += node.textContent ?? "";
      nodes.push({ node, start, end: text.length });
    }
    let offset = text.indexOf(quote.exact);
    while (offset >= 0) {
      const prefix =
        !quote.prefix ||
        text.slice(Math.max(0, offset - quote.prefix.length), offset) === quote.prefix;
      const suffix =
        !quote.suffix ||
        text.slice(
          offset + quote.exact.length,
          offset + quote.exact.length + quote.suffix.length,
        ) === quote.suffix;
      if (prefix && suffix) break;
      offset = text.indexOf(quote.exact, offset + 1);
    }
    const start = nodes.find((entry) => offset >= entry.start && offset < entry.end);
    const endOffset = offset + quote.exact.length;
    const end = nodes.find((entry) => endOffset > entry.start && endOffset <= entry.end);
    if (offset >= 0 && start && end) {
      const range = doc.createRange();
      range.setStart(start.node, offset - start.start);
      range.setEnd(end.node, endOffset - end.start);
      const selection = win.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      start.node.parentElement?.scrollIntoView({ block: "center" });
      matched = true;
    }
  }
  if (!matched && position.scrollPct !== undefined)
    win.scrollTo({
      top:
        (Math.max(0, doc.documentElement.scrollHeight - win.innerHeight) *
          Math.max(0, Math.min(100, position.scrollPct))) /
        100,
    });
  if (position.mediaSec !== undefined) {
    const media = doc.querySelector<HTMLMediaElement>("video, audio");
    if (media) {
      const seek = () => {
        media.currentTime = Math.max(0, position.mediaSec!);
      };
      if (media.readyState >= 1) seek();
      else media.addEventListener("loadedmetadata", seek, { once: true });
    }
  }
}

const contentGlobal = globalThis as typeof globalThis & { __avenireCaptureContent?: boolean };
if (
  typeof chrome !== "undefined" &&
  chrome.runtime?.onMessage &&
  !contentGlobal.__avenireCaptureContent
) {
  contentGlobal.__avenireCaptureContent = true;
  let dwellMs = 0;
  let scrollDepthPct = 0;
  let lastTick = Date.now();
  let visible = document.visibilityState === "visible";
  let url = location.href;
  const tick = () => {
    const now = Date.now();
    if (location.href !== url) {
      url = location.href;
      dwellMs = 0;
      scrollDepthPct = 0;
      lastTick = now;
    }
    if (visible) dwellMs += Math.min(2000, now - lastTick);
    lastTick = now;
    visible = document.visibilityState === "visible";
    const height = document.documentElement.scrollHeight - innerHeight;
    const scrollPct = height > 0 ? Math.max(0, Math.min(100, (scrollY / height) * 100)) : 0;
    if (visible) scrollDepthPct = Math.max(scrollDepthPct, scrollPct);
    return scrollPct;
  };
  document.addEventListener("visibilitychange", tick);
  setInterval(tick, 1000);
  chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
    if (
      sender.id !== chrome.runtime.id ||
      !message ||
      typeof message !== "object" ||
      !("type" in message)
    )
      return;
    if (message.type === "avenire-poll") {
      if (!("expectedUrl" in message) || message.expectedUrl !== location.href) return;
      const scrollPct = tick();
      const media = [...document.querySelectorAll<HTMLMediaElement>("video, audio")];
      const playing = media.find((entry) => !entry.paused && !entry.ended);
      const readSelection = "readSelection" in message && message.readSelection === true;
      const selection = readSelection
        ? selectionQuote(window.getSelection(), document.body)
        : undefined;
      reply({
        engagement: { dwellMs, scrollDepthPct, mediaPlaying: !!playing },
        position: {
          scrollPct,
          ...(selection ? { textQuote: selection } : {}),
          ...(playing && Number.isFinite(playing.currentTime)
            ? { mediaSec: playing.currentTime }
            : {}),
        },
        ...(selection ? { selection } : {}),
      });
    } else if (
      message.type === "avenire-restore" &&
      "position" in message &&
      message.position &&
      typeof message.position === "object"
    ) {
      restorePosition(message.position as CapturePosition);
      reply({ ok: true });
    }
  });
}
