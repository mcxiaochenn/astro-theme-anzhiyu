/**
 * site-stats.ts — aside 卡片共用的「站点统计」数据层（P3-1）。
 *
 * 上游这些卡片读的是 Hexo 的全局变量：
 *   - `site.posts`                → 最近文章 / 归档 / 文章总数
 *   - `site.tags`                 → 标签云
 *   - `site.categories`           → 分类卡
 *   - `totalcount(site)`          → 全站字数
 *
 * Astro 侧唯一的等价数据源是内容集合 `posts`（与 BaseLayout 同口径：
 * `layout: 'page'` 的独立页面不算 Post）。本模块把这几次投影集中算一次，
 * 并用模块级 Promise 缓存避免每个页面重复扫描集合。
 *
 * 已知限制（Phase 7 站点配置层接管后消除）：时区固定为基准站 `Asia/Shanghai`，
 * 因为主题配置（`theme.*`）里没有站点级 `timezone` / `language`；
 * 与 `components/post/post-list.ts` 的处理方式一致。
 */
import { getCollection } from 'astro:content'
import {
  preparePosts,
  slugize,
  type PostEntryLike,
  type PreparedPost,
} from '../components/post/post-list.ts'
import { flattenCategories } from '../components/post/post-list.ts'
import { createUrlFor, type PostHrefResolver } from '../layouts/site.ts'
import { stripHtml } from '../utils/helpers.ts'
import { DEFAULT_SITE_TIMEZONE } from '../utils/date.ts'

// 子路径部署跟随 Astro base（import.meta.env.BASE_URL），与页面侧 urlFor 同口径
const urlFor = createUrlFor(import.meta.env.BASE_URL || '/')

/** 标签云需要的最小投影（`site.tags`）。 */
export interface SiteTagItem {
  name: string
  path: string
  length: number
}

/** 分类卡需要的最小投影（`site.categories`，带 parent 层级）。 */
export interface SiteCategoryItem {
  _id: string
  name: string
  path: string
  length: number
  parent: string | null
}

/** 最近文章：`PreparedPost` + frontmatter 原始 `cover`。 */
export interface RecentPostItem {
  post: PreparedPost
  /**
   * `article.cover` 原值。最近文章卡的条件是
   * `article.cover === false || !theme.cover.aside_enable`，
   * 不能复用 `PreparedPost.cover`（那一层已经套用了 `cover.default_cover`）。
   */
  cover: unknown
}

export interface SiteStats {
  /** 全站文章（不含 `layout: page`），按 date 降序、同日期 path 码点升序。 */
  recentPosts: RecentPostItem[]
  /** 归档卡入参：只需要日期（`asideArchives` 内部自行排序）。 */
  archivePosts: Array<{ date: Date }>
  /** `site.posts.length`。 */
  postCount: number
  /** `site.tags` 的投影，按 name 码点升序。 */
  tags: SiteTagItem[]
  /** `site.categories` 的投影（含每级节点），按 name 码点升序。 */
  categories: SiteCategoryItem[]
  /** `totalcount(site)`：全站字数（未启用 wordcount 时不会渲染）。 */
  totalWordCount: number
}

/** 站点统计的入参：文章 permalink 解析器（见 `layouts/site.ts`，可缺省）。 */
export interface SiteStatsOptions {
  resolvePostHref?: PostHrefResolver
}

/**
 * 按解析器分别缓存：不同解析器算出的文章 URL 不同，不能共用一份结论文档。
 * fixture 站点（无解析器）与迁移站（有解析器）不会出现在同一次构建里，
 * 这里按 key 建表只是为了避免「先算了一份不带解析器的结果」污染后续页面。
 */
const cached = new Map<PostHrefResolver | null, Promise<SiteStats>>()

/**
 * 读取并缓存站点统计。
 *
 * 缓存的是 Promise，并发页面同时请求也只会算一次；模块作用域的生命周期
 * 与一次 Astro 构建进程一致。dev 模式下内容集合变更会重建模块，缓存随之失效。
 */
export function getSiteStats(options: SiteStatsOptions = {}): Promise<SiteStats> {
  const resolver = options.resolvePostHref ?? null
  let pending = cached.get(resolver)
  if (!pending) {
    pending = computeSiteStats(resolver)
    cached.set(resolver, pending)
  }
  return pending
}

