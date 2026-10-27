// Fails when a component steps outside the design system (see DESIGN.md).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../src/", import.meta.url).pathname;
const tokens = join(root, "styles/marketing.css");

const rules = [
  { name: "arbitrary Tailwind value", pattern: /\b[a-z][\w:-]*-\[[^\]]+\]/g },
  { name: "raw colour", pattern: /#[\da-fA-F]{3,8}\b|\brgba?\(/g },
  { name: "raw px value", pattern: /\b\d+(\.\d+)?px\b/g },
  { name: "inline style", pattern: /\bstyle=\{?["{]/g },
];

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(tsx?|astro|css)$/.test(entry.name) && path !== tokens ? [path] : [];
  });

const problems = [];
for (const file of files(root)) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      // SVG path data and viewBoxes are geometry, not styling.
      const code = line.replace(/\b(d|viewBox|points)="[^"]*"/g, "");
      for (const rule of rules)
        for (const match of code.matchAll(rule.pattern))
          problems.push(`${relative(root, file)}:${index + 1}  ${rule.name}: ${match[0]}`);
    });
}

if (problems.length) {
  console.error(`Design system violations (${problems.length}):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("Design system check passed.");
