/**
 * post-page.ts — 文章页（P2-8）的数据准备层。
 *
 * 上游对应关系：
 *   - `layout/post.pug`：`page.title / categories.data / tags.data / date / updated /
 *     copyright_* / content`；
 *   - `layout/includes/pagination.pug`：`page.prev` / `page.next`；
 *   - `scripts/helpers/related_post.js`：按标签权重 + 站点文章顺序算相关推荐；
 *   - `layout/includes/head/config_site.pug:13-23`：`showToc = pageToc && toc(page.content) !== ''`；
 *   - `hexo-renderer-marked` 的 heading 渲染：标题 id 与 headerlink（见 utils/slugger.ts）。
 *
 * 与首页卡片共用 `post-list.ts` 的 `preparePosts()`（path / date / tags / categories /
 * cover / excerpt 的语义只有一份），这里只补文章页独有的三件事：
 *   1. `abbrlink` 覆盖 permalink 的最后一段（路由规则 `YYYY/MM/DD/(abbrlink || id)/`）；
 *   2. 按日期排出的上一篇 / 下一篇与相关推荐；
 *   3. 正文 HTML 的标题改写与 TOC 抽取。
 *
 * 已知限制（Phase 7 站点配置层接管后消除）：
 *   - `related_post.limit` / `post_pagination` / `toc.*` 读主题配置；
 *   - `permalink` 目前只支持 `:year/:month/:day/:slug/`（基准站配置），不含自定义 permalink。
 */
import {
  preparePosts,
  slugize,
  type PostEntryLike,
  type PreparedPost,
} from './post-list.ts'
import { createUrlFor, type PostHrefResolver } from '../../utils/url-utils.ts'
import { getThemeConfig } from '../../config/theme-context.ts'
import { rewriteHeadings, SWALLOWED_HEADING_RE, type HeadingInfo } from '../../utils/slugger.ts'

// 子路径部署跟随 Astro base（import.meta.env.BASE_URL），与页面侧 urlFor 同口径
const urlFor = createUrlFor(import.meta.env.BASE_URL || '/')

/* ------------------------------------------------------------------ */
/* 输入 / 输出类型                                                     */
/* ------------------------------------------------------------------ */

/** 内容集合条目（只用到文章页会读的字段；其余原样透传）。 */
export interface PostPageEntry extends PostEntryLike {
  data: Record<string, unknown>
}

/** 相关推荐的一项：上游 `relatedPosts` 里的 `{...post, weight}`。 */
export interface RelatedPostItem {
  post: PreparedPost
  weight: number
}

export interface PostPageData {
  /** 当前文章（`path` / `href` 已按 abbrlink 修正）。 */
  current: PreparedPost
  /** 当前文章的原始 frontmatter（copyright / ai / toc / aside 等逐篇覆盖项）。 */
  data: Record<string, unknown>
  /**
   * 站点全部文章，**date 降序 → path 码点升序**。
   * 对应上游 `site.posts`（`reproducible.js` 固定出来的顺序），相关推荐用它遍历。
   */
  posts: PreparedPost[]
  /** 上一篇（更旧的一篇，上游 `page.prev`）；没有则 null。 */
  prev: PreparedPost | null
  /** 下一篇（更新的一篇，上游 `page.next`）；没有则 null。 */
  next: PreparedPost | null
  /** `related_posts(page, site.posts)` 的结果（已按 weight 降序、截断到 limit）。 */
  related: RelatedPostItem[]
  /** 标签名 → 文章数（post-copyright 的 `span.tagsPageCount`）。 */
  tagCounts: Record<string, number>
  /** 分类名 → 文章数（ptool.categories 为 true 时的 `span.categoryesPageCount`）。 */
  categoryCounts: Record<string, number>
  /** 正文 HTML（标题 id 已改写为 Hexo 口径并补上 headerlink）。 */
  bodyHtml: string
  /** 正文里全部 h1–h6。 */
  allHeadings: HeadingInfo[]
  /** 交给 aside 的 TOC 数据（h2–h6，上游 `toc()` 默认不含 h1 之外的长文场景）。 */
  headings: HeadingInfo[]
  /** 上游 `showToc`。 */
  showToc: boolean
  /**
   * `page.top_img || page.cover || page.randomcover` 的收窄结果：
   * string = 有图；false = `page.top_img === false` 显式关闭；undefined = 无图（上游此时
   * 仍会渲染 post-info，但 Header.astro 当前把 undefined 当 false，属 P2-4 遗留差异）。
   */
  topImg: string | false | undefined
  /** `#post-top-bg` 的 src（`bg_img`）。 */
  bgImg: string
  /** 文章绝对 URL（`page.permalink`）。 */
  permalink: string
}