async function computeSiteStats(resolvePostHref: PostHrefResolver | null): Promise<SiteStats> {
  const entries = (await getCollection('posts')) as unknown as PostEntryLike[]
  const postEntries = entries.filter((entry) => entry.data.layout !== 'page')
  const prepared = preparePosts(entries, { resolvePostHref: resolvePostHref ?? undefined })

  /* ------------------------------------------------------------------ */
  /* 1. 最近文章（date 降序；同日期 path 码点升序）                        */
  /* ------------------------------------------------------------------ */

  const coverById = new Map(postEntries.map((entry) => [entry.id, entry.data.cover]))
  const recentPosts: RecentPostItem[] = prepared
    .map((post) => ({ post, cover: coverById.get(post.id) }))
    .sort((a, b) => {
      const byDate = b.post.date.xml.localeCompare(a.post.date.xml)
      if (byDate !== 0) return byDate
      return a.post.path < b.post.path ? -1 : a.post.path > b.post.path ? 1 : 0
    })

  /* ------------------------------------------------------------------ */
  /* 2. 归档（asideArchives 自己排序，这里只保证是 Date）                 */
  /* ------------------------------------------------------------------ */

  const archivePosts = postEntries.map((entry) => {
    const value = entry.data.date
    return { date: value instanceof Date ? value : new Date(0) }
  })

  /* ------------------------------------------------------------------ */
  /* 3. 标签（`site.tags`：去重 + 计数；路径同 PostCard 的 tagHref）        */
  /* ------------------------------------------------------------------ */

  const tagCounts = new Map<string, number>()
  for (const entry of postEntries) {
    const tags = entry.data.tags
    if (!Array.isArray(tags)) continue
    for (const tag of tags) {
      if (typeof tag !== 'string' || !tag) continue
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const tags: SiteTagItem[] = [...tagCounts.entries()]
    .map(([name, length]) => ({
      name,
      path: `tags/${encodeURI(slugize(name))}/`,
      length,
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  /* ------------------------------------------------------------------ */
  /* 4. 分类（Hexo `setCategories` 的嵌套链，每级都是一个节点）             */
  /* ------------------------------------------------------------------ */

  const categoryCounts = new Map<string, { name: string; length: number }>()
  for (const entry of postEntries) {
    for (const item of flattenCategories(entry.data.categories)) {
      const current = categoryCounts.get(item.path)
      if (current) current.length++
      else categoryCounts.set(item.path, { name: item.name, length: 1 })
    }
  }
  const categories: SiteCategoryItem[] = [...categoryCounts.entries()]
    .map(([categoryPath, info]) => {
      const segments = categoryPath.split('/')
      // Hexo `Category.path`：`categories/<逐段 slugize 后的分类链>/`（P7-4）。
      const slugPath = segments.map((segment) => slugize(segment)).join('/')
      return {
        _id: categoryPath,
        name: info.name,
        path: `categories/${slugPath}/`,
        length: info.length,
        parent: segments.length > 1 ? segments.slice(0, -1).join('/') : null,
      }
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  /* ------------------------------------------------------------------ */
  /* 5. 全站字数（`totalcount(site)` 的近似实现）                         */
  /* ------------------------------------------------------------------ */

  const totalWordCount = postEntries.reduce(
    (sum, entry) => sum + countWords(entry.rendered?.html ?? ''),
    0,
  )

  return {
    recentPosts,
    archivePosts,
    postCount: postEntries.length,
    tags,
    categories,
    totalWordCount,
  }
}

/**
 * `hexo-wordcount` 的 `count()` 近似：去掉 HTML 后，CJK 字符逐字计数，
 * 连续的拉丁字母/数字串算一个词。
 *
 * 只在 `theme.wordcount.enable && total_wordcount` 时用到；基准站与示例站都关闭，
 * 因此这里不追求与 `hexo-wordcount` 逐字一致（差异仅在开启该功能时可见）。
 */
function countWords(html: string): number {
  const text = stripHtml(html)
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
  return cjk + latin
}

/** 基准站时区；`asideArchives` 需要它来解释 frontmatter 日期。 */
export const SITE_TIME_ZONE = DEFAULT_SITE_TIMEZONE

/** 站点语言（moment locale 用）；Phase 7 前固定为基准站值。 */
export const SITE_LANGUAGE = 'zh-CN'

/** 站内链接：根路径为 `/`（Phase 7 前与 BaseLayout 同口径）。 */
export { urlFor as siteUrlFor }
