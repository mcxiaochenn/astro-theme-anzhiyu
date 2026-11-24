/**
 * P7-1 PWA 离线验收用例。
 *
 * 运行方式（需要 PWA 产物）：`npx playwright test -c playwright.pwa.config.ts`
 *   - 该配置的 webServer 带 `ANZHIYU_PWA=1` 重建站点 + `astro preview`；
 *   - 默认 `npx playwright test`（根配置，4321/默认构建）也会扫到这个文件：
 *     此时产物里没有 /sw.js，beforeEach 会 skip —— 这是「构建模式不匹配」的
 *     环境原因，不是掩盖失败；同一批断言在 CI 的 PWA 步骤里真实执行。
 *
 * 断言目标（PLAN P7-1 验收：离线可访问首页 + CDN 备用 URL 逻辑生效）：
 *   1. 产物层：sw.js 里有上游 cacheName / CDN 规则 / getSpareUrls 补丁；
 *      manifest.webmanifest 有图标与主题色；
 *   2. 运行层：SW 安装并接管页面 → 断网重载首页仍渲染（标题 + #body-wrap）；
 *   3. 注册层：首页 <head> 里有 manifest link 与注册脚本（构建后注入）。
 */
import { expect, test } from '@playwright/test'

const HOME_TITLE = /AnZhiYu Baseline/

test.describe('P7-1 PWA · 离线可访问首页', () => {
  test.beforeEach(async ({ request }) => {
    // 根配置（默认构建）下没有 PWA 产物：这是构建模式不匹配，直接跳过。
    const sw = await request.get('/sw.js')
    test.skip(
      !sw.ok(),
      '当前站点不是 ANZHIYU_PWA=1 构建（没有 /sw.js），本用例只在 playwright.pwa.config.ts 下执行',
    )
  })

  test('构建产物：sw.js 覆盖 sw-rules 规则，manifest 含图标', async ({ request }) => {
    const swResponse = await request.get('/sw.js')
    expect(swResponse.ok()).toBe(true)
    const swText = await swResponse.text()

    // 上游 serviceWorker.cacheName
    expect(swText).toContain('AnZhiYuThemeCache')
    // cacheRules.cdn：CDN host 白名单 + 资源后缀（workbox 把 RegExp 序列化进 SW）
    expect(swText).toContain('bytecdntp')
    expect(swText).toContain('cdn\\.staticfile\\.org')
    // external.stable：cdn.cbd.int / cdn.jsdelivr.net 两条稳定 URL 正则
    expect(swText).toContain('cdn\\.cbd\\.int')
    expect(swText).toContain('cdn\\.jsdelivr\\.net')
    // 上游 external.stable[0] + getSpareUrls：npm.elemecdn.com → cdn.cbd.int（3s 超时）
    expect(swText).toContain('P7-1-SPARE-URLS')
    expect(swText).toContain('https://npm.elemecdn.com')
    expect(swText).toContain('https://cdn.cbd.int')
    expect(swText).toContain('TIMEOUT_MS = 3000')
    // Workbox 预缓存清单（62 个页面 + 资源）；清单条目形如 {url:`…`,revision:…}
    expect((swText.match(/\{url:/g) ?? []).length).toBeGreaterThanOrEqual(48)

    const manifestResponse = await request.get('/manifest.webmanifest')
    expect(manifestResponse.ok()).toBe(true)
    const manifest = await manifestResponse.json()
    expect(manifest.name).toBe('AnZhiYu Baseline')
    expect(manifest.theme_color).toBe('#425AEF')
    expect(manifest.display).toBe('standalone')
    expect(Array.isArray(manifest.icons)).toBe(true)
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2)
    for (const icon of manifest.icons) {
      const iconResponse = await request.get(icon.src)
      expect(iconResponse.ok(), `manifest 图标 ${icon.src} 应可访问`).toBe(true)
    }
  })

  test('SW ready → 断网重载首页仍可见（标题 + #body-wrap）', async ({
    page,
    context,
    browserName,
  }) => {
    // 只有 Chromium 的「离线模拟 + Service Worker」组合是官方支持的验证路径
    test.skip(browserName !== 'chromium', 'offline + Service Worker 断言仅在 Chromium 上验证')

    await page.goto('/')
    const swSupported = await page.evaluate(() => 'serviceWorker' in navigator)
    test.skip(!swSupported, '当前浏览器不支持 Service Worker')

    // 首页 <head> 注入的 manifest link（Astro SSG 不走 Vite transformIndexHtml，
    // 由 astro.config.mjs 的 anzhiyuPwaExtras() 构建后注入，原因见 P7-1-pwa.md §4）
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    )
    await expect(page).toHaveTitle(HOME_TITLE)
    await expect(page.locator('#body-wrap')).toBeVisible()

    // 等 SW 安装 + 激活并接管当前页面（registerType=autoUpdate ⇒ skipWaiting + clientsClaim）
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
      timeout: 30_000,
    })
    const swState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      return registration.active?.state ?? null
    })
    expect(swState).toBe('activated')

    // 断网 → 重载：首页必须由预缓存直出，不能靠网络
    await context.setOffline(true)
    try {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.locator('#body-wrap')).toBeVisible()
      await expect(page).toHaveTitle(HOME_TITLE)
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
        'href',
        '/manifest.webmanifest',
      )
      // 断网后仍受 SW 控制
      expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
    } finally {
      await context.setOffline(false)
    }
  })
})
