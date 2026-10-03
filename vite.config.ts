import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

const IGNORED = [
  "context/**",
  "dist",
  "dist-electron",
  ".next",
  ".expo",
  "node_modules",
  "pnpm-lock.yaml",
  "*.tsbuildinfo",
  "packages/database/drizzle/**",
  "apps/mobile/ios/**",
  "apps/mobile/android/**",
];

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/context/**", "**/node_modules/**", "**/dist/**", "**/.next/**"],
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
  staged: {
    "*": "vp fmt --no-error-on-unmatched-pattern",
  },
  fmt: {
    ignorePatterns: IGNORED,
    sortPackageJson: {},
  },
  lint: {
    ignorePatterns: IGNORED,
    plugins: ["eslint", "oxc", "react", "unicorn", "typescript"],
    categories: {
      correctness: "warn",
      suspicious: "warn",
      perf: "warn",
    },
    rules: {
      "react-in-jsx-scope": "off",
      "react-hooks/exhaustive-deps": "off",
      "eslint/no-shadow": "off",
      "unicorn/consistent-function-scoping": "off",
      "unicorn/no-array-sort": "off",
      "oxc/no-map-spread": "off",
      "typescript/no-floating-promises": "off",
    },
    options: {
      reportUnusedDisableDirectives: "error",
      typeAware: false,
      typeCheck: false,
    },
  },
});
