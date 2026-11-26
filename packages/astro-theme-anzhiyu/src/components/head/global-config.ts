/**
 * global-config.ts — 上游 `layout/includes/head/config.pug` 的构建器（P4-1）。
 *
 * 上游把 33 个运行时配置序列化成一段内联脚本：
 *
 *   const GLOBAL_CONFIG = { linkPageTop: undefined, peoplecanvas: {...}, … }
 *
 * 每个 `!{xxx}` 都是 Node 侧的 `JSON.stringify(theme.xxx)` 或 `'字符串'`。
 * 这里用同一个模板逐行复刻（含未缩进的两处 `commentBarrageConfig:!{...}`），
 * 保证产物里这段脚本与基线的**令牌序列**一致（diff 会折叠空白后逐字比较）。
 *
 * 数据来源分三类：
 *   1. `theme.*`：主题配置；
 *   2. `config.*`：站点配置（root / author / title），由 BaseLayout 的 site 传入；
 *   3. `_p()`：i18n 文案。
 *
 * site 级 `config.highlight` / `config.prismjs` / `config.syntax_highlighter`
 * 在当前仓库还没有站点配置层（Phase 7 才落地），基准站固定为
 * `syntax_highlighter: highlight.js`、`highlight.enable: true`。因此这里按
 * 「Hexo 默认开启 highlight.js」产出，插件名写死 `highlight.js`；
 * `theme.highlight_theme === false` 时视为关闭。
 */
import { tp } from '../../i18n/index.ts'
import type { SiteConfig } from '../../layouts/site.ts'
import type { ThemeConfig } from '../../config/schema.ts'
import type { AssetMap } from '../../config/assets.ts'

/** 任何 looseObject 区块的安全读取。 */
function obj(section: unknown): Record<string, unknown> {
  return section && typeof section === 'object' ? (section as Record<string, unknown>) : {}
}
function flag(section: unknown, key: string, fallback = false): boolean {
  const value = obj(section)[key]
  return typeof value === 'boolean' ? value : fallback
}
function str(section: unknown, key: string, fallback = ''): string {
  const value = obj(section)[key]
  return typeof value === 'string' ? value : fallback
}
function num(section: unknown, key: string, fallback = 0): number {
  const value = obj(section)[key]
  return typeof value === 'number' ? value : fallback
}

/**
 * `JSON.stringify` + 内联 `<script>` 安全转义：`<` 转成 `\u003c`（防 `</script>`
 * 提前闭合脚本），U+2028 / U+2029 转成转义序列（防 JS 词法断行）。
 */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * JS 字符串字面量内容转义（单双引号通用）：反斜杠 / 引号 / 换行 /
 * `</`（`<` → `\u003c`）/ U+2028 / U+2029。防语法崩溃与脚本逃逸。
 */
export function escapeJsString(value: string | undefined): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** `JSON.stringify`；`undefined` 原样写成 JS 的 `undefined`（与 pug 一致）。 */
function j(value: unknown): string {
  return value === undefined ? 'undefined' : safeJson(value)
}

