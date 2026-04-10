import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**"],
      exclude: ["tests/**", "dist/**", "node_modules/**"],
      thresholds: {
        "src/domain/v2/**": {
          lines: 85,
          branches: 90
        },
        "src/services/v2/**": {
          lines: 80
        }
      }
    }
  }
});
