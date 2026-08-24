import eslint from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "docs/data-model/*.json",
      "docs/data-model/*.dbml",
      "docs/data-model/*.ddb",
    ],
  },
  {
    ...eslint.configs.recommended,
    files: ["**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ...config.languageOptions,
      globals: globals.node,
    },
  })),
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs.flat["recommended-latest"].rules,
  },
  // The approved MVP mockup is intentionally imported as a JavaScript-like
  // TypeScript port. Keep its existing runtime behavior while it is migrated
  // incrementally to strict component types after the internal MVP gate.
  {
    files: [
      "apps/web/src/App.tsx",
      "apps/web/src/FocusGraph.tsx",
      "apps/web/src/WatchableActions.tsx",
      "apps/web/src/WatchableDetails.tsx",
      "apps/web/src/infiniteGrid.ts",
      "apps/web/src/mediaUrls.ts",
    ],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
);
