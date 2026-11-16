// Obsidian's recommended rules, which the community directory's review also
// runs. Lint from the repo root so manifest.json, package.json and LICENSE are
// checked too.
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  globalIgnores([
    "node_modules",
    "main.js",
    "test-vault",
    "esbuild.config.mjs",
    "version-bump.mjs",
    "eslint.config.mjs",
    "tsconfig.json",
  ]),
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...obsidianmd.configs.recommended
);
