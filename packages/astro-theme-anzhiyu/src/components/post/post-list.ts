/**
 * post-list.ts — 首页文章列表的「数据准备层」（P2-7）。
 *
 * 上游对应关系：
 *   - `hexo-generator-index/lib/generator.js`：取 `locals.posts` → 按 `index_generator.order_by`
 *     （基准 `_config.yml`: `-date`）排序 → `posts.data.sort((a,b) => (b.sticky||0)-(a.sticky||0))`
 *     → `hexo-pagination` 按 `index_generator.per_page`（基准为 6）切成多页；
 *   - `layout/includes/mixins/post-ui.pug`：`+postUI` 渲染每张卡片，卡片里用到的
 *     `article.title / cover / top / sticky / categories.data / tags.data / date / updated /
 *     content / description` 都在这里整理成纯数据。
 *
 * 站点侧的两个页面（`index.astro` 第 1 页、`[...page].astro` 第 2..N 页）共用本模块，
 * 避免排序/分页/摘要三套语义各写一份。主题包里不碰 `astro:content`，入参是结构化的
 * 集合条目（只用到 `id / data / rendered.html`），所以本模块可以在任何 Astro 站点里复用。
 *
 * 排序与展示顺序的上游可复现口径（`.baseline-work/scripts/reproducible.js`）：
 *   - 文章列表：date 降序，同日期按 path 码点升序；
 *   - 标签 / 分类展示顺序：name 码点升序。
 *
 * 已知限制（Phase 7 站点配置层接管后消除）：
 *   - `per_page` / `timezone` / `date_format` / `time_format` 现在取基准站 `_config.yml` 的值；
 *   - `url_for()` 只实现 root 前缀，不含 CDN 解析（与 `layouts/site.ts` 同口径）。
 */
import { stripHtml, sortAttrPost } from '../../utils/helpers.ts'
import { createSiteDateFormatter, type SiteDateConfig } from '../../utils/date.ts'
import { getThemeConfig } from '../../layouts/theme-context.ts'
import { createUrlFor, postSlugOf, type PostHrefResolver } from '../../layouts/site.ts'

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/**
 * Hexo `_config.yml` 的 `index_generator.per_page`（基准站为 6）。
 *
 * 注意它不是主题配置：主题 `_config.yml` 里没有首页 per_page（`theme.config.yml` 里出现的
 * per_page 都属于 algolia / mathjax 这类子配置）。Phase 7 把站点配置层落下来之前，这里先按
 * 基准站的值固定，两个页面共用。
 */
export const INDEX_PER_PAGE = 6

/** 基准站 `_config.yml` 的 `timezone: 'Asia/Shanghai'`。 */
export const SITE_TIME_ZONE = 'Asia/Shanghai'

/** 基准站 `_config.yml` 的 `date_format` / `time_format`。 */
const SITE_DATE_FORMAT = 'YYYY-MM-DD'
const SITE_TIME_FORMAT = 'HH:mm:ss'

/** 上游 `lazyload` 过滤器在未配置 placeholder 时用的 1×1 透明 gif（post_lazyload.js:13）。 */
export const LAZYLOAD_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const urlFor = createUrlFor('/')

/* ------------------------------------------------------------------ */
/* 输入类型：astro:content 集合条目的结构化子集                          */
/* ------------------------------------------------------------------ */

/** 内容集合条目的最小形状（只声明本模块用到的字段，避免把 astro 类型带进主题包）。 */
export interface PostEntryLike {
  id: string
  data: Record<string, unknown>
  /** glob loader 在构建期提供的 markdown 渲染结果（未渲染时可能为空）。 */
  rendered?: { html?: string } | null
}

/* ------------------------------------------------------------------ */
/* 输出类型                                                            */
/* ------------------------------------------------------------------ */

/** 一个日期在卡片上的三种上游表示（`date()` / `full_date()` / `date_xml()`）。 */
export interface HexoDateInfo {
  /** `date_xml(value)`：`<time datetime>` 用的 UTC ISO 串。 */
  xml: string
  /** `date(value, config.date_format)`：卡片可见文本。 */
  display: string
  /** `full_date(value)`：`<time title>` 与 `time` 属性用。 */
  full: string
}

/** 卡片上的分类项（post-ui.pug 里渲染成 `.article-categories-original`，只有名字）。 */
export interface PostCategoryItem {
  name: string
  /** 分类路径（不含 `/categories/` 前缀），如 `前端/Astro`；给 P2-9 的分类路由预留。 */
  path: string
}

