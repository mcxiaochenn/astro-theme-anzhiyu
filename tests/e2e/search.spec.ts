/**
 * Phase 4 行为验收：搜索 UI（P4-8）
 *
 * 现实前提（诚实记录）：demo 站 `theme.config.yml` 里
 * `algolia_search.enable` / `docsearch.enable` / `local_search.enable` 全是 false，
 * 上游 `layout/includes/third-party/search/index.pug` 在三个开关都关时**不输出任何搜索
 * DOM**，站上也没有 `#search-button`。所以 demo 站上这条用例只会 skip，不会伪造通过。
 *
 * 真实搜索验收走真实站迁移验收（scripts/accept-migration.mjs + 浏览器走查）。
 *
 * 下面「打开 → 输入 → 出结果」的分支选择器取自上游 pug（本仓库
 * `_research/anzhiyu-upstream/layout/includes/third-party/search/*.pug`），
 * 等以后有 fixture 打开某套搜索时直接生效；当前 demo 站不可达该分支。
 *
 * P4-10：`page.goto` 从默认 `waitUntil: "load"` 改为 `gotoReady`（domcontentloaded +
 * 主题运行时），避免 CI 上外部 CDN 挂起导致 goto 30s 超时（本文件在 demo 站会 skip，
 * 但基座保持一致，避免以后打开搜索时重新踩坑）。
 */
import { detectSearchUi, expect, gotoReady, test } from './helpers'

const SKIP_REASON =
  'demo 站未启用搜索 UI（theme.config.yml 的 local_search/algolia_search/docsearch 均为 false）；' +
  '搜索验收走真实站迁移验收（scripts/accept-migration.mjs + 浏览器走查）'

test.describe('搜索 UI（P4-8）', () => {
  test('搜索入口检测：未启用时明确 skip，不伪造通过', async ({ page }) => {
    await gotoReady(page, '/')
    const ui = await detectSearchUi(page)
    test.skip(ui === null, SKIP_REASON)
    expect(ui, '检测到搜索入口就应该能说出是哪一套').not.toBeNull()
  })

  test('打开搜索框 → 输入关键词 → 出结果', async ({ page }) => {
    await gotoReady(page, '/')
    const ui = await detectSearchUi(page)
    test.skip(ui === null, SKIP_REASON)

    // 打开：导航栏搜索按钮（上游 layout/includes/header/nav.pug:37-42）
    await page.locator('#search-button a.search').first().click()

    if (ui === 'local') {
      // 上游 layout/includes/third-party/search/local-search.pug
      await expect(page.locator('#local-search .search-dialog')).toBeVisible()
      const input = page.locator('#local-search .local-search-box--input')
      await expect(input).toBeVisible()
      await input.fill('Astro')
      // 本地搜索首次打开要拉索引，给足超时
      await expect(
        page.locator('#local-search-results a, #local-search-results li').first(),
      ).toBeVisible({ timeout: 20_000 })
    } else if (ui === 'algolia') {
      // 上游 layout/includes/third-party/search/algolia.pug
      await expect(page.locator('#algolia-search .search-dialog')).toBeVisible()
      const input = page.locator('#algolia-search-input input').first()
      await expect(input).toBeVisible()
      await input.fill('Astro')
      await expect(
        page.locator('#algolia-search-results .ais-Hits-item, #algolia-search-results a').first(),
      ).toBeVisible({ timeout: 20_000 })
    } else {
      // docsearch：上游 docsearch.pug 把点击转给 Algolia 的 .DocSearch-Button
      const docsearchButton = page.locator('.docsearch-wrap .DocSearch-Button').first()
      await expect(docsearchButton).toBeVisible()
      await docsearchButton.click()
      await expect(page.locator('.DocSearch-Modal')).toBeVisible()
      await page.locator('.DocSearch-Input').fill('Astro')
      await expect(page.locator('.DocSearch-Hits, .DocSearch-Hit').first()).toBeVisible({
        timeout: 20_000,
      })
    }
  })
})