export interface PreparePostPageOptions {
  /** 站点根路径（`config.root`），默认 `/`。 */
  root?: string
  /** 站点绝对地址（`config.url`），用于拼 `page.permalink`。 */
  url?: string
  /** 站点时区，默认 `Asia/Shanghai`。 */
  timezone?: string
  /**
   * Hexo 站点级 `external_link`（基准站 `enable: true`）：正文里的绝对外链补
   * `target="_blank" rel="noopener"`。`field: site` 的过滤器本来作用于整页，
   * 主题包没有站点配置层，先由文章页把这项站点配置传进来（只作用于正文）。
   */
  externalLink?: { enable?: boolean; exclude?: string | string[] }
  /**
   * 文章 permalink 解析器（站点配置提供，见 `utils/url-utils.ts`）。
   *
   * 传入时：`current.path / prev / next / related / permalink` 全部按它算，
   * 不再套 `applyAbbrlink()`（解析器已经包含 abbrlink 语义）。
   * 不传时：沿用基准站的 `:year/:month/:day/:id/` + abbrlink 覆盖最后一段。
   */
  resolvePostHref?: PostHrefResolver
}

/** 上游 `post_lazyload.js` 的默认占位图。 */
const DEFAULT_LAZYLOAD_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * `scripts/filters/post_lazyload.js` 的字符串级改写（`field: site`）。
 *
 * 正则与上游逐字对齐：只改写「不带 `nolazyload` class 的 `<img … src=`」，
 * 把 `src=` 之后替换成 `"<占位图>" onerror=… data-lazy-src=`，原始 src 值留给
 * `data-lazy-src`。M1 的 `figure.highlight` 不含 img，因此不会误伤代码块。
 */
function applyLazyload(html: string, theme: ReturnType<typeof getThemeConfig>): string {
  const lazyload = theme.lazyload as { enable?: boolean; field?: string; placeholder?: string | null }
  if (lazyload.enable !== true || lazyload.field !== 'site') return html

  const placeholder = lazyload.placeholder
    ? urlFor(lazyload.placeholder)
    : DEFAULT_LAZYLOAD_PLACEHOLDER
  const errorImage = (theme.error_img as { post_page?: string }).post_page ?? '/img/404.jpg'

  return html.replace(
    /(<img(?!.class[\t]*=[\t]*['"].*?nolazyload.*?['"]).*? src=)/gi,
    `$1 "${placeholder}" onerror="this.onerror=null,this.src=&quot;${errorImage}&quot;" data-lazy-src=`,
  )
}

/** Hexo 站点级 `external_link`（`after_render:html`）：外链补 target/rel。 */
function applyExternalLinks(
  html: string,
  options: { siteUrl?: string; externalLink?: { enable?: boolean; exclude?: string | string[] } },
): string {
  if (options.externalLink?.enable !== true) return html

  const exclude = Array.isArray(options.externalLink.exclude)
    ? options.externalLink.exclude
    : options.externalLink.exclude
      ? [options.externalLink.exclude]
      : []
  const siteHost = options.siteUrl ? safeHost(options.siteUrl) : ''

  return html.replace(/<a\b([^>]*)>/gi, (all, attrs: string) => {
    const href = /\bhref="([^"]*)"/i.exec(attrs)?.[1]
    if (!href || !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href)) return all
    if (/\btarget\s*=/i.test(attrs)) return all
    if (exclude.some((item) => item && href.startsWith(item))) return all

    const host = safeHost(href)
    if (!host || (siteHost && host === siteHost)) return all
    return `<a${attrs} target="_blank" rel="noopener">`
  })
}

