import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // Existing controlled inputs and third-party map widgets intentionally
      // synchronize prop/external state in effects. Keep the rest of the
      // React hooks rules enabled while those components are modernized.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      // Integration fixtures model untyped database-driver payloads.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
