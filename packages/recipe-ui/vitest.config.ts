import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "recipe-ui",
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