function safeHost(value: string): string {
  try {
    // 协议相对（//example.com）没有 base 时 new URL 会抛，先给一个假 base 再取 host。
    return new URL(value, 'https://example.invalid').hostname
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * `url_for('/categories/<path>/')`；分类路径逐段 slug 化（Hexo `Category.slug`：
 * `Arch Linux` → `Arch-Linux`），CJK 段落按 baseline 做 percent-encode。
 */
export function categoryHref(path: string): string {
  const slugPath = path.split('/').map((segment) => slugize(segment)).join('/')
  return urlFor(encodeURI(`/categories/${slugPath}/`))
}

/**
 * `abbrlink` 覆盖 permalink 最后一段。Hexo 的 abbrlink 插件把 `:title` 换成
 * `:abbrlink`；基准站的 permalink 是 `:year/:month/:day/:title/`，所以只换最后一段。
 */
function applyAbbrlink(post: PreparedPost, data: Record<string, unknown>): PreparedPost {
  const abbr = data.abbrlink
  if (abbr === undefined || abbr === null || abbr === '') return post
  const slug = String(abbr)
  const path = post.path.replace(/[^/]+\/$/, `${slug}/`)
  return { ...post, path, href: urlFor(path) }
}

/** 当前文章的上/下篇：全部文章按 date 升序 → path 升序排列后取相邻项。 */
function pickNeighbours(
  posts: PreparedPost[],
  current: PreparedPost,
): { prev: PreparedPost | null; next: PreparedPost | null } {
  const asc = [...posts].sort(
    (a, b) => a.date.xml.localeCompare(b.date.xml) || byCodePoint(a.path, b.path),
  )
  const index = asc.findIndex((post) => post.id === current.id)
  if (index === -1) return { prev: null, next: null }
  return {
    prev: index > 0 ? asc[index - 1] : null,
    next: index < asc.length - 1 ? asc[index + 1] : null,
  }
}

/**
 * `related_posts()`（scripts/helpers/related_post.js）：按当前文章的每个标签，
 * 扫一遍站点文章，命中则 weight+1；按 weight 降序（稳定排序保留插入顺序）。
 * `date_type: updated` 时展示更新日期，否则展示创建日期（由组件消费）。
 */
function buildRelated(
  current: PreparedPost,
  posts: PreparedPost[],
  limit: number,
): RelatedPostItem[] {
  if (limit <= 0) return []
  const items: RelatedPostItem[] = []

  for (const tag of current.tags) {
    for (const post of posts) {
      if (post.id === current.id) continue
      if (!post.tags.some((item) => item.name === tag.name)) continue
      const existing = items.find((item) => item.post.path === post.path)
      if (existing) existing.weight += 1
      else items.push({ post, weight: 1 })
    }
  }

  return items.sort((a, b) => b.weight - a.weight).slice(0, limit)
}

/**
 * 上游 `hexo-renderer-marked` 的标题吞噬缺陷（基线可见）：`{% videos %}` /
 * `{% sitegroup %}` 容器会把紧邻其前的 Markdown 标题吞掉，1.7.1 基线里
 * `## videos`、`## sitegroup` 以字面文本留在正文，因此 `toc(page.content)`
 * 不含这两项。我们的 tag 插件按正常 Markdown 渲染成 `h2`，TOC 就会多出两项。
 *
 * 这里在**渲染后的正文 HTML** 上识别「紧跟 videos / site-card-group 容器」的标题，
 * 只把它们从 TOC 数据里剔除；规则与描述抽取共用 slugger.ts 里的
 * {@link SWALLOWED_HEADING_RE}，避免两份正则漂移。
 */
function filterUpstreamSwallowedHeadings(html: string, headings: HeadingInfo[]): HeadingInfo[] {
  const swallowed = new Set<string>()
  for (const match of html.matchAll(SWALLOWED_HEADING_RE)) {
    const id = /\bid="([^"]+)"/.exec(match[2])
    if (id) swallowed.add(id[1])
  }
  if (swallowed.size === 0) return headings
  return headings.filter((heading) => !swallowed.has(heading.id))
}

