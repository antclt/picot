// ABOUTME: Configures Picot's browser and build-script Vitest regression suites.
// ABOUTME: Keeps distribution-asset checks alongside frontend behavior tests.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.js"],
    include: ["public/**/*.test.js", "extensions/**/*.test.ts", "scripts/**/*.test.js"],
    coverage: {
      provider: "istanbul",
      enabled: false,
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["public/**/*.js", "extensions/**/*.ts", "scripts/**/*.js"],
      exclude: [
        "**/*.test.{js,ts}",
        "extensions/dist/**",
        "extensions/embedded-server.ts",
        "public/**/*-vendor-entry.js",
        "public/vendor/**",
      ],
    },
  },
});
