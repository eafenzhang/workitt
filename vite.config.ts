import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import AutoImport from "unplugin-auto-import/vite";
import checker from "vite-plugin-checker";
import * as lucide from "lucide-react";

// 只把 lucide 带 Icon 后缀的别名（MapIcon / FileIcon / StarIcon ...）纳入 auto-import。
// 这组名字由 lucide 官方 PR #2328 提供，天然不与 JS 全局 / DOM / React 导出撞名。
// 配合 src/vite-env.d.ts 里的 `declare module "lucide-react"` 重定向使用。
const lucideIconNames = Object.keys(lucide).filter(
  (k) => /^[A-Z]/.test(k) && k.endsWith("Icon")
);

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
            if (id.includes('recharts')) return 'vendor-recharts';
            if (id.includes('@tiptap')) return 'vendor-tiptap';
            if (id.includes('@radix-ui')) return 'vendor-ui';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('sql.js') || id.includes('jszip') || id.includes('file-saver')) return 'vendor-utils';
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    // Remove crossorigin attribute from script/link tags (Tauri dev mode compatibility)
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/ crossorigin/g, '');
      },
    },
    react(),
    tailwindcss(),
    AutoImport({
      dts: "auto-imports.d.ts",
      include: [/\.[tj]sx?$/],
      imports: [
        "react",
        { "lucide-react": lucideIconNames },
      ],
      eslintrc: { enabled: false },
    }),
    checker({
      typescript: {
        tsconfigPath: "tsconfig.app.json",
      },
      enableBuild: false,
      enableDevE2ELogging: false,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
