/**
 * P2-9 / P2-10 · 归档 / 分类 / 标签 / 404 的站点数据适配层。
 *
 * 三件事在这里收口，页面只负责路由与布局：
 *   1. 从 examples/blog 的内容集合取文章（排除 `layout: page` 的独立页面），
 *      算出 hexo 语义的 path / 日期 / 封面，并按 date 降序（Hexo 三个 generator 的排序）；
 *   2. 从 frontmatter 的 categories / tags 建分类树与标签索引（包含父分类展开、计数）；
 *   3. 把上游 helper 需要的注入点（`url_for` / `_p` / `date` / archive_generator 配置）绑好。
 *
 * 上游对应物：
 *   - hexo-generator-archive / category / tag：负责分页与 `page.current`；
 *   - `scripts/helpers/catalog_list.js` / `tags_page_list.js` / `findArchiveLength.js`
 *     / page.js 的 `findArchivesTitle`：直接调用 `astro-theme-anzhiyu/utils/helpers.ts`
 *     里已经与上游 oracle 对拍过的移植，不在这里重写业务规则。
 *
 * 为什么放在 `pages/archives/` 下：本阶段的写范围只覆盖 archives / categories / tags 三个页面目录，
 * 而三个目录的页面都要用这层数据。文件名以 `_` 开头，Astro 路由会忽略它（只当模块用）。
 * Phase 7 站点配置层（`_config.yml` 迁移）落地后，这里应该拆成：
 *   - 站点元数据 → 站点配置文件；
 *   - 文章 path/date 计算 → 内容集合的公共查询层（P2-8 文章页也要用同样的 permalink 规则）。
 */
import { getCollection } from 'astro:content'
import {
  catalogList,
  compareValues,
  findArchivesTitle,
  getArchiveLength,
  tagsPageList,
  type Translate,
} from 'astro-theme-anzhiyu/utils/helpers.ts'
import { createSiteDateFormatter } from 'astro-theme-anzhiyu/utils/date.ts'
import { postSlugOf } from 'astro-theme-anzhiyu/utils/url-utils.ts'
import { t } from 'astro-theme-anzhiyu/i18n/index.ts'
import type { ArticleSortPost } from 'astro-theme-anzhiyu/components/archive/types.ts'
import { SITE_IDENTITY } from '../../data/site-identity.ts'

/* ==================================================================== */
/* 站点级配置（基准站 .baseline-work/_config.yml）                        */
/* ==================================================================== */

/** 基准站 `_config.yml` 的 `timezone`。 */
export const SITE_TIMEZONE = 'Asia/Shanghai'
/** 基准站 `_config.yml` 的 `language`。 */
export const SITE_LANGUAGE = 'zh-CN'
/** 基准站 `_config.yml` 的 `date_format`。 */
export const DATE_FORMAT = 'YYYY-MM-DD'
/** 基准站 `_config.yml` 的 `time_format`。 */
export const TIME_FORMAT = 'HH:mm:ss'
/** 基准站 `_config.yml` 的 `per_page`（站点级，文章列表序号基数）。 */
export const SITE_PER_PAGE = 6
/** 基准站 `archive_generator.per_page`。 */
export const ARCHIVE_PER_PAGE = 6
/** 基准站 `category_generator.per_page`。 */
export const CATEGORY_PER_PAGE = 6
/** 基准站 `tag_generator.per_page`。 */
export const TAG_PER_PAGE = 6

/** 基准站 `_config.yml` 的 `archive_generator` 块（findArchiveLength 直接读它）。 */
const ARCHIVE_GENERATOR = {
  enable: true,
  per_page: ARCHIVE_PER_PAGE,
  yearly: true,
  monthly: true,
  daily: false,
}

/**
 * 站点级元数据。Phase 2 还没有站点配置层（Phase 7 迁移脚本才落 `_config.yml`），
 * 与 `index.astro` 里那份保持一致；四个页面共用这一份，避免各页漂移。
 */
export interface SiteMeta {
  title: string
  subtitle: string
  description: string
  keywords: string
  author: string
  language: string
  url: string
  root: string
}

export const BASELINE_SITE: SiteMeta = SITE_IDENTITY

