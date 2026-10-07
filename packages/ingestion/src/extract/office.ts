import * as Effect from "effect/Effect";
import { OfficeParser, type OfficeContentNode, type OfficeParserAST } from "officeparser";

import { sectionsFromMarkdown } from "./markdown.ts";
import { isOfficeMime, mimeEssence } from "./resolve.ts";
import {
  type ExtractedDocument,
  type ExtractedSection,
  ExtractionError,
  fullCoverage,
  UnsupportedSource,
} from "./types.ts";

const SHEET_ROWS_PER_SECTION = 300;

const nodeText = (node: OfficeContentNode): string =>
  (node.text ?? node.children?.map(nodeText).join(" ") ?? "").trim();

export const renderSheetRows = (
  rows: ReadonlyArray<ReadonlyArray<string>>,
): ReadonlyArray<string> => {
  const first = rows[0]?.map((value) => value.trim()) ?? [];
  const headers =
    first.length > 1 &&
    first.every((value) => value.length > 0 && !/^[-+]?\d+(?:\.\d+)?$/.test(value)) &&
    new Set(first.map((value) => value.toLowerCase())).size === first.length;
  const labels = headers ? first : first.map((_, index) => `Column ${index + 1}`);
  return rows
    .slice(headers ? 1 : 0)
    .map((row) =>
      row
        .map((value, index) => {
          const trimmed = value.trim();
          return trimmed ? `${labels[index] ?? `Column ${index + 1}`}: ${trimmed}` : "";
        })
        .filter(Boolean)
        .join(" | "),
    )
    .filter(Boolean);
};

const sheetRows = (sheet: OfficeContentNode): ReadonlyArray<ReadonlyArray<string>> => {
  const tables = sheet.children?.filter((node) => node.type === "table") ?? [];
  const rowNodes = (
    tables.length ? tables.flatMap((table) => table.children ?? []) : (sheet.children ?? [])
  ).filter((node) => node.type === "row");
  return rowNodes.map((row) =>
    (row.children ?? []).filter((cell) => cell.type === "cell").map(nodeText),
  );
};

export const sectionsFromOfficeAst = (
  content: ReadonlyArray<OfficeContentNode>,
  type: OfficeParserAST["type"],
): ReadonlyArray<ExtractedSection> => {
  if (type === "pptx" || type === "odp") {
    return content
      .filter((node) => node.type === "slide")
      .flatMap((slide, index) => {
        const text = [nodeText(slide), ...(slide.notes ?? []).map(nodeText)]
          .filter(Boolean)
          .join("\n\n");
        return text
          ? [
              {
                text,
                location: { slide: slide.metadata?.slideNumber ?? index + 1 },
                kind: "slide" as const,
              },
            ]
          : [];
      });
  }
  if (type === "xlsx" || type === "ods" || type === "csv") {
    return content
      .filter((node) => node.type === "sheet")
      .flatMap((sheet, index) => {
        const name = sheet.metadata?.sheetName ?? `Sheet ${index + 1}`;
        const rows = renderSheetRows(sheetRows(sheet));
        const output: Array<ExtractedSection> = [];
        for (let start = 0; start < rows.length; start += SHEET_ROWS_PER_SECTION) {
          output.push({
            text: rows.slice(start, start + SHEET_ROWS_PER_SECTION).join("\n"),
            location: { sheet: name },
          });
        }
        return output;
      });
  }
  const markdown = content
    .map((node) =>
      node.type === "heading"
        ? `${"#".repeat(Math.max(1, Math.min(node.metadata?.level ?? 1, 6)))} ${nodeText(node)}`
        : nodeText(node),
    )
    .filter(Boolean)
    .join("\n\n");
  return sectionsFromMarkdown(markdown);
};

export const extractOffice = (
  mimeType: string | null,
  source: Uint8Array,
): Effect.Effect<ExtractedDocument, ExtractionError | UnsupportedSource> => {
  const mime = mimeEssence(mimeType);
  if (mime === undefined || !isOfficeMime(mime)) {
    return Effect.fail(
      new UnsupportedSource({
        kind: "document",
        reason: `Unsupported office MIME type: ${mime ?? "missing"}`,
      }),
    );
  }
  return Effect.tryPromise({
    try: async () => {
      const ast = await OfficeParser.parseOffice(source, { ignoreNotes: false });
      const sections = sectionsFromOfficeAst(ast.content, ast.type);
      if (sections.length) return { sections, coverage: fullCoverage("text") };
      const flat = (await ast.to("text")).value.trim();
      return {
        sections: flat ? [{ text: flat, location: {} }] : [],
        coverage: {
          status: "partial" as const,
          parts: [{ part: "text", status: "partial" as const, detail: "structure unavailable" }],
        },
      };
    },
    catch: (cause) => new ExtractionError({ source: `office:${mime}`, cause }),
  });
};
