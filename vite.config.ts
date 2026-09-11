/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// repo 名稱不寫死：甲方尚未建 repo，寫死一個猜的名字就是預埋白屏。
// 三層回退：BASE_PATH（本地重現 Pages 路徑）→ GITHUB_REPOSITORY（Actions 注入）→ '/'（dev）
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

/**
 * 正規化成 /xxx/ 形式。
 *
 * BASE_PATH 刻意接受不帶斜線的值（例如 screw-hole-advisor）：在 Git Bash / MSYS 下，
 * 以斜線開頭的環境變數值會被當成 Unix 路徑自動轉成 Windows 路徑——實測
 * BASE_PATH=/screw-hole-advisor/ 會變成 /Program Files/Git/screw-hole-advisor/，
 * 建置出來的資源路徑全錯，而這個錯誤在 dev server 上完全看不出來，只會在 Pages 上白屏。
 */
function normalizeBase(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const name = v.replace(/^.*[/\\]/, '').replace(/[/\\]+$/, '') || v.replace(/[/\\]/g, '');
  return name ? `/${name}/` : undefined;
}

export default defineConfig({
  plugins: [react()],
  base: normalizeBase(process.env.BASE_PATH) ?? (repo ? `/${repo}/` : '/'),
  test: {
    environment: 'node', // 核心測試跑 node 環境，碰 DOM 直接爆
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/types.ts'],
      thresholds: { statements: 90, branches: 80, functions: 90, lines: 90 },
      reporter: ['text', 'json-summary'],
    },
  },
});
