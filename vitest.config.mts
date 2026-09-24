import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/dominio/**", "src/seguridad/**"],
      thresholds: { "src/dominio/**": { lines: 100, functions: 100, branches: 100, statements: 100 } },
    },
  },
});
