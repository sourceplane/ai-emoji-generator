import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../apps/web/src/"),
      // A marker module Next resolves for server code; outside Next it throws on import.
      "server-only": path.resolve(__dirname, "src/support/server-only.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
