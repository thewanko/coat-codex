import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // dev限定: wrangler pages dev(ローカルscriptorium)への同一originプロキシ。
      // 本番CORSはcoat-codex.com固定でlocalhostから直接fetch不可のため
      // （importFromScriptorium.tsのDEFAULT_API_BASEが import.meta.env.DEV 時に
      // "/__scriptorium" を使い、ここでローカルscriptoriumサーバーへ転送する）。
      "/__scriptorium": {
        target: "http://localhost:8788",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__scriptorium/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // .claude/worktrees/ 内の別セッション作業ツリーのテストを拾わない
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
