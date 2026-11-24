/**
 * Phase 4 行为验收：page.type 独立页面冒烟
 *
 * 数据来源：examples/blog 的独立页面 fixture（P3-2，`layout: page`）。
 * 路径不是手写的理想值，而是构建产物里真实存在的 13 个 `dist/<path>/index.html`：
 * 12 个 `fixtures/page-*.md` + `fixtures/about-page.md`。
 *
 * 选择器口径见 docs/notes/P3-2-page-types.md §6.2「各 type 的根选择器（构建产物实测）」。
 * 断言只做「HTTP 200 + layout/page.pug 外壳 + 模板根节点存在」，交互留给其他用例。
 *
 * 唯一例外：`fcircle` 在 demo 配置（theme.config.yml `friends_vue.enable: false`）下
 * 按上游语义整体不产出 DOM，因此只验外壳 `#page > h1.page-title`，不验模板内部节点。
 */
import { expect, test } from '@playwright/test'

type PageTypeCase = {
  /** `[...path].astro` 里的 page.type（缺省分支记作 default） */
  type: string
  /** 构建产物里真实存在的路径（dist/<path>/index.html） */
  path: string
  /** 模板根选择器（P3-2 §6.2 实测） */
  selector: string
}

const PAGE_TYPE_CASES: PageTypeCase[] = [
  { type: 'about', path: '/about/', selector: '#about-page' },
  { type: 'categories', path: '/categories/', selector: '#tag-page-tags' },
  { type: 'tags', path: '/tags/', selector: '#tag-page-tags' },
  { type: 'link', path: '/link/', selector: '#article-container .flink' },
  { type: 'essay', path: '/essay/', selector: '#essay_page' },
  { type: 'album', path: '/album/', selector: '#album .card-album' },
  // album_detail 有两种模板分支，两个 URL 都要覆盖
  { type: 'album_detail', path: '/album/demo/', selector: '#album_detail' },
  { type: 'album_detail', path: '/album/gallery/', selector: '#album_detail .fj-gallery' },
  { type: 'music', path: '/music/', selector: '#anMusic-page' },
  { type: 'equipment', path: '/equipment/', selector: '#equipment .equipment-item' },
  { type: 'fcircle', path: '/fcircle/', selector: '#page > h1.page-title' },
  { type: 'room', path: '/room/', selector: '#room_page' },
  { type: 'default', path: '/page-default/', selector: '#article-container' },
]

test.describe('page.type 独立页面冒烟', () => {
  for (const item of PAGE_TYPE_CASES) {
    test(`${item.type} · ${item.path} 返回 200 且模板根节点存在`, async ({ page }) => {
      const response = await page.goto(item.path)
      expect(response, `${item.path} 没有拿到导航响应`).not.toBeNull()
      expect(response?.status(), `${item.path} 应返回 200`).toBe(200)

      // 所有独立页面共用 layout/page.pug 外壳
      await expect(page.locator('body[data-type="anzhiyu"]')).toBeAttached()
      await expect(page.locator('#page'), `${item.path} 缺少 #page 外壳`).toHaveCount(1)
      // 模板根节点可能存在多个同级实例（如 equipment 的多件设备），只要命中即可
      expect(
        await page.locator(item.selector).count(),
        `${item.path}（page.type=${item.type}）缺少模板根节点 ${item.selector}`,
      ).toBeGreaterThan(0)

      // 页面有可读标题（<title> 非空）
      await expect(page).toHaveTitle(/\S+/)
    })
  }

  test('用例数据覆盖全部 12 种 page.type', () => {
    const covered = new Set(PAGE_TYPE_CASES.map((item) => item.type))
    expect(
      [...covered].sort(),
      `page.type 覆盖没有达到 P3-2 的 12 种：实际 ${[...covered].join(', ')}`,
    ).toEqual(
      [
        'about',
        'album',
        'album_detail',
        'categories',
        'default',
        'equipment',
        'essay',
        'fcircle',
        'link',
        'music',
        'room',
        'tags',
      ].sort(),
    )
    // URL 数应 ≥ 12（album_detail 有两个真实 URL）且路径唯一
    expect(PAGE_TYPE_CASES.length).toBeGreaterThanOrEqual(12)
    expect(new Set(PAGE_TYPE_CASES.map((item) => item.path)).size).toBe(PAGE_TYPE_CASES.length)
  })
})