/** 与 `src/i18n` 的 `t()` 绑定站点语言后的 `_p()`（上游 `this._p`）。 */
const translate: Translate = (key, ...args) => t(key, SITE_LANGUAGE, ...args)

/**
 * 上游 `page.path` → `og:url`（Hexo 的 `full_url_for(page.path)`）。
 *
 * Hexo 的 archive / category / tag generator 生成的页面 `path` 以 `index.html` 结尾
 * （`archives/index.html`、`archives/2025/04/index.html`、`categories/前端/index.html`），
 * 所以基准产物的 `og:url` 带 `index.html`，而 `canonical` 经 `urlNoIndex()` 去掉它。
 * `Head.astro` 已经暴露 `pageUrl` prop，页面按这个语义传进来即可。
 *
 * `pathname` 用 `Astro.url.pathname`（已是 percent-encoding 形式，与 `url_for` 结果一致）。
 */
export function hexoPageUrl(site: SiteMeta, pathname: string): string {
  const origin = site.url.replace(/\/+$/, '')
  const rooted = pathname.endsWith('/') ? pathname : `${pathname}/`
  return `${origin}${rooted}index.html`
}

/** 404 页的 `page.path` 就是 `404.html`（上游 404 generator 的 path 原样）。 */
export function hexoNotFoundPageUrl(site: SiteMeta): string {
  // 子路径部署（root ≠ '/'）时 404 页挂在 root 之下，不能写死根路径
  const root = (site.root || '/').replace(/\/+$/, '')
  return `${site.url.replace(/\/+$/, '')}${root}/404.html`
}

/** 站点时区日期格式化器：`date()` / `full_date()` / `date_xml()` 的等价实现。 */
const dateFormatter = createSiteDateFormatter({
  timezone: SITE_TIMEZONE,
  language: SITE_LANGUAGE,
  dateFormat: DATE_FORMAT,
  timeFormat: TIME_FORMAT,
})

/** 上游 `url_for()`：站内路径拼 `BASELINE_SITE.root` 前缀 + 非 ASCII 编码（子路径部署兼容）。 */
export function urlFor(path: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(path) || path.startsWith('data:')) return path
  const root = (BASELINE_SITE.root || '/').replace(/\/+$/, '')
  const rooted = path.startsWith('/') ? path : `/${path}`
  return encodeURI(`${root}${rooted}`)
}

/* ==================================================================== */
/* 文章                                                                  */
/* ==================================================================== */

export interface ArchivePost {
  title: string
  /** 文章路径（`url_for` 编码后）。 */
  href: string
  /** `false` = 无封面（上游 random_cover 过滤器在无 cover 且 default_cover 为空时落成 false）。 */
  cover: string | false
  date: Date
  /** 站点时区下的年份（`date(post.date, 'YYYY')`）。 */
  yearLabel: string
  year: number
  month: number
  /** `date_xml()`。 */
  isoDate: string
  /** `date(post.date, config.date_format)`。 */
  dateDisplay: string
  /** `_p('post.created') + ' ' + full_date(post.date)`。 */
  dateTitle: string
  /** 标签（`href` 为 `url_for` 后的编码路径）。 */
  tags: Array<{ name: string; href: string }>
  /** frontmatter 里的分类路径（层级原样，如 `[['前端', 'Astro'], ['工程实践']]`）。 */
  categoryPaths: string[][]
}

/**
 * frontmatter 的 `categories` → 若干条分类路径。这里必须复刻 Hexo `Post.setCategories()`
 * 的两个分支（`.baseline-work/node_modules/hexo/dist/models/post.js`）：
 *
 *  - **只要有一个元素是数组**（`hasHierarchy === true`）→ 每个元素各自是一条分类：
 *       `- - 前端` `- - Astro` / `- 工程实践`  →  `[['前端', 'Astro'], ['工程实践']]`
 *  - **全是字符串**（`hasHierarchy === false`）→ **整个数组是一条层级路径**，
 *    被当成 `addHierarchy(cats)` 走：
 *       `- 前端` `- Hexo`  →  `[['前端', 'Hexo']]`（不是「前端」「Hexo」两个平级分类！）
 *
 * 第二条是最容易移植错的地方：基准站 `/categories/前端/Hexo/` 就是这么来的，
 * 而 `longform-hexo-astro.md` 的 frontmatter 写的是普通的两项列表。
 */