/** 统计标签 / 分类的文章数（上游 Tag.length / Category.length）。 */
function collectCounts(posts: PreparedPost[]): {
  tagCounts: Record<string, number>
  categoryCounts: Record<string, number>
} {
  const tagCounts: Record<string, number> = {}
  const categoryCounts: Record<string, number> = {}
  for (const post of posts) {
    for (const tag of post.tags) tagCounts[tag.name] = (tagCounts[tag.name] ?? 0) + 1
    for (const category of post.categories) {
      categoryCounts[category.name] = (categoryCounts[category.name] ?? 0) + 1
    }
  }
  return { tagCounts, categoryCounts }
}

/** 当前文章的 top_img 链（header/index.pug:1-13）。 */
function resolveTopImg(
  data: Record<string, unknown>,
  current: PreparedPost,
): string | false | undefined {
  if (data.top_img === false) return false
  const explicit = str(data.top_img)
  if (explicit) return explicit
  if (typeof current.cover === 'string' && current.cover !== '') return current.cover
  // page.randomcover：基准站 cover.default_cover 为空，恒为 undefined
  return undefined
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

/**
 * 把内容集合整理成一篇文章的渲染数据。
 *
 * `current` 必须是 `entries` 里的条目；找不到时抛错（路由层保证不会发生）。
 */
export function preparePostPage(
  entries: PostPageEntry[],
  current: PostPageEntry,
  options: PreparePostPageOptions = {},
): PostPageData {
  const theme = getThemeConfig()
  const prepared = preparePosts(entries, {
    timezone: options.timezone,
    resolvePostHref: options.resolvePostHref,
  })

  const entryById = new Map(entries.map((entry) => [entry.id, entry]))
  // 有站点 permalink 解析器时 path 已是最终形态（解析器包含 abbrlink 语义），
  // 不能再套一次 applyAbbrlink（它只处理基准站的日期 permalink）。
  const posts = options.resolvePostHref
    ? prepared
    : prepared.map((post) => applyAbbrlink(post, entryById.get(post.id)?.data ?? {}))

  const found = posts.find((post) => post.id === current.id)
  if (!found) throw new Error(`[post-page] 内容集合里找不到文章：${current.id}`)

  const { prev, next } = pickNeighbours(posts, found)
  const { tagCounts, categoryCounts } = collectCounts(posts)

  const relatedConfig = theme.related_post as { enable?: boolean; limit?: number }
  const relatedLimit = typeof relatedConfig.limit === 'number' ? relatedConfig.limit : 6
  const related =
    relatedConfig.enable === true ? buildRelated(found, posts, relatedLimit) : []

  const rawHtml = current.rendered?.html ?? ''
  const filteredHtml = applyExternalLinks(applyLazyload(rawHtml, theme), {
    siteUrl: options.url,
    externalLink: options.externalLink,
  })
  const rendered = rewriteHeadings(filteredHtml)
  const allHeadings = rendered.headings
  const headings = filterUpstreamSwallowedHeadings(
    rendered.html,
    allHeadings.filter((heading) => heading.level >= 2),
  )

  // head/config_site.pug:13-23
  const tocConfig = theme.toc as { post?: boolean }
  const tocEnable = tocConfig.post === true
  const data = current.data
  const pageToc = typeof data.toc === 'boolean' ? data.toc : tocEnable
  const showToc =
    theme.aside.enable === true &&
    data.aside !== false &&
    pageToc &&
    allHeadings.length > 0

  const topImg = resolveTopImg(data, found)
  const bgImg =
    topImg === false || topImg === undefined
      ? ''
      : topImg.includes('/')
        ? urlFor(topImg)
        : topImg

  const root = options.root && options.root !== '/' ? options.root.replace(/\/+$/, '') : ''
  const origin = options.url ? options.url.replace(/\/+$/, '') : ''
  const permalink = `${origin}${root}/${found.path.replace(/^\//, '')}`

  return {
    current: found,
    data,
    posts,
    prev,
    next,
    related,
    tagCounts,
    categoryCounts,
    bodyHtml: rendered.html,
    allHeadings,
    headings,
    showToc,
    topImg,
    bgImg,
    permalink,
  }
}
