import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/types.ts"],
      reporter: ["text", "html"],
      // Per file, not in aggregate: an aggregate hides one weak file.
      thresholds: {
        perFile: true,
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 85,
      },
    },
  },
});