export function buildGlobalConfigScript(
  theme: ThemeConfig,
  site: SiteConfig,
  assets: AssetMap,
): string {
  const lang = site.language
  const _p = (key: string) => tp(key, lang)

  /* ---------------- 1. 条件区块（config.pug:1-167） ---------------- */

  const linkPageTop = flag(theme.linkPageTop, 'enable')
    ? {
        enable: true,
        title: str(theme.linkPageTop, 'title'),
        addFriendPlaceholder: str(theme.linkPageTop, 'addFriendPlaceholder'),
      }
    : undefined

  const peoplecanvas = flag(theme.peoplecanvas, 'enable')
    ? { enable: true, img: str(theme.peoplecanvas, 'img') }
    : undefined

  const postHeadAiDescription = flag(theme.post_head_ai_description, 'enable')
    ? obj(theme.post_head_ai_description)
    : undefined

  const diytitle = flag(theme.diytitle, 'enable') ? obj(theme.diytitle) : undefined

  const LA51 = flag(theme.LA, 'enable') ? obj(theme.LA) : undefined

  const greetingBox = flag(theme.greetingBox, 'enable') ? obj(theme.greetingBox) : undefined

  const commentBarrageConfig = flag(theme.comment_barrage_config, 'enable')
    ? obj(theme.comment_barrage_config)
    : undefined

  const musicPageDefault = theme.music_page_default ? theme.music_page_default : undefined

  const preloader = flag(theme.preloader, 'enable')
    ? { source: num(theme.preloader, 'source') }
    : undefined

  const friendsVueInfo = flag(theme.friends_vue, 'enable')
    ? { apiurl: obj(theme.friends_vue).apiurl ?? null }
    : undefined

  const mainTone = flag(theme.mainTone, 'enable')
    ? {
        mode: str(theme.mainTone, 'mode'),
        api: str(theme.mainTone, 'api'),
        cover_change: flag(theme.mainTone, 'cover_change'),
      }
    : undefined

  const authorStatus = flag(theme.author_status, 'enable')
    ? { skills: obj(theme.author_status).skills ?? null }
    : undefined

  const algoliaEnabled = flag(theme.algolia_search, 'enable')
  const algolia = algoliaEnabled
    ? {
        appId: (site as { algolia?: { appId?: string; applicationID?: string } }).algolia?.appId ?? null,
        apiKey: (site as { algolia?: { apiKey?: string } }).algolia?.apiKey ?? null,
        indexName: (site as { algolia?: { indexName?: string } }).algolia?.indexName ?? null,
        hits: num(theme.algolia_search, 'hits'),
        languages: {
          input_placeholder: _p('search.algolia_search.input_placeholder'),
          hits_empty: _p('search.algolia_search.hits_empty'),
          hits_stats: _p('search.algolia_search.hits_stats'),
        },
      }
    : undefined

  const localSearchEnabled = flag(theme.local_search, 'enable')
  const localSearch = localSearchEnabled
    ? {
        path: str(theme.local_search, 'CDN')
          ? str(theme.local_search, 'CDN')
          : `${site.root ?? '/'}search.xml`,
        preload: flag(theme.local_search, 'preload', true),
        languages: {
          hits_empty: _p('search.local_search.hits_empty'),
        },
      }
    : undefined

  const translateEnabled = flag(theme.translate, 'enable')
  const translate = translateEnabled
    ? {
        defaultEncoding: num(theme.translate, 'defaultEncoding'),
        translateDelay: num(theme.translate, 'translateDelay'),
        msgToTraditionalChinese: str(theme.translate, 'msgToTraditionalChinese'),
        msgToSimplifiedChinese: str(theme.translate, 'msgToSimplifiedChinese'),
        rightMenuMsgToTraditionalChinese: str(theme.translate, 'rightMenuMsgToTraditionalChinese'),
        rightMenuMsgToSimplifiedChinese: str(theme.translate, 'rightMenuMsgToSimplifiedChinese'),
      }
    : undefined

  const noticeOutdate = flag(theme.noticeOutdate, 'enable')
    ? {
        limitDay: num(theme.noticeOutdate, 'limit_day'),
        position: str(theme.noticeOutdate, 'position'),
        messagePrev: str(theme.noticeOutdate, 'message_prev'),
        messageNext: str(theme.noticeOutdate, 'message_next'),
      }
    : undefined

  /** 站点层 highlight.js 默认开启；`highlight_theme` 为空串时视为关闭。 */
  const highlightEnabled = Boolean(theme.highlight_theme)
  const highlight = highlightEnabled
    ? {
        plugin: 'highlight.js',
        highlightCopy: flag(theme, 'highlight_copy', true),
        highlightLang: flag(theme, 'highlight_lang', true),
        highlightHeightLimit: num(theme, 'highlight_height_limit', 0),
      }
    : undefined

  const snackbarEnabled = flag(theme.snackbar, 'enable')
  const snackbar = snackbarEnabled
    ? {
        chs_to_cht: _p('Snackbar.chs_to_cht'),
        cht_to_chs: _p('Snackbar.cht_to_chs'),
        day_to_night: _p('Snackbar.day_to_night'),
        night_to_day: _p('Snackbar.night_to_day'),
        bgLight: str(theme.snackbar, 'bg_light'),
        bgDark: str(theme.snackbar, 'bg_dark'),
        position: str(theme.snackbar, 'position'),
      }
    : undefined

  const shortcutKey = flag(theme.shortcutKey, 'enable') ? obj(theme.shortcutKey) : undefined

  /* ---------------- 2. 版权 / 相对日期 / 明暗 ---------------- */

  const copyEnabled = flag(theme.copy, 'enable')
  const copyCopyright = obj(obj(theme.copy).copyright)
  const copy = copyEnabled
    ? {
        copy: true,
        copyrightEbable: flag(copyCopyright, 'enable'),
        limitCount: num(copyCopyright, 'limit_count'),
        languages: {
          author: `${_p('copy_copyright.author')}: ${site.author ?? ''}`,
          link: `${_p('copy_copyright.link')}: `,
          source: `${_p('copy_copyright.source')}: ${site.title}`,
          info: _p('copy_copyright.info'),
          copySuccess: _p('copy_copyright.copySuccess'),
        },
      }
    : undefined

  const pageDateFormat = str(obj(theme.post_meta).page, 'date_format')
  const postDateFormat = str(obj(theme.post_meta).post, 'date_format')

  const darkmode = obj(theme.darkmode)
  const autoDarkmode = flag(darkmode, 'enable') && darkmode.autoChangeMode === 1

  const lightbox = theme.medium_zoom ? 'mediumZoom' : theme.fancybox ? 'fancybox' : 'null'

  const runtime = flag(theme.runtimeshow, 'enable') ? _p('aside.card_webinfo.runtime.unit') : ''

  /* ---------------- 3. 组装（config.pug:169-223 原样） ---------------- */

  return `const GLOBAL_CONFIG = {
  linkPageTop: ${j(linkPageTop)},
  peoplecanvas: ${j(peoplecanvas)},
  postHeadAiDescription: ${j(postHeadAiDescription)},
  diytitle: ${j(diytitle)},
  LA51: ${j(LA51)},
  greetingBox: ${j(greetingBox)},
  twikooEnvId: '${escapeJsString(str(theme.twikoo, 'envId'))}',
  commentBarrageConfig:${j(commentBarrageConfig)},
  music_page_default: ${j(musicPageDefault)},
  root: '${escapeJsString(site.root ?? '/')}',
  preloader: ${j(preloader)},
  friends_vue_info: ${j(friendsVueInfo)},
  navMusic: ${flag(theme.nav_music, 'enable')},
  mainTone: ${j(mainTone)},
  authorStatus: ${j(authorStatus)},
  algolia: ${j(algolia)},
  localSearch: ${j(localSearch)},
  translate: ${j(translate)},
  noticeOutdate: ${j(noticeOutdate)},
  highlight: ${j(highlight)},
  copy: {
    success: '${escapeJsString(_p('copy.success'))}',
    error: '${escapeJsString(_p('copy.error'))}',
    noSupport: '${escapeJsString(_p('copy.noSupport'))}'
  },
  relativeDate: {
    homepage: ${pageDateFormat === 'relative'},
    simplehomepage: ${pageDateFormat === 'simple'},
    post: ${postDateFormat === 'relative'}
  },
  runtime: '${escapeJsString(runtime)}',
  date_suffix: {
    just: '${escapeJsString(_p('date_suffix.just'))}',
    min: '${escapeJsString(_p('date_suffix.min'))}',
    hour: '${escapeJsString(_p('date_suffix.hour'))}',
    day: '${escapeJsString(_p('date_suffix.day'))}',
    month: '${escapeJsString(_p('date_suffix.month'))}'
  },
  copyright: ${j(copy)},
  lightbox: '${escapeJsString(lightbox)}',
  Snackbar: ${j(snackbar)},
  source: {
    justifiedGallery: {
      js: '${escapeJsString(assets.flickr_justified_gallery_js)}',
      css: '${escapeJsString(assets.flickr_justified_gallery_css)}'
    }
  },
  isPhotoFigcaption: ${flag(theme, 'photofigcaption')},
  islazyload: ${flag(theme.lazyload, 'enable')},
  isAnchor: ${flag(theme, 'anchor')},
  shortcutKey: ${j(shortcutKey)},
  autoDarkmode: ${autoDarkmode}
}`
}

