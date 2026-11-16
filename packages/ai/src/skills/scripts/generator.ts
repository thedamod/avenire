/**
 * Inlines the skill sources in `skills/sections/<section>/*.md` into
 * `skills/skills.ts`, so any runtime can load skills without filesystem access.
 * Each source carries SKILL.md-style frontmatter (`name`, `description`).
 *
 * Run: pnpm --filter @avenire/ai skills:generate
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface SkillEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly section: string;
  readonly path: string;
  readonly content: string;
}

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SECTIONS_DIR = path.join(ROOT_DIR, "sections");
export const OUTPUT_FILE = path.join(ROOT_DIR, "skills.ts");
const KIT_API_FILE = path.resolve(ROOT_DIR, "../../../widget-kit/API.md");

const parseFrontmatter = (raw: string) => {
  const attributes: { name?: string; description?: string } = {};
  if (!raw.startsWith("---\n")) return { attributes, body: raw };
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return { attributes, body: raw };
  for (const line of raw.slice(4, end).split("\n")) {
    const [, key, value] = /^(name|description):\s*(.+?)\s*$/.exec(line) ?? [];
    if ((key === "name" || key === "description") && value !== undefined) attributes[key] = value;
  }
  return { attributes, body: raw.slice(end + 5) };
};

const humanize = (value: string) =>
  value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const escapeTemplate = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");

const readEntry = async (section: string, file: string) => {
  const fullPath = path.join(SECTIONS_DIR, section, file);
  const content = (await readFile(fullPath, "utf8")).replaceAll(/[ \t]+$/gm, "");
  const { attributes, body } = parseFrontmatter(content);
  const id = attributes.name ?? file.replace(/\.md$/, "");
  const entry: SkillEntry = {
    id,
    title: /^#\s+(.+)$/m.exec(body)?.[1]?.trim() ?? humanize(id),
    description: attributes.description ?? null,
    section,
    path: path.relative(ROOT_DIR, fullPath).split(path.sep).join("/"),
    content,
  };
  return entry;
};

const readEntries = async (): Promise<ReadonlyArray<SkillEntry>> => {
  const sections = (await readdir(SECTIONS_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const files = await Promise.all(
    sections.map(async (section) =>
      (await readdir(path.join(SECTIONS_DIR, section)))
        .filter((file) => file.endsWith(".md"))
        .sort()
        .map((file) => [section, file] as const),
    ),
  );
  const sectionEntries = await Promise.all(
    files.flat().map(([section, file]) => readEntry(section, file)),
  );
  const kitApi = await readFile(KIT_API_FILE, "utf8");
  const entries: ReadonlyArray<SkillEntry> = [
    ...sectionEntries,
    {
      id: "kit-api",
      title: "Ava widget kits",
      description: "Use the exact math, isometric SVG and WebGL kit exports in standalone widgets.",
      section: "tool-guidelines",
      path: path.relative(ROOT_DIR, KIT_API_FILE).split(path.sep).join("/"),
      content: `---\nname: kit-api\ndescription: Use the exact math, isometric SVG and WebGL kit exports in standalone widgets.\n---\n\nUse this source for API signatures. Its literal demo colours show kit mechanics; use Avenire tokens from \`style\` in Ava widgets.\n\n${kitApi}`,
    },
  ];
  const duplicate = entries.find((entry, index) =>
    entries.some((other, otherIndex) => otherIndex < index && other.id === entry.id),
  );
  if (duplicate !== undefined) throw new Error(`Duplicate skill id: ${duplicate.id}`);
  return entries;
};

/** The generated module's source; the test compares it with the committed file. */
export const renderSkillsModule = async (): Promise<string> => {
  const entries = await readEntries();
  const sections = [...new Set(entries.map((entry) => entry.section))];
  const idsIn = (section: string) =>
    JSON.stringify(entries.filter((entry) => entry.section === section).map((entry) => entry.id));
  return [
    "// This file is generated. Do not edit by hand.",
    "// Run: pnpm --filter @avenire/ai skills:generate",
    "",
    `export type SkillSection = ${sections.map((section) => JSON.stringify(section)).join(" | ")};`,
    "",
    "export interface SkillDefinition {",
    "  readonly id: string;",
    "  readonly title: string;",
    "  readonly description: string | null;",
    "  readonly section: SkillSection;",
    "  readonly path: string;",
    "  readonly content: string;",
    "}",
    "",
    "export const SKILL_MAP = {",
    ...entries.flatMap((entry) => [
      `  ${JSON.stringify(entry.id)}: {`,
      `    id: ${JSON.stringify(entry.id)},`,
      `    title: ${JSON.stringify(entry.title)},`,
      `    description: ${JSON.stringify(entry.description)},`,
      `    section: ${JSON.stringify(entry.section)},`,
      `    path: ${JSON.stringify(entry.path)},`,
      `    content: \`${escapeTemplate(entry.content)}\`,`,
      "  },",
    ]),
    "} as const satisfies Record<string, SkillDefinition>;",
    "",
    "export type SkillId = keyof typeof SKILL_MAP;",
    "",
    `export const AVAILABLE_SKILLS = ${JSON.stringify(entries.map((entry) => entry.id))} as const;`,
    `export const STUDY_SKILLS = ${idsIn("study-guidelines")} as const;`,
    `export const VISUAL_SKILLS = ${idsIn("visual-guidelines")} as const;`,
    `export const VISUAL_EXAMPLE_SKILLS = ${idsIn("visual-examples")} as const;`,
    `export const TOOL_SKILLS = ${idsIn("tool-guidelines")} as const;`,
    "",
  ].join("\n");
};

if (import.meta.main) {
  await writeFile(OUTPUT_FILE, await renderSkillsModule(), "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}