/** 卡片上的标签项（post-ui.pug 里渲染成 `a.article-meta__tags`）。 */
export interface PostTagItem {
  name: string
  /** `url_for(item.path)`：url_for('/tags/<slug>/')，非 ASCII 会被 percent-encode。 */
  href: string
}

/** `+postUI` 一张卡片需要的全部数据。 */
export interface PreparedPost {
  id: string
  title: string
  /** Hexo `article.path`：不带前导 `/` 的站内路径，如 `2025/02/02/sticky-top/`。 */
  path: string
  /** `url_for(article.path)`。 */
  href: string
  /** `article.cover`：字符串为封面图；`false` 表示「无封面」（见 random_cover.js）。 */
  cover: string | false
  top: boolean
  sticky: number
  /** frontmatter 的 `swiper_index`（`sort_attr_post` 的轮播排序键）。 */
  swiperIndex?: number
  /** frontmatter 的 `top_group_index`（`sort_attr_post` 的顶部推荐位排序键）。 */
  topGroupIndex?: number
  date: HexoDateInfo
  updated: HexoDateInfo
  categories: PostCategoryItem[]
  tags: PostTagItem[]
  /** `index_post_content` 的渲染结果；`null` 表示上游该分支不输出 `.content`。 */
  excerpt: string | null
  /** 是否是全站最新一篇（`maxDate === article.date`，决定首页「最新」角标）。 */
  isNewest: boolean
}

/** 分类导航条（includes/categoryGroup.pug）需要的分类项。 */
export interface CategoryBarItem {
  name: string
  /** `item.path`（Hexo Category.path），形如 `categories/前端/Astro/`，未编码。 */
  path: string
}

