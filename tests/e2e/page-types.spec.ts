/**
 * Phase 4 行为验收：page.type 独立页面冒烟
 *
 * 数据来源：独立页面 fixture（P3-2，`layout: page`）。
 * 路径不是手写的理想值，而是构建产物里真实存在的 13 个 `dist/<path>/index.html`：
 * 12 个 `src/content/page-*.md` + `src/content/about-page.md`。
 *
 * 选择器口径见 docs/notes/phases/P3-2-page-types.md §6.2「各 type 的根选择器（构建产物实测）」。
 * 断言只做「HTTP 200 + layout/page.pug 外壳 + 模板根节点存在」。
 *
 * P4-10 修复（CI 首跑 12 条全挂，A 类用例假设错误）：
 *   旧用例断言 `body[data-type="anzhiyu"]`，但上游 additional-js.pug 的
 *   `anzhiyu.setValueToBodyType()` 会在 DOMContentLoaded 里把 `#page-type` 的值写回
 *   `body.dataset.type` —— 带 `type:` 的独立页面运行时是 `data-type="about"` /
 *   `"categories"` / …，只有缺省分支才是 `"anzhiyu"`。`body[data-type="anzhiyu"]`
 *   在这些页面上永远匹配不到（10s 超时）。
 *   现在按真实契约断言两段：
 *     1. 构建产物：`input#page-type` 的 value 就是该页的 page.type（SSG 侧口径，
 *        缺省分支 `anzhiyu`；album_detail 两个 URL 都是 `album_detail`）；
 *     2. 运行时：`body[data-type]` 被 main.js 同步成同一个值（上游附加 JS 行为）。
 *
 * 唯一例外：`fcircle` 在 demo 配置（theme.config.yml `friends_vue.enable: false`）下
 * 按上游语义整体不产出 DOM，因此只验外壳 `#page > h1.page-title`，不验模板内部节点。
 */
import { expect, gotoReady, test } from './helpers'

type PageTypeCase = {
  /** `[...path].astro` 里的 page.type（缺省分支记作 default） */
  type: string
  /** 构建产物里真实存在的路径（dist/<path>/index.html） */
  path: string
  /** 模板根选择器（P3-2 §6.2 实测） */
  selector: string
  /** `input#page-type` / `body[data-type]` 的期望值（缺省分支回退 `anzhiyu`） */
  dataType: string
}

const PAGE_TYPE_CASES: PageTypeCase[] = [
  { type: 'about', path: '/about/', selector: '#about-page', dataType: 'about' },
  { type: 'categories', path: '/categories/', selector: '#tag-page-tags', dataType: 'categories' },
  { type: 'tags', path: '/tags/', selector: '#tag-page-tags', dataType: 'tags' },
  { type: 'link', path: '/link/', selector: '#article-container .flink', dataType: 'link' },
  { type: 'essay', path: '/essay/', selector: '#essay_page', dataType: 'essay' },
  { type: 'album', path: '/album/', selector: '#album .card-album', dataType: 'album' },
  // album_detail 有两种模板分支，两个 URL 都要覆盖
  {
    type: 'album_detail',
    path: '/album/demo/',
    selector: '#album_detail',
    dataType: 'album_detail',
  },
  {
    type: 'album_detail',
    path: '/album/gallery/',
    selector: '#album_detail .fj-gallery',
    dataType: 'album_detail',
  },
  { type: 'music', path: '/music/', selector: '#anMusic-page', dataType: 'music' },
  {
    type: 'equipment',
    path: '/equipment/',
    selector: '#equipment .equipment-item',
    dataType: 'equipment',
  },
  { type: 'fcircle', path: '/fcircle/', selector: '#page > h1.page-title', dataType: 'fcircle' },
  { type: 'room', path: '/room/', selector: '#room_page', dataType: 'room' },
  // 缺省分支：page.type 为空 → 上游回退 'anzhiyu'
  { type: 'default', path: '/page-default/', selector: '#article-container', dataType: 'anzhiyu' },
]

test.describe('page.type 独立页面冒烟', () => {
  for (const item of PAGE_TYPE_CASES) {
    test(`${item.type} · ${item.path} 返回 200 且模板根节点存在`, async ({ page }) => {
      // 只等 DOMContentLoaded + 主题运行时，不等外部 CDN 资源（CI 外部源可能挂起）
      const response = await gotoReady(page, item.path)
      expect(response, `${item.path} 没有拿到导航响应`).not.toBeNull()
      expect(response?.status(), `${item.path} 应返回 200`).toBe(200)

      // 所有独立页面共用 layout/page.pug 外壳
      await expect(page.locator('body[data-type]')).toBeAttached()
      await expect(page.locator('#page'), `${item.path} 缺少 #page 外壳`).toHaveCount(1)
      // 模板根节点可能存在多个同级实例（如 equipment 的多件设备），只要命中即可
      expect(
        await page.locator(item.selector).count(),
        `${item.path}（page.type=${item.type}）缺少模板根节点 ${item.selector}`,
      ).toBeGreaterThan(0)

      // 页面有可读标题（<title> 非空）
      await expect(page).toHaveTitle(/\S+/)

      // 构建产物契约：additional-js.pug:77 的 input#page-type 携带真实 page.type
      await expect(
        page.locator('input#page-type'),
        `${item.path} 的 input#page-type 应为 ${item.dataType}`,
      ).toHaveAttribute('value', item.dataType)

      // 运行时契约：main.js 的 setValueToBodyType() 把 page.type 回写到 body
      await expect(
        page.locator('body'),
        `${item.path} 运行时 body[data-type] 应为 ${item.dataType}`,
      ).toHaveAttribute('data-type', item.dataType)
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
