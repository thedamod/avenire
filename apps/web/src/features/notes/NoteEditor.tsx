"use client";

import "katex/dist/katex.min.css";
import "./note-editor.css";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, Extension, InputRule, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Mathematics } from "@tiptap/extension-mathematics";
import { Placeholder } from "@tiptap/extensions";
import { NoteBodySkeleton } from "./NoteBodySkeleton";

export interface NoteEditorHandle {
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  focus(position?: "start" | "end"): void;
}

/**
 * `$x^2$` typed inline becomes rendered math when the closing `$` is typed. Needs a non-space
 * right inside both dollars, so prices like "$5 and $10" stay text.
 */
const DollarMath = Extension.create({
  name: "dollarMath",
  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|[^$\\\w])(\$([^\s$](?:[^$\n]*?[^\s$])?)\$)$/,
        handler: ({ state, range, match }) => {
          const type = state.schema.nodes.inlineMath;
          const whole = match[1];
          const latex = match[2];
          if (!type || !whole || !latex) return null;
          // The typed `$` is already in the document; `range.to` ends after it.
          const start = range.to - whole.length;
          state.tr.replaceWith(start, range.to, type.create({ latex }));
        },
      }),
    ];
  },
});

// Same shape as the input rule; a digit right after the closing `$` means a price, not math.
const DOLLAR_MATH = /\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g;

/**
 * Turn any `$…$` left as text (pasted, loaded, or math opened for editing) back into math.
 * Inline code is left alone. Not added to undo history.
 */
function settleMath(editor: Editor) {
  const type = editor.schema.nodes.inlineMath;
  if (!type) return;
  const { tr } = editor.state;
  editor.state.doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text?.includes("$")) return;
    if (node.marks.some((mark) => mark.type.name === "code")) return;
    if (parent && !parent.type.contentMatch.matchType(type)) return;
    for (const match of node.text.matchAll(DOLLAR_MATH)) {
      const from = tr.mapping.map(pos + match.index);
      const to = tr.mapping.map(pos + match.index + match[0].length);
      tr.replaceWith(from, to, type.create({ latex: match[1] }));
    }
  });
  if (!tr.docChanged) return;
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

/**
 * The note body: a calm WYSIWYG markdown document (11 / M10). No toolbar; markdown shortcuts
 * only (#, -, 1., **, _, `, >, $…$). Clicking rendered math opens its source for editing.
 */
export default function NoteEditor({
  initialMarkdown,
  onChange,
  onBlur,
  onFocus,
  onReady,
  editable = true,
}: {
  initialMarkdown: string;
  onChange: () => void;
  onBlur?: () => void;
  onFocus?: () => void;
  onReady: (handle: NoteEditorHandle) => void;
  editable?: boolean;
}) {
  const router = useRouter();
  const callbacks = useRef({ onChange, onBlur, onFocus });
  callbacks.current = { onChange, onBlur, onFocus };
  const editorRef = useRef<Editor | null>(null);

  const openMathSource = (latex: string, pos: number, size: number) => {
    const editor = editorRef.current;
    if (!editor?.isEditable) return;
    const text = `$${latex}$`;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: pos, to: pos + size }, { type: "text", text })
      .setTextSelection(pos + text.length - 1)
      .run();
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Markdown,
      Mathematics.configure({
        katexOptions: { throwOnError: false },
        inlineOptions: {
          onClick: (node, pos) => openMathSource(node.attrs.latex, pos, node.nodeSize),
        },
      }),
      DollarMath,
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: initialMarkdown,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "note-prose",
        "aria-label": "Note",
        spellcheck: "true",
      },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        const href = anchor?.getAttribute("href");
        if (!href) return false;
        // Plain click on a link opens it; in-app links (citations) stay in the app.
        event.preventDefault();
        if (href.startsWith("/")) router.push(href);
        else window.open(href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
    onCreate: ({ editor }) => settleMath(editor),
    onUpdate: () => callbacks.current.onChange(),
    onFocus: () => callbacks.current.onFocus?.(),
    onBlur: ({ editor }) => {
      settleMath(editor);
      callbacks.current.onBlur?.();
    },
  });
  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    onReady({
      getMarkdown: () => editor.getMarkdown(),
      setMarkdown: (markdown) => {
        editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
        settleMath(editor);
      },
      focus: (position = "end") => editor.commands.focus(position),
    });
    // onReady is called once per editor instance.
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  if (!editor) return <NoteBodySkeleton />;
  return <EditorContent editor={editor} />;
}
