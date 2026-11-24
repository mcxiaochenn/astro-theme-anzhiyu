/**
 * P7-1 PWA 离线验收的独立 Playwright 配置。
 *
 * 为什么独立：PWA 产物（dist/sw.js、dist/manifest.webmanifest、每页注入的
 * manifest link 与注册脚本）只在 `ANZHIYU_PWA=1` 时生成——默认构建必须保持
 * 48 页 HTML 基线零差异。所以这里用自带 env 的 webServer 重建 + preview，
 * 端口也与默认的 4321 错开（4322），报告/结果目录独立（CI artifact 不冲突）。
 *
 * 本机（Windows + DSH 沙箱）无法启动 Chromium（PLAN R12）：
 *   本地验证只用 `npx playwright test -c playwright.pwa.config.ts --list`
 *   证明用例可收集；真实执行在 CI 的 ubuntu e2e job（.github/workflows/ci.yml）。
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PWA_PORT ?? 4322)
const HOST = process.env.E2E_PWA_HOST ?? '127.0.0.1'
const BASE_URL = process.env.E2E_PWA_BASE_URL ?? `http://${HOST}:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  // 只收 PWA 离线用例；默认 `npx playwright test`（根 playwright.config.ts）
  // 也会扫到 pwa.spec.ts，所以那个文件自带「当前产物没有 sw.js 就 skip」的门闸，
  // 两套配置互不干扰（原因见 docs/notes/P7-1-pwa.md §6）。
  testMatch: 'pwa.spec.ts',
  // SW + 离线模拟是有状态行为，串行跑一个 worker
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-pwa-report', open: 'never' }]]
    : 'list',
  outputDir: 'test-results-pwa',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // 只有没显式给 E2E_PWA_BASE_URL 时才自己构建 + 起 preview。
  // `env` 会与 process.env 合并，只多设一个 ANZHIYU_PWA=1。
  webServer: process.env.E2E_PWA_BASE_URL
    ? undefined
    : {
        command: `pnpm --filter blog build && pnpm --filter blog exec astro preview --host ${HOST} --port ${PORT}`,
        env: { ANZHIYU_PWA: '1' },
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
