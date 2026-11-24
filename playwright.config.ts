/**
 * Phase 4 行为验收的 Playwright 配置。
 *
 * 本机 Windows 沙箱会阻断浏览器启动（PLAN R12），所以浏览器级验证只在 CI
 * （Ubuntu runner）执行；本地只用 `playwright test --list` 证明用例可被收集。
 *
 * 站点由 `examples/blog` 构建后用 `astro preview` 提供：
 *   - 默认端口 4321；
 *   - 已有一个服务在跑时复用（本地开发方便），CI 里强制新起，避免误连旧产物；
 *   - 设置 `E2E_BASE_URL` 可指向任意已部署的实例（此时不再自动拉起 webServer）。
 *
 * webServer 命令里两个环节都在本机验证过（node-linker=hoisted，Astro 在仓库根）：
 *   - `pnpm --filter blog build` 与 CI build job 用的是同一条命令；
 *   - `pnpm --filter blog exec astro --version` → astro v7.4.13（pnpm 会把 workspace
 *     根的 node_modules/.bin 加进 PATH，所以 hoisted 布局下也能解析到），
 *     `pnpm --filter blog exec astro preview` 在本机起服务，13 个页面 URL 全部 200。
 * 因此 CI（ubuntu）与本地跑的是同一串命令，不依赖额外的全局 astro。
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4321)
const HOST = process.env.E2E_HOST ?? '127.0.0.1'
const BASE_URL = process.env.E2E_BASE_URL ?? `http://${HOST}:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  // 用例之间不共享状态，允许并行；每个用例自己从首页起步
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // CI 里额外产出 HTML 报告（作为 artifact 上传）；本地只打列表
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
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
