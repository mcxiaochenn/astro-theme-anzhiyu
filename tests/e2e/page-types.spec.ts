/**
 * 独立特色页面与原版 DOM 契约全量冒烟验收
 */
import { expect, gotoReady, test } from './helpers'

type PageTypeCase = {
  type: string
  path: string
  selector: string
  dataType: string
  hasPageShell?: boolean
}

const PAGE_TYPE_CASES: PageTypeCase[] = [
  { type: 'about', path: '/about/', selector: '#about-page .author-box', dataType: 'about', hasPageShell: true },
  { type: 'categories', path: '/categories/', selector: '#tag-page-tags', dataType: 'categories', hasPageShell: true },
  { type: 'tags', path: '/tags/', selector: '#tag-page-tags', dataType: 'tags', hasPageShell: true },
  { type: 'flink', path: '/link/', selector: '#flink-banners', dataType: 'flink', hasPageShell: true },
  { type: 'essay', path: '/essay/', selector: '#essay_page #bber', dataType: 'essay', hasPageShell: true },
  { type: 'album', path: '/album/', selector: '#album .card-album', dataType: 'album', hasPageShell: true },
  { type: 'album_detail_waterfall', path: '/album/demo/', selector: '#album_detail .album-item', dataType: 'album_detail', hasPageShell: true },
  { type: 'album_detail_gallery', path: '/album/gallery/', selector: '#album_detail .type-gallery', dataType: 'album_detail', hasPageShell: true },
  { type: 'equipment', path: '/equipment/', selector: '#equipment .equipment-item', dataType: 'equipment', hasPageShell: true },
  { type: 'fcircle', path: '/fcircle/', selector: '.fcircle_page #random-post', dataType: 'fcircle', hasPageShell: true },
  { type: 'music', path: '/music/', selector: '#anMusic-page', dataType: 'music', hasPageShell: false },
  { type: 'archive', path: '/archives/', selector: '#archive .article-sort', dataType: 'archive', hasPageShell: false },
]

test.describe('独立特色页面与原版 DOM 契约验收', () => {
  for (const item of PAGE_TYPE_CASES) {
    test(`${item.type} · ${item.path} 返回 200 且命中原版根选择器`, async ({ page }) => {
      const response = await gotoReady(page, item.path)
      expect(response).not.toBeNull()
      expect(response?.status(), `${item.path} 应返回 200`).toBe(200)

      await expect(page.locator('body')).toHaveAttribute('data-type', item.dataType)
      if (item.hasPageShell) {
        await expect(page.locator('#page'), `${item.path} 缺少 #page 外壳`).toHaveCount(1)
      }
      expect(
        await page.locator(item.selector).count(),
        `${item.path} 缺少原版模板根节点 ${item.selector}`,
      ).toBeGreaterThan(0)
      await expect(page).toHaveTitle(/\S+/)
    })
  }

  test('文章页原版沉浸顶图、波浪、Mac 代码框与版权框完整渲染', async ({ page }) => {
    const response = await gotoReady(page, '/posts/a101/')
    expect(response?.status()).toBe(200)

    await expect(page.locator('header#page-header.post-bg')).toHaveCount(1)
    await expect(page.locator('#post-info .post-title')).toBeVisible()
    await expect(page.locator('.main-hero-waves-area')).toBeAttached()
    await expect(page.locator('#post-top-cover #post-top-bg')).toBeAttached()

    // Shiki + 原版 figure.highlight[data-mac="true"] 代码块契约
    const codeFig = page.locator('#article-container figure.highlight[data-mac="true"]').first()
    await expect(codeFig).toBeVisible()
    await expect(codeFig.locator('.highlight-tools .code-lang')).toBeVisible()
    await expect(codeFig.locator('.highlight-tools .copy-button')).toBeVisible()

    // 点击折叠箭头可收起代码块
    await codeFig.locator('.highlight-tools .expand').click()
    await expect(codeFig.locator('.highlight-tools')).toHaveClass(/\bclosed\b/)

    // 版权框与上下篇导航
    await expect(page.locator('.post-copyright .copyright-cc-box')).toBeAttached()
    await expect(page.locator('#card-toc .toc-link').first()).toBeVisible()
  })

  test('首页 HomeTop 今日推荐点击「更多推荐」平滑收起露出 6 宫格', async ({ page }) => {
    await gotoReady(page, '/')
    await expect(page.locator('#home_top #bannerGroup')).toBeVisible()
    await expect(page.locator('#todayCard')).toBeVisible()

    await page.locator('#todayCard-more-btn').click()
    await expect(page.locator('#todayCard')).toHaveClass(/\bhide\b/)
  })
})