function normalizeCategoryPaths(raw: readonly unknown[]): string[][] {
  const names = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  const nonEmpty = raw.filter((item) => typeof item === 'string' || Array.isArray(item))
  if (nonEmpty.length === 0) return []
  const hasHierarchy = nonEmpty.some((item) => Array.isArray(item))
  if (hasHierarchy) {
    return nonEmpty
      .map((item) => (Array.isArray(item) ? names(item) : [String(item)]))
      .filter((path) => path.length > 0)
  }
  const flat = nonEmpty.filter((item): item is string => typeof item === 'string')
  return flat.length > 0 ? [flat] : []
}

function toArchivePost(entry: Awaited<ReturnType<typeof getCollection<'posts'>>>[number]): ArchivePost {
  const data = entry.data as Record<string, unknown>
  const date = data.date instanceof Date ? data.date : new Date(0)
  const parts = dateFormatter.parts(date)
  const year = parts.year
  const month = parts.month
  const day = parts.day
  const coverValue = data.cover
  const tagNames = Array.isArray(data.tags)
    ? data.tags.filter((tag): tag is string => typeof tag === 'string')
    : []
  const rawCategories = Array.isArray(data.categories) ? data.categories : []
  const categoryPaths = normalizeCategoryPaths(rawCategories)

  return {
    title: typeof data.title === 'string' ? data.title : entry.id,
    // B4：末段走 postSlugOf()（abbrlink ?? id），与文章路由 / post-list.ts 共用。
    href: urlFor(`/${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${postSlugOf(entry)}/`),
    cover: typeof coverValue === 'string' && coverValue ? coverValue : false,
    date,
    yearLabel: String(year),
    year,
    month,
    isoDate: dateFormatter.xml(date),
    dateDisplay: dateFormatter.date(date),
    dateTitle: `${translate('post.created')} ${dateFormatter.fullDate(date)}`,
    // Hexo 的 `article.tags.data` 是按名字升序的 Query（基准产物里 `封面/图片` 也输出成 `图片/封面`），
    // article-sort 模板直接按这个顺序渲染，所以这里先排好。
    tags: [...tagNames]
      .sort((a, b) => compareValues(a, b))
      .map((name) => ({ name, href: urlFor(`tags/${taxonomySlug(name)}/`) })),
    categoryPaths,
  }
}

/**
 * Hexo `Category.slug` / `Tag.slug`：`hexo-util` 的 `slugize(name, { transform: filename_case })`。
 * 关键行为：连续的空白/特殊符号折叠成 `category_dir` 里的一段连字符——
 * 分类「Arch Linux」的 path 是 `categories/Arch-Linux/`，不是带空格的原名。
 * （hexo/dist/models/category.js:12-24；真实站 URL 实证。）
 */
