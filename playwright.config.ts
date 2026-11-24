/**
 * Phase 4 行为验收的 Playwright 配置。
 *
 * 浏览器级验证在 CI（Ubuntu runner）执行；本地可只用 `playwright test --list` 证明
 * 用例可被收集，或设置 `E2E_CHANNEL=msedge` 用系统 Edge 跑（无需下载浏览器）。
 *
 * 站点由 `examples/blog` 构建后用 `astro preview` 提供：
 *   - 默认端口 4321；
 *   - 已有一个服务在跑时复用（本地开发方便），CI 里强制新起，避免误连旧产物；
 *   - 设置 `E2E_BASE_URL` 可指向任意已部署的实例（此时不再自动拉起 webServer）。
 *
 * P4-10（CI 首跑 26 条失败）之后的两处确定性修正：
 *   1. viewport 固定 1280×900。旧配置顶层写了 1280×800，但 project 里
 *      `...devices['Desktop Chrome']` 会覆盖成 1280×720 —— 主题 CSS 有
 *      `@media (max-height: 800px) { #console .console-card-group { display: none } }`，
 *      中控台卡片因此永远不渲染。900 > 800 断点，卡片区可见，用例才能断言真实内容。
 *   2. timeout 从 30s 提到 45s：每条用例最多两次 goto/reload，每次的「主题运行时
 *      ready」等待包含 preloader 的 10s 兜底计时器（loading-box 的 load 兜底），
 *      30s 对「首访 + reload」类用例余量太小。
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4321)
const HOST = process.env.E2E_HOST ?? '127.0.0.1'
const BASE_URL = process.env.E2E_BASE_URL ?? `http://${HOST}:${PORT}`
/** 本地无下载浏览器时用系统浏览器跑：`$env:E2E_CHANNEL='msedge'; npx playwright test`。 */
const CHANNEL = process.env.E2E_CHANNEL

export default defineConfig({
  testDir: './tests/e2e',
  // 用例之间不共享状态，允许并行；每个用例自己从首页起步
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // CI 里额外产出 HTML 报告（作为 artifact 上传）；本地只打列表
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 显式覆盖 devices 的 1280×720：主题在 max-height<=800px 时会隐藏中控台卡片
        viewport: { width: 1280, height: 900 },
        ...(CHANNEL ? { channel: CHANNEL } : {}),
      },
    },
  ],
  // 只有没显式给 E2E_BASE_URL 时才自己构建 + 起 preview
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm --filter blog build && pnpm --filter blog exec astro preview --host ${HOST} --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
