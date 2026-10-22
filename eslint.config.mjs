import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

const hooksRecommended =
  reactHooks.configs.flat?.recommended ?? reactHooks.configs["recommended-latest"];

export default defineConfig([
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "backend/public/**",
      "data/**",
      "eval/docs/**",
      "eval/results/**",
      "backend/samples/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  {
    files: ["backend/**/*.ts", "eval/**/*.{ts,mjs}", "scripts/**/*.mjs", "*.mjs", "backend/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    ...hooksRecommended,
    plugins: { ...(hooksRecommended.plugins ?? {}), "react-refresh": reactRefresh },
    languageOptions: { globals: globals.browser },
    rules: {
      ...(hooksRecommended.rules ?? {}),
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  prettier,
]);