export interface PrepareOptions extends SiteDateConfig {
  /** 站点时区，缺省 `Asia/Shanghai`（基准站 `_config.yml`）。 */
  timezone?: string
  /**
   * 文章 permalink 解析器（站点配置提供，见 `layouts/site.ts`）。
   *
   * 不传时沿用基准站 Hexo 默认 permalink `/:year/:month/:day/:id/`（fixture 站点）；
   * 迁移站传入 `src/data/post-permalink.ts` 的 `postHref`，使卡片 / 上下篇 / 侧栏
   * 「最近文章」等所有从集合条目派生的链接与真实文章路由同源（P7-4）。
   */
  resolvePostHref?: PostHrefResolver
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

/** `Array.prototype.sort` 的比较函数：按字符串码点升序（上游 `byCodePoint`）。 */
function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * hexo-util `escape_diacritic()` 的近似实现：先 NFKD 分解再去掉组合符号，
 * 这样 `é → e`、`ñ → n` 这类常见变音符号与上游一致。
 *
 * 与上游的差距：上游用一张手工映射表处理 `Æ/Ø/Ł/ß` 这类「分解不出基本字母」的字符，
 * 这里没有那张表（完整移植属于 M3 的 slugize 任务）。CJK / ASCII 完全一致，
 * 对照 fixture 的所有标签名与分类名也是逐字一致的。
 */
function escapeDiacritic(str: string): string {
  return str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * hexo-util `slugize()`（`options.transform` 缺省，即 `filename_case: 0` 不转大小写）。
 *
 * 上游源码（hexo-util/dist/slugize.js）：
 *   escape_diacritic(str)
 *     .replace(/[\u0000-\u001f]/g, '')                  // 控制字符
 *     .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'<>,.?/]+/g, separator)
 *     .replace(new RegExp(`${sep}{2,}`, 'g'), separator)
 *     .replace(new RegExp(`^${sep}+|${sep}+$`, 'g'), '')
 */
export function slugize(name: string, separator = '-'): string {
  const escaped = escapeDiacritic(name)
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'<>,.?/]+/g, separator)
  const sep = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escaped
    .replace(new RegExp(`${sep}{2,}`, 'g'), separator)
    .replace(new RegExp(`^${sep}+|${sep}+$`, 'g'), '')
}

/** `encodeURI(unescape(str))`：hexo-util `encodeURL()` 的非绝对 URL 分支（基准站无 CDN）。 */
function encodeUrl(url: string): string {
  try {
    return encodeURI(decodeURIComponent(url))
  } catch {
    return encodeURI(url)
  }
}

/** 标签页路径：Tag 的 `path` 虚拟字段 = `<tag_dir>/<slug>/`，再走 url_for。 */
function tagHref(name: string): string {
  return urlFor(encodeUrl(`/tags/${slugize(name)}/`))
}

/**
 * 把 frontmatter 的 categories 摊平成「分类 → 路径」列表，复刻 Hexo
 * `Post.prototype.setCategories`（hexo/dist/models/post.js）的嵌套规则：
 *
 *   - **只要有一项是数组**（`hasHierarchy`）：每一项各自是一条分类链，
 *     `[[前端, Astro], 工程实践]` → `前端`、`前端/Astro`、`工程实践`；
 *   - **全都是字符串**：整个数组是**一条**分类链（不是并列的顶层分类！），
 *     `[前端, Hexo]` → `前端`、`前端/Hexo`（Hexo 里 Hexo 是前端的子分类）。
 *
 * 最后按 name 码点升序排序：基准站 `reproducible.js` 把 Category 模型的遍历顺序固定成这个口径。
 */
export function flattenCategories(raw: unknown): PostCategoryItem[] {
  if (!Array.isArray(raw)) return []
  const hasHierarchy = raw.some((entry) => Array.isArray(entry))
  /** 每一条分类链：数组项原样，字符串项是单元素链。 */
  const chains: unknown[][] = hasHierarchy
    ? raw.map((entry) => (Array.isArray(entry) ? entry : [entry]))
    : [raw]

  const items: PostCategoryItem[] = []
  for (const chain of chains) {
    const parents: string[] = []
    for (const segment of chain) {
      if (typeof segment !== 'string' || !segment) continue
      parents.push(segment)
      items.push({ name: segment, path: parents.join('/') })
    }
  }
  return items.sort((a, b) => byCodePoint(a.name, b.name))
}

/** 卡片日期：`date_xml` / `date()` / `full_date()` 三件套。 */
function buildDateInfo(
  value: unknown,
  formatter: ReturnType<typeof createSiteDateFormatter>,
): HexoDateInfo {
  const date = value instanceof Date ? value : new Date(0)
  return {
    xml: formatter.xml(date),
    display: formatter.format(date, SITE_DATE_FORMAT),
    full: formatter.format(date, `${SITE_DATE_FORMAT} ${SITE_TIME_FORMAT}`),
  }
}

/**
 * 上游 `index_post_content` 的摘要分支（post-ui.pug:129-146）。
 *
 * method：
 *   - `false` → 不输出 `.content`；
 *   - `1` → `.content = article.description`；
 *   - `2` → 有 description 用 description，否则走自动摘要；
 *   - 其它（默认 3）→ 自动摘要。
 *
 * 自动摘要 = `strip_html(article.content).substring(0, length)`，超长再补 `' ...'`。
 *
 * 关键细节：`article.content` 是 **hexo-renderer-marked 的产物**，而它覆写了 marked 的
 * `heading` 渲染器并且**没有补尾随换行**（baseline 文章页里就是 `<h2 …>…</h2><p>`）。
 * Astro 的 remark-rehype 会在块级元素之间插 `\n`，于是标题后面多一个换行；摘要按字符数
 * 截断，这个换行会把后续文本整体推移 1 个字符、截断点错位。所以先去掉它再 `stripHtml()`。
 * 实测 9 张卡片里 4 张可对（另外 5 张的 `.content` 含未移植的 Hexo tag 产物），见
 * docs/notes/P2-7-home-postcard.md §4 的对拍表。
 */
function buildExcerpt(
  html: string,
  description: string | undefined,
  method: number | false,
  length: number,
): string | null {
  if (method === false) return null
  if (method === 1) return description ?? ''
  if (method === 2 && description) return description

  const markedLikeHtml = html.replace(/(<\/h[1-6]>)\n+/g, '$1')
  const content = stripHtml(markedLikeHtml)
  let excerpt = content.substring(0, length)
  if (content.length > length) excerpt += ' ...'
  return excerpt
}

/**
 * `scripts/filters/random_cover.js`：frontmatter 没写 cover 时用 `cover.default_cover`
 * 随机挑一张；配成空列表（基准站）则落成 `false`，卡片走「无封面」分支。
 *
 * 上游每次构建随机取一张，这里保持同一语义（非确定性只影响「配了 default_cover 的站点」；
 * 基准站 `_config.yml` 的 `cover.default_cover: null`，产物是确定的）。
 */
function resolveCover(raw: unknown, defaultCovers: unknown): string | false {
  if (typeof raw === 'string' && raw) return raw
  if (raw === false) return false
  if (Array.isArray(defaultCovers)) {
    const candidates = defaultCovers.filter((item): item is string => typeof item === 'string')
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)]
    }
  } else if (typeof defaultCovers === 'string' && defaultCovers) {
    return defaultCovers
  }
  return false
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