export function taxonomySlug(name: string): string {
  return name
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*(){}[\];:"'<,.>?/\\|_+=-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* ==================================================================== */
/* 分类 / 标签                                                           */
/* ==================================================================== */

export interface CategoryTerm {
  /** 层级 id：`前端/Astro`。 */
  id: string
  /** 分类名（末级，如 `Astro`）。 */
  name: string
  /** Hexo `category.path`（无前导 `/`，未编码），喂给 `catalog_list`。 */
  path: string
  parentId: string | null
  /** 该分类（含层级展开的父分类）下的文章，date 降序。 */
  posts: ArchivePost[]
}

export interface TagTerm {
  name: string
  /** Hexo `tag.path`（无前导 `/`，未编码），喂给 `tags_page_list`。 */
  path: string
  posts: ArchivePost[]
}

export interface ArchiveSiteData {
  posts: ArchivePost[]
  categories: CategoryTerm[]
  tags: TagTerm[]
  /** 上游 `_p`（绑定站点语言）。 */
  t: Translate
}

/** 分类展开成「自身 + 所有父级」的层级 id 列表（Hexo 里父分类页也会包含子分类文章）。 */
function categoryIdsOf(path: string[][]): string[][] {
  const seen = new Set<string>()
  const result: string[][] = []
  for (const segments of path) {
    for (let depth = 1; depth <= segments.length; depth++) {
      const prefix = segments.slice(0, depth)
      const id = prefix.join('/')
      if (seen.has(id)) continue
      seen.add(id)
      result.push(prefix)
    }
  }
  return result
}

function buildCategories(posts: ArchivePost[]): CategoryTerm[] {
  const map = new Map<string, CategoryTerm>()
  for (const post of posts) {
    for (const segments of categoryIdsOf(post.categoryPaths)) {
      const id = segments.join('/')
      let term = map.get(id)
      if (!term) {
        term = {
          id,
          name: segments[segments.length - 1],
          path: `categories/${segments.map(taxonomySlug).join('/')}/`,
          parentId: segments.length > 1 ? segments.slice(0, -1).join('/') : null,
          posts: [],
        }
        map.set(id, term)
      }
      term.posts.push(post)
    }
  }
  return [...map.values()]
}

function buildTags(posts: ArchivePost[]): TagTerm[] {
  const map = new Map<string, TagTerm>()
  for (const post of posts) {
    for (const tag of post.tags) {
      let term = map.get(tag.name)
      if (!term) {
        term = { name: tag.name, path: `tags/${taxonomySlug(tag.name)}/`, posts: [] }
        map.set(tag.name, term)
      }
      // 同一篇文章重复写同名 tag 时只计一次（Hexo 的 tag 关系也是集合语义）
      if (term.posts[term.posts.length - 1] !== post) term.posts.push(post)
    }
  }
  return [...map.values()]
}

let cached: Promise<ArchiveSiteData> | null = null

/**
 * 读取并缓存站点归档数据。
 *
 * Astro 的 `getStaticPaths` 与页面 frontmatter 会各调用一次，模块级缓存避免重复遍历集合
 * （构建期单进程，不存在跨请求状态）。
 */
export function loadArchiveSite(): Promise<ArchiveSiteData> {
  if (cached) return cached
  cached = (async () => {
    const entries = await getCollection('posts')
    const posts = entries
      // 独立页面（about 页：layout: page）不属于归档 / 分类 / 标签（Hexo 里它在 source/about/，
      // 不在 _posts，因此不进 site.posts）
      .filter((entry) => entry.data.layout !== 'page')
      .map(toArchivePost)
      // Hexo 三个 generator 都用 `sort('date', -1)`
      .sort((a, b) => b.date.getTime() - a.date.getTime())

    return {
      posts,
      categories: buildCategories(posts),
      tags: buildTags(posts),
      t: translate,
    }
  })()
  return cached
}

/* ==================================================================== */
/* 分页                                                                  */
/* ==================================================================== */

/** 总页数（Hexo 分页器：空列表也渲染第 1 页）。 */
export function pageCount(totalItems: number, perPage: number): number {
  return Math.max(1, Math.ceil(totalItems / perPage))
}

/** 取第 `current` 页的片段（1 起）。 */
export function slicePage<T>(items: readonly T[], perPage: number, current: number): T[] {
  const start = (current - 1) * perPage
  return items.slice(start, start + perPage)
}

/* ==================================================================== */
/* 归档页标题 / 计数（上游 findArchivesTitle / getArchiveLength）          */
/* ==================================================================== */

export interface ArchivePageLike {
  /** 年份字符串，如 `2025`；归档首页为 undefined。 */
  year?: string
  /** 月份字符串（两位），如 `04`；年归档为 undefined。 */
  month?: string
}

/**
 * 上游 `findArchivesTitle(page, theme.menu, date)`。
 *
 * 唯一需要适配的点：helper 里 `page.month` 是数字，拼出来是 `2025-4`；moment 能解析这种
 * 非补零写法，而 `date.ts` 的 `parseHexoDate` 要求 `YYYY-MM-DD`。这里在注入的 `formatDate`
 * 里把 `YYYY-M` 解释成「该月 1 日」，与 moment 的行为一致（`MMMM YYYY` → `四月 2025`）。
 */
export function archivesTitle(page: ArchivePageLike, data: ArchiveSiteData): string {
  if (!page.year) return data.t('page.archives')
  const year = Number(page.year)
  if (page.month) {
    const month = Number(page.month)
    return findArchivesTitle({ year, month }, null, {
      archiveFormat: 'MMMM YYYY',
      t: data.t,
      formatDate: (value, format) => {
        const match = /^(\d{4})-(\d{1,2})$/.exec(String(value))
        if (match) {
          return dateFormatter.format(
            new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)),
            format,
          )
        }
        return dateFormatter.format(value as never, format)
      },
    })
  }
  return findArchivesTitle({ year }, null, {
    archiveFormat: 'MMMM YYYY',
    t: data.t,
    formatDate: (value, format) => dateFormatter.format(value as never, format),
  })
}