/**
 * `layout/includes/head/config_site.pug` 的等价：`GLOBAL_CONFIG_SITE`。
 *
 * 这些值是**页面级**的，模板里来自 Hexo 的 `page.*` / `is_post()` / `is_home()`：
 *   - `configTitle` / `title`：站点标题；`isHome` 时 title 退化成站点标题；
 *   - `postAI` / `postMainColor` / `postUpdate`：文章 frontmatter；
 *   - `isHighlightShrink`：`none` → undefined，否则页面覆盖 > 主题；
 *   - `isToc`：BaseLayout 已算好的 `showToc`。
 *
 * 当前 BaseLayout 没有把 `page.ai` / `page.main_color` / `page.updated` 透传进来，
 * 这页先给出空串（与首页基线 `postAI` / `postMainColor` 一致）；文章页的
 * `postUpdate` 由 P2-8 的页面在后续版本补充。
 */
export interface GlobalConfigSiteInput {
  configTitle: string
  title: string
  postAI?: string
  pageFillDescription?: string
  isPost: boolean
  isHome: boolean
  isHighlightShrink: boolean | undefined
  isToc: boolean
  postUpdate?: string
  postMainColor?: string
}

/** config_site.pug 的转义规则：反斜杠 / 引号 / 换行 / `</` / 行分隔符。 */
function escapeQuote(value: string | undefined): string {
  return value ? escapeJsString(value) : ''
}

export function buildGlobalConfigSiteScript(input: GlobalConfigSiteInput): string {
  return `var GLOBAL_CONFIG_SITE = {
  configTitle: '${escapeQuote(input.configTitle)}',
  title: '${escapeQuote(input.title)}',
  postAI: '${escapeQuote(input.postAI)}',
  pageFillDescription: '${escapeQuote(input.pageFillDescription)}',
  isPost: ${input.isPost},
  isHome: ${input.isHome},
  isHighlightShrink: ${input.isHighlightShrink === undefined ? 'undefined' : input.isHighlightShrink},
  isToc: ${input.isToc},
  postUpdate: '${escapeQuote(input.postUpdate)}',
  postMainColor: '${escapeQuote(input.postMainColor)}',
}`
}