function readThemeListConfig(): {
  defaultCover: unknown
  excerptMethod: number | false
  excerptLength: number
} {
  const theme = getThemeConfig()
  const indexPostContent = theme.index_post_content as { method?: number | false; length?: number }
  return {
    defaultCover: theme.cover.default_cover,
    excerptMethod: indexPostContent.method ?? 3,
    excerptLength: indexPostContent.length ?? 500,
  }
}

/**
 * 把 `getCollection('posts')` 的条目整理成首页卡片列表（已排序，未分页）。
 *
 * 过滤规则：`layout === 'page'` 的独立页面不进首页列表（Hexo 里它是 Page 不是 Post）。
 */
export function preparePosts(entries: PostEntryLike[], options: PrepareOptions = {}): PreparedPost[] {
  const timezone = options.timezone ?? SITE_TIME_ZONE
  const formatter = createSiteDateFormatter({ ...options, timezone })
  const themeList = readThemeListConfig()

  /**
   * `article.path`：不带前导 `/` 的站内路径。
   *
   * 有站点 permalink 解析器时完全交给它（迁移站：`posts/p:abbrlink/` 等）；
   * 否则回退基准站的 Hexo 默认 permalink `:year/:month/:day/:title/`
   * （年月日取站点时区下的日历字段并补零）。
   * 末段走 `postSlugOf()`（B4：`abbrlink ?? id`，与文章路由共用）。
   */
  const resolvePath = (entry: PostEntryLike): string => {
    const resolved = options.resolvePostHref?.(entry)
    if (typeof resolved === 'string' && resolved) return resolved.replace(/^\/+/, '')
    const dateValue = entry.data.date
    const date = dateValue instanceof Date ? dateValue : new Date(0)
    const parts = formatter.parts(date)
    const pad = (value: number): string => String(value).padStart(2, '0')
    return encodeUrl(`/${parts.year}/${pad(parts.month)}/${pad(parts.day)}/${postSlugOf(entry)}/`).slice(1)
  }

  const posts = entries
    .filter((entry) => entry.data.layout !== 'page')
    .map((entry) => {
      const dateValue = entry.data.date
      const date = dateValue instanceof Date ? dateValue : new Date(0)
      const path = resolvePath(entry)
      const href = urlFor(path)
      const tags = (Array.isArray(entry.data.tags) ? entry.data.tags : [])
        .filter((tag): tag is string => typeof tag === 'string' && tag !== '')
        .map((name) => ({ name, href: tagHref(name) }))
        .sort((a, b) => byCodePoint(a.name, b.name))
      const description =
        typeof entry.data.description === 'string' ? entry.data.description : undefined
      const title = typeof entry.data.title === 'string' && entry.data.title ? entry.data.title : ''
      const post: PreparedPost = {
        id: entry.id,
        // `article.title || _p('no_title')`：缺标题时回退字典里的「无题」
        title: title || '无题',
        path,
        href,
        cover: resolveCover(entry.data.cover, themeList.defaultCover),
        top: entry.data.top === true,
        sticky: typeof entry.data.sticky === 'number' ? entry.data.sticky : 0,
        swiperIndex:
          typeof entry.data.swiper_index === 'number' ? entry.data.swiper_index : undefined,
        topGroupIndex:
          typeof entry.data.top_group_index === 'number' ? entry.data.top_group_index : undefined,
        date: buildDateInfo(date, formatter),
        updated: buildDateInfo(entry.data.updated ?? date, formatter),
        categories: flattenCategories(entry.data.categories),
        tags,
        excerpt: buildExcerpt(
          entry.rendered?.html ?? '',
          description,
          themeList.excerptMethod,
          themeList.excerptLength,
        ),
        isNewest: false,
      }
      return { post, timestamp: date.getTime() }
    })

  // Hexo index_generator：order_by=-date → 再按 sticky 降序（稳定排序保留日期顺序）。
  // 同日期的次序用 path 码点升序兜底（reproducible.js 的固定口径）。
  posts.sort((a, b) => {
    const sticky = b.post.sticky - a.post.sticky
    if (sticky !== 0) return sticky
    const byDate = b.timestamp - a.timestamp
    if (byDate !== 0) return byDate
    return byCodePoint(a.post.href, b.post.href)
  })

  // maxDate：`site.posts.data` 的第一篇（date 降序、同日期 path 升序），
  // 决定「最新」角标挂在谁身上（与 sticky 无关）。
  let newest = posts[0]
  for (const item of posts) {
    if (
      item.timestamp > newest.timestamp ||
      (item.timestamp === newest.timestamp && byCodePoint(item.post.href, newest.post.href) < 0)
    ) {
      newest = item
    }
  }
  if (newest) newest.post.isNewest = true

  return posts.map((item) => item.post)
}