/** 上游 `getArchiveLength()`：当前归档页（年/月）对应的文章数；归档首页 = 全部文章数。 */
export function archivesPostCount(data: ArchiveSiteData, page: ArchivePageLike): number {
  return getArchiveLength({
    posts: data.posts,
    page: {
      year: page.year ? Number(page.year) : null,
      month: page.month ? Number(page.month) : null,
    },
    archiveGenerator: ARCHIVE_GENERATOR,
    timezone: SITE_TIMEZONE,
  })
}

/** `.article-sort-title` 的文本（`文章总览 - N`）。 */
export function articlesSortTitle(data: ArchiveSiteData, page: ArchivePageLike): string {
  return `${data.t('page.articles')} - ${archivesPostCount(data, page)}`
}

/**
 * `ArticleSort` 组件的输入：把 `ArchivePost` 映射成展示字段。
 *
 * 单独做一层是因为 `ArticleSort` 在主题包里（拿不到内容集合的类型），
 * 只认识「标题 / 路径 / 封面 / 三个日期文本 / 年份 / 标签」这些渲染字段。
 */
export function toArticleSortPosts(posts: readonly ArchivePost[]): ArticleSortPost[] {
  return posts.map((post) => ({
    title: post.title,
    href: post.href,
    cover: post.cover,
    isoDate: post.isoDate,
    dateDisplay: post.dateDisplay,
    dateTitle: post.dateTitle,
    yearLabel: post.yearLabel,
    tags: post.tags,
  }))
}

/** 按年/月过滤文章（date 已降序，过滤后保持顺序）。 */
export function filterArchivePosts(
  data: ArchiveSiteData,
  page: ArchivePageLike,
): ArchivePost[] {
  if (!page.year) return data.posts
  const year = Number(page.year)
  if (!page.month) return data.posts.filter((post) => post.year === year)
  const month = Number(page.month)
  return data.posts.filter((post) => post.year === year && post.month === month)
}

/* ==================================================================== */
/* 分类 / 标签页                                                          */
/* ==================================================================== */

/** `catalog_list("categories")` 的输入：按 name 升序（基准产物里的顺序）。 */
function catalogItems(categories: readonly CategoryTerm[]): Array<{ path: string; name: string }> {
  return [...categories]
    .sort((a, b) => compareValues(a.name, b.name))
    .map((term) => ({ path: term.path, name: term.name }))
}

/** `#catalog-list` 的 HTML（含上游缩进与换行，直接 set:html）。 */
export function catalogListHtml(categories: readonly CategoryTerm[]): string {
  return catalogList(catalogItems(categories))
}

/**
 * `tags_page_list("tags")` 的输入。
 *
 * helper 内部按「文章数降序、相同篇数保持入参顺序」插入；基准产物里相同篇数的标签是
 * 按名字升序的，所以入参先按 name 升序排好（等价于 Hexo locals 的迭代顺序）。
 */
export function sortedTagsForPage(tags: readonly TagTerm[]): Array<{ name: string; path: string; length: number }> {  return [...tags]
    .sort((a, b) => compareValues(a.name, b.name))
    .map((term) => ({ name: term.name, path: term.path, length: term.posts.length }))
}

/** `#tag-page-tags` 的 HTML（上游 helper 原样输出，含换行与缩进）。 */
export function tagsPageListHtml(tags: readonly TagTerm[]): string {
  return tagsPageList(sortedTagsForPage(tags))
}

/** 分类/标签页 URL（`url_for` 语义：非 ASCII 段做 percent-encoding），分页链接的根。 */
export function encodedTermUrl(term: CategoryTerm | TagTerm): string {
  return urlFor(term.path)
}
