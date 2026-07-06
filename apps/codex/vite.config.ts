import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // .claude/worktrees/ 内の別セッション作業ツリーのテストを拾わない
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