/** `hexo-pagination` 的切页：第 1 页是 `posts[0..perPage)`。 */
export function paginatePosts(
  posts: PreparedPost[],
  perPage: number = INDEX_PER_PAGE,
): { total: number; pages: PreparedPost[][] } {
  const total = perPage > 0 ? Math.ceil(posts.length / perPage) : 1
  const pages: PreparedPost[][] = []
  for (let i = 0; i < total; i++) pages.push(posts.slice(perPage * i, perPage * (i + 1)))
  return { total, pages }
}

/**
 * 站点级 `lazyload` 过滤器的等效配置（`scripts/filters/post_lazyload.js`）。
 *
 * `theme.lazyload.enable && field === 'site'` 时，上游在 after_render:html 阶段把每个
 * `<img … src="x">` 改写成 `src=<placeholder> onerror=… data-lazy-src="x"`。
 * Astro 没有这个钩子，组件直接输出改写后的最终属性；这里统一解析一次配置。
 */
export function resolveImageLazyload(): {
  enabled: boolean
  placeholder: string
  errorPostPage: string
} {
  const theme = getThemeConfig()
  const lazyload = theme.lazyload as { enable?: boolean; field?: string; placeholder?: string | null }
  const errorImages = theme.error_img as { post_page?: string }
  return {
    enabled: lazyload?.enable === true && lazyload?.field === 'site',
    placeholder: lazyload?.placeholder ? urlFor(lazyload.placeholder) : LAZYLOAD_PLACEHOLDER,
    errorPostPage: urlFor(errorImages.post_page ?? '/img/404.jpg'),
  }
}

/**
 * 分类导航条（includes/categoryGroup.pug → `catalog_list("categories")`）的数据：
 * 站点全部分类按 name 码点升序（基准站 reproducible.js 的固定顺序）。
 *
 * `path` 是 Hexo `Category.path` 的形状：`categories/<逐段 slug 化的分类链>/`，未 percent-encode
 * （上游 helper 直接 `!={` 拼进 HTML，所以 baseline 里是中文原文）。
 *
 * 注意 slug 化：Hexo 生成 Category.path 时会逐段跑 `slugize()`（`Arch Linux` → `Arch-Linux`），
 * 真实站 golden 的目录与链接都是 `/categories/教程/Arch-Linux/`。原始分类名（未 slug 化）另有
 * 用途（展示文本 / 排序键），所以只在拼 path 时转换（P7-4）。
 */
export function collectCategoryBarItems(posts: PreparedPost[]): CategoryBarItem[] {
  const seen = new Map<string, CategoryBarItem>()
  for (const post of posts) {
    for (const category of post.categories) {
      if (seen.has(category.path)) continue
      const slugPath = category.path.split('/').map((segment) => slugize(segment)).join('/')
      seen.set(category.path, {
        name: category.name,
        path: `categories/${slugPath}/`,
      })
    }
  }
  return [...seen.values()].sort((a, b) => byCodePoint(a.name, b.name))
}

/**
 * `top/top.pug` 的 `.topGroup`：`sort_attr_post("top_group_list").splice(0, 6)`。
 *
 * 注意上游 helper 的入参是 `hexo.locals.get("posts").data`，那份数据的顺序是
 * `reproducible.js` 固定出来的「date 降序 → path 码点升序」，**不是**首页的 sticky 排序。
 * 「用最新文章补足到 6 个」这一段依赖的就是这个顺序，所以这里先本地按同一口径排一份。
 */
export function selectTopGroupPosts(posts: PreparedPost[], swiperEnable = false): PreparedPost[] {
  // date 降序（ISO 串可直接字典序比较）→ path 码点升序
  const byDate = [...posts].sort(
    (a, b) => b.date.xml.localeCompare(a.date.xml) || byCodePoint(a.path, b.path),
  )
  const byPath = new Map(byDate.map((post) => [post.path, post]))
  const selected =
    sortAttrPost('top_group_list', {
      posts: byDate.map((post) => ({
        path: post.path,
        swiper_index: post.swiperIndex,
        top_group_index: post.topGroupIndex,
      })),
      swiperEnable,
    }) ?? []
  return selected
    .map((item) => byPath.get(item.path))
    .filter((post): post is PreparedPost => Boolean(post))
    .slice(0, swiperEnable ? 4 : 6)
}
