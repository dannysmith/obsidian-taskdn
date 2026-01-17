import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import prettier from "eslint-plugin-prettier/recommended";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...obsidianmd.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: ["main.js", "*.config.js", "*.config.mjs", "*.config.ts", "*.mjs"],
  }
);
