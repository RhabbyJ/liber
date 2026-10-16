import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Next.js enforces `import "server-only"` at compile time and does not
      // need the package installed; tests import server modules directly.
      "server-only": fileURLToPath(import.meta.resolve("next/dist/compiled/server-only/empty.js")),
    },
  },
});
