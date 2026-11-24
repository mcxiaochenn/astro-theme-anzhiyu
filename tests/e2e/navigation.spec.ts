/**
 * Phase 4 行为验收：站内导航不整页刷新（ClientRouter / pug pjax 兼容层）
 *
 * 验收口径来自 docs/PLAN.md「Phase 4 验收」：
 *   - 站内点击 document 请求为 0；
 *   - 前进后退不出现重复初始化（console 无报错）。
 *
 * 「真的没刷新」不靠 URL 变化判断（pjax 骗过 URL 太容易），用两条硬证据：
 *   1. 点击后没有新的 `resourceType === 'document'` 请求 —— 整页刷新必然出现；
 *   2. window 上的标记在导航后仍在 —— 整页刷新会清空它。
 *
 * console 断言只过滤「资源加载失败」类噪音（第三方 CDN、图片 404 由 P4 资源/第三方
 * 集成用例负责），运行时 JS 异常与其余 console.error 一律 fail。
 */
import { expect, test, type Page } from '@playwright/test'
import {
  collectPageErrors,
  internalLink,
  runtimeConsoleErrors,
  trackDocumentRequests,
  waitForClientRoute,
} from './helpers'

/** 在 window 上打一个「本页没有被重新加载」的标记。 */
async function markSameDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as { __e2eSameDocument?: boolean }).__e2eSameDocument = true
  })
}

/** 读标记：整页刷新后 window 是新的，读不到 → false。 */
async function sameDocument(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __e2eSameDocument?: boolean }).__e2eSameDocument === true,
  )
}

test.describe('站内导航 · ClientRouter 无刷新', () => {
  test('点击站内链接不产生 document 请求（无整页刷新）', async ({ page }) => {
    const documents = trackDocumentRequests(page)

    await page.goto('/')
    await expect(page.locator('#recent-posts')).toBeVisible()
    // 首访首页本身就是一次 document 请求，作为基线
    const baseline = documents.length
    expect(baseline, '首访首页应有 document 请求').toBeGreaterThan(0)
    await markSameDocument(page)

    const urlBefore = page.url()
    await internalLink(page).click()
    await waitForClientRoute(page, urlBefore)

    expect(page.url(), '点击后 URL 应变化').not.toBe(urlBefore)
    expect(
      documents.slice(baseline),
      `站内导航产生了整页 document 请求：${documents.slice(baseline).join(', ')}`,
    ).toEqual([])
    expect(await sameDocument(page), '站内导航后 window 标记丢失（发生了整页刷新）').toBe(true)
  })
})

test.describe('站内导航 · 前进/后退', () => {
  test('浏览器前进/后退后页面可用，且 console 无运行时错误', async ({ page }) => {
    const errors = collectPageErrors(page)

    await page.goto('/')
    await expect(page.locator('#recent-posts')).toBeVisible()
    await markSameDocument(page)

    const homeUrl = page.url()
    await internalLink(page).click()
    await waitForClientRoute(page, homeUrl)
    const postUrl = page.url()
    expect(postUrl, '站内点击后应离开首页').not.toBe(homeUrl)

    // 后退：URL 回到首页，首页专属 DOM 必须重新可用
    await page.goBack()
    await expect.poll(() => page.url(), { timeout: 10_000 }).toBe(homeUrl)
    await expect(page.locator('#recent-posts')).toBeVisible()
    expect(await sameDocument(page), '后退后 window 标记丢失（发生了整页刷新）').toBe(true)

    // 前进：URL 回到文章页，文章页外壳必须可用
    await page.goForward()
    await expect.poll(() => page.url(), { timeout: 10_000 }).toBe(postUrl)
    await expect(page.locator('#content-inner')).toBeAttached()
    expect(await sameDocument(page), '前进后 window 标记丢失（发生了整页刷新）').toBe(true)

    const runtimeErrors = runtimeConsoleErrors(errors.consoleErrors)
    expect(errors.pageErrors, `前进/后退出现未捕获 JS 异常：${errors.pageErrors.join(' | ')}`).toEqual(
      [],
    )
    expect(runtimeErrors, `前进/后退出现 console 报错：${runtimeErrors.join(' | ')}`).toEqual([])
  })
})

test.describe('站内导航 · 连续导航', () => {
  test('连续两次站内导航后 document 请求仍为 0', async ({ page }) => {
    const documents = trackDocumentRequests(page)

    await page.goto('/')
    await expect(page.locator('#recent-posts')).toBeVisible()
    const baseline = documents.length
    await markSameDocument(page)

    // 导航 1：首页 → 文章（文章卡片标题链接）
    const homeUrl = page.url()
    await internalLink(page).click()
    await waitForClientRoute(page, homeUrl)
    const postUrl = page.url()
    expect(postUrl).not.toBe(homeUrl)

    // 导航 2：文章 → 首页（页头站点名链接，所有页面共用的稳定入口）
    await page.locator('#site-name').click()
    await waitForClientRoute(page, postUrl)
    await expect(page.locator('#recent-posts')).toBeVisible()

    expect(page.url(), '第二次导航后应回到首页').toBe(homeUrl)
    expect(
      documents.slice(baseline),
      `连续两次站内导航产生了 ${documents.slice(baseline).length} 次整页 document 请求：${documents
        .slice(baseline)
        .join(', ')}`,
    ).toEqual([])
    expect(await sameDocument(page), '连续导航后 window 标记丢失（发生了整页刷新）').toBe(true)
  })
})
