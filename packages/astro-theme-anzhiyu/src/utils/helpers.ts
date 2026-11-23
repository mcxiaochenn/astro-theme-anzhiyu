/**
 * helpers.ts — 上游 `scripts/helpers/*.js`（12 个 Hexo 扩展文件）的纯函数移植。
 *
 * 上游 helper 通过 `hexo.extend.helper.register(name, function(...) { ... })` 注册，
 * 函数体内的 `this` 是 Hexo 的渲染上下文（`this.config` / `this.theme` / `this.site` /
 * `this.page` / `this.url_for` / `this._p` / `this.date` / `this.fragment_cache` ...），
 * 全局还用到 `hexo.config` / `hexo.theme.config` / `hexo.locals`。
 *
 * 移植原则（对应 P2-6）：
 *  1. 全部改成**纯函数**：上下文、配置、站点数据、`url_for`、`_p`、日期格式化都显式传入，
 *     不 import Hexo，也不读全局状态；同样的输入必得同样的输出。
 *  2. 业务逻辑（分组、计数、权重排序、比例分档、截断、URL 处理）**逐行对照上游**，
 *     包括上游的边角行为（例如 `limit` 缺省时的 `NaN`、`findArchivesTitle` 的菜单描边逻辑）。
 *  3. 依赖 moment / hexo-util 的部分用等价实现替换，并在 `scripts/check-helpers.mjs` 里
 *     直接加载上游 JS 作为 oracle 做逐字节对比（见该脚本「上游 oracle」段落）。
 *
 * 与上游的已知差异都就地标注 `@deviation`，并在 docs/notes/P2-6-11-helpers-i18n.md 汇总。
 *
 * 文件 → 导出函数速查：
 *  - aside_archives.js    → asideArchives
 *  - aside_categories.js  → asideCategories
 *  - catalog_list.js      → catalogList
 *  - findArchiveLength.js → getArchiveLength
 *  - get_version.js       → getVersion
 *  - inject_head_js.js    → injectHeadJs
 *  - page.js              → pageDescription / getPageFillDescription / cloudTags / urlNoIndex /
 *                           md5 / injectHtml / findArchivesTitle / isImgOrUrl
 *  - random.js            → randomGenerator
 *  - related_post.js      → relatedPosts
 *  - sort_attr_post.js    → sortAttrPost
 *  - tags_page_list.js    → tagsPageList
 *  - year.js              → getAnimalIcon
 */

/* ==================================================================== */
/* 通用注入类型                                                          */
/* ==================================================================== */

/** 上游 `this.url_for(path)`。 */
export type UrlFor = (path: string) => string
/** 上游 `this._p(key, ...args)`（本项目用 src/i18n 的 t/tp 绑定）。 */
export type Translate = (key: string, ...args: unknown[]) => string
/** 上游 `this.date(value, format)`（moment 格式化，由调用方注入）。 */
export type FormatDate = (value: unknown, format: string) => string

/** 上游 `post.date`（Hexo 里是 moment，这里接受 Date / ISO 字符串 / 时间戳）。 */
export type DateLike = Date | string | number

/* ==================================================================== */
/* hexo-util 等价实现（上游 page.js 依赖 stripHTML / escapeHTML / prettyUrls）  */
/* ==================================================================== */

const ESCAPE_TEST_NO_ENCODE = /[<>"'`/=]|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/
const ESCAPE_REPLACE_NO_ENCODE = new RegExp(ESCAPE_TEST_NO_ENCODE.source, 'g')
const ESCAPE_REPLACEMENTS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
  '/': '&#x2F;',
  '=': '&#x3D;',
}

/**
 * hexo-util `escapeHTML()` 等价实现（源码即 marked.js helpers 的转义表）。
 * 与上游一致：已经是 HTML 实体的 `&...;` 不会被二次转义。
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') throw new TypeError('str must be a string!')
  if (ESCAPE_TEST_NO_ENCODE.test(str)) {
    return str.replace(ESCAPE_REPLACE_NO_ENCODE, (ch) => ESCAPE_REPLACEMENTS[ch])
  }
  return str
}

const STATE_PLAINTEXT = 0
const STATE_HTML = 1
const STATE_COMMENT = 2

/**
 * hexo-util `stripHTML()` 等价实现（上游为 striptags 的状态机移植）。
 *
 * 行为要点（与 striptags 一致）：
 *  - 去掉标签与 `<!-- -->` 注释，保留纯文本；
 *  - 引号内的 `<` / `>` 不当标签边界；
 *  - 裸 `<` 后跟空白（如 `a < b`）按文本处理，输出 `< `；
 *  - 非字符串安全返回空串。
 */
export function stripHtml(html?: string | null): string {
  if (typeof html !== 'string') return ''

  const CHAR_LT = 60
  const CHAR_GT = 62
  const CHAR_QUOTE = 34
  const CHAR_APOS = 39
  const CHAR_DASH = 45
  const CHAR_SPACE = 32
  const CHAR_NEWLINE = 10
  const CHAR_EXCLAIM = 33

  let state = STATE_PLAINTEXT
  let depth = 0
  let inQuoteChar = 0
  let output = ''
  let tagStart = -1
  let plainTextStart = 0
  const { length } = html

  for (let idx = 0; idx < length; idx++) {
    const charCode = html.charCodeAt(idx)

    if (state === STATE_PLAINTEXT) {
      if (charCode === CHAR_LT) {
        output += html.slice(plainTextStart, idx)
        state = STATE_HTML
        tagStart = idx
      }
    } else if (state === STATE_HTML) {
      if (charCode === CHAR_LT) {
        if (!inQuoteChar) depth++
      } else if (charCode === CHAR_GT) {
        if (!inQuoteChar) {
          if (depth) {
            depth--
          } else {
            inQuoteChar = 0
            state = STATE_PLAINTEXT
            tagStart = -1
            plainTextStart = idx + 1
          }
        }
      } else if (charCode === CHAR_QUOTE || charCode === CHAR_APOS) {
        if (charCode === inQuoteChar) {
          inQuoteChar = 0
        } else {
          inQuoteChar = inQuoteChar || charCode
        }
      } else if (charCode === CHAR_DASH) {
        if (
          idx - tagStart === 3 &&
          html.charCodeAt(tagStart + 1) === CHAR_EXCLAIM &&
          html.charCodeAt(tagStart + 2) === CHAR_DASH
        ) {
          state = STATE_COMMENT
        }
      } else if (charCode === CHAR_SPACE || charCode === CHAR_NEWLINE) {
        if (idx - tagStart === 1) {
          state = STATE_PLAINTEXT
          output += '< '
          tagStart = -1
          plainTextStart = idx + 1
        }
      }
    } else if (state === STATE_COMMENT) {
      if (charCode === CHAR_GT) {
        if (idx >= 2 && html.charCodeAt(idx - 1) === CHAR_DASH && html.charCodeAt(idx - 2) === CHAR_DASH) {
          state = STATE_PLAINTEXT
          plainTextStart = idx + 1
        }
        tagStart = -1
      }
    }
  }

  if (state === STATE_PLAINTEXT && plainTextStart < length) output += html.slice(plainTextStart)

  return output
}

export interface PrettyUrlsOptions {
  trailing_index?: boolean
  trailing_html?: boolean
}

/**
 * hexo-util `prettyUrls()` 等价实现。
 * 上游 `urlNoIndex` 传入 `{ trailing_index: false, trailing_html: true }`，
 * 即只去掉结尾的 `index.html`，保留其它 `.html`。
 */
export function prettyUrls(url: string, options: PrettyUrlsOptions = {}): string {
  const merged = { trailing_index: true, trailing_html: true, ...options }
  const indexPattern = /index\.html$/
  let result = url
  if (merged.trailing_index === false) result = result.replace(indexPattern, '')
  if (merged.trailing_html === false && !indexPattern.test(result)) {
    result = result.replace(/\.html$/, '')
  }
  return result
}

/* ==================================================================== */
/* 日期工具（替代 moment）                                                */
/* ==================================================================== */

export interface DateParts {
  year: number
  month: number // 1-12
  day: number
}

/**
 * 等价 moment 的 `toMomentLocale()`：Hexo 语言名 → moment locale。
 * 上游对 undefined 返回 undefined；空串 / `en` / `default` → `en`；
 * 其余小写并把 `_` 换成 `-`（`zh_CN` → `zh-cn`）。
 */
export function toMomentLocale(lang?: string | null): string | undefined {
  if (lang === undefined) return undefined
  if (!lang || lang === 'en' || lang === 'default') return 'en'
  return lang.toLowerCase().replace('_', '-')
}

/**
 * 取年/月/日。
 *
 * 上游用 moment 的本地时区（或 `config.timezone` 指定时区）。
 * @deviation Astro content collection 的 `date` 通常是 UTC 语义的 Date，
 * 因此这里默认按 **UTC** 取年月日；需要复刻上游时区行为时传 IANA `timezone`。
 */
export function getDateParts(value: DateLike, timezone?: string): DateParts {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid date: ${String(value)}`)

  if (timezone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = formatter.formatToParts(date)
    const pick = (type: string): number => Number(parts.find((part) => part.type === type)?.value)
    return { year: pick('year'), month: pick('month'), day: pick('day') }
  }

  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

/**
 * moment 内置 locale 的月份表（`MMMM` / `MMM` 的实际输出）。
 *
 * 注意不能直接用 `Intl`：`Intl.DateTimeFormat('zh-TW', { month: 'long' })` 给的是 `5月`，
 * 而 moment `zh-tw` 的 `MMMM` 是 `五月`（short 才是 `5月`）。这里按 moment 语言数据对齐。
 */
const MOMENT_MONTHS: Record<string, { long: readonly string[]; short: readonly string[] }> = {
  en: {
    long: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  'zh-cn': {
    long: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
    short: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  },
  'zh-tw': {
    long: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
    short: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  },
}

/** 语言 + 月（1-12）→ 本地化月份名（等价 moment 的 MMMM / MMM）。未知 locale 退回 Intl。 */
export function monthName(month: number, locale = 'en', style: 'long' | 'short' = 'long'): string {
  const key = String(locale || 'en').toLowerCase()
  const table = MOMENT_MONTHS[key]
  if (table) return table[style][month - 1]
  const formatter = new Intl.DateTimeFormat(locale || 'en', { month: style, timeZone: 'UTC' })
  return formatter.format(new Date(Date.UTC(2000, month - 1, 1)))
}

/**
 * moment `date.format(fmt)` 的常用 token 子集：`YYYY` `YY` `MMMM` `MMM` `MM` `M` `DD` `D`。
 * 覆盖主题配置会用到的格式（默认 `MMMM YYYY`；上游注释里的 `YYYY年MM月` 也可用）。
 */
export function formatMomentLike(parts: DateParts, format: string, locale = 'en'): string {
  const tokens: Record<string, string> = {
    YYYY: String(parts.year).padStart(4, '0'),
    YY: String(parts.year % 100).padStart(2, '0'),
    MMMM: monthName(parts.month, locale, 'long'),
    MMM: monthName(parts.month, locale, 'short'),
    MM: String(parts.month).padStart(2, '0'),
    M: String(parts.month),
    DD: String(parts.day).padStart(2, '0'),
    D: String(parts.day),
  }
  return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D/g, (token) => tokens[token])
}

function timestampOf(value: DateLike | undefined): number {
  if (value === undefined) return Number.NaN
  const date = value instanceof Date ? value : new Date(value)
  return date.getTime()
}

/** 按字段比较：数字按大小，其他按字符串（`>` / `<`，与 warehouse 的字符串比较一致）。 */
export function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const left = String(a)
  const right = String(b)
  if (left > right) return 1
  if (left < right) return -1
  return 0
}

function compareObjects<T>(field: string, order: 1 | -1) {
  return (a: T, b: T): number => {
    const left = (a as Record<string, unknown>)[field]
    const right = (b as Record<string, unknown>)[field]
    return compareValues(left, right) * (order === -1 ? -1 : 1)
  }
}

/* ==================================================================== */
/* 1. aside_archives.js → asideArchives                                    */
/* ==================================================================== */

export interface AsideArchivesOptions {
  /** `monthly`（默认）或 `yearly`。 */
  type?: string
  /** moment 格式，默认 monthly → `MMMM YYYY`、yearly → `YYYY`。 */
  format?: string
  /** 对归档名做二次转换（上游 pug 未用，但 helper 支持）。 */
  transform?: (name: string) => string
  /** 是否显示篇数，默认 true。 */
  show_count?: boolean
  /** 1 = 升序，-1 = 降序（默认）。 */
  order?: 1 | -1
  /** 0 = 全部；缺省时上游行为是 NaN（见 @deviation）。 */
  limit?: number
}

export interface AsideArchivesInput {
  /** 等价 `this.site.posts`（无序即可，函数内部按 date 排序）。 */
  posts: ReadonlyArray<{ date: DateLike }>
  /** 等价 `config.archive_dir`。 */
  archiveDir: string
  /** 等价 `config.timezone`。 */
  timezone?: string
  /** 等价 `this.page.lang || this.page.language || config.language`。 */
  language?: string
  urlFor: UrlFor
  t: Translate
}

interface AsideArchiveItem {
  name: string
  year: number
  month: number
  count: number
}

/**
 * 上游 `aside_archives`：把文章按【年】或【年+月】归档，输出侧栏归档卡片 HTML。
 *
 * @deviation `limit` 缺省时上游 `Math.min(len, undefined)` 得到 `NaN` → 渲染空列表；
 * 这里保留该行为（而不是悄悄当成「全部」），保证与上游一致。
 */
export function asideArchives(
  options: AsideArchivesOptions = {},
  input: AsideArchivesInput,
): string {
  const { posts, archiveDir, timezone, language, urlFor, t } = input
  const type = options.type || 'monthly'
  const transform = options.transform
  const showCount = Object.prototype.hasOwnProperty.call(options, 'show_count')
    ? options.show_count
    : true
  const order = options.order || -1
  const limit = options.limit
  const compareFunc =
    type === 'monthly'
      ? (yearA: number, monthA: number, yearB: number, monthB: number): boolean =>
          yearA === yearB && monthA === monthB
      : (yearA: number, monthA: number, yearB: number, monthB: number): boolean => yearA === yearB

  let format = options.format
  if (!format) format = type === 'monthly' ? 'MMMM YYYY' : 'YYYY'

  if (!posts.length) return ''

  const sorted = [...posts].sort(
    (a, b) => (timestampOf(a.date) - timestampOf(b.date)) * (order === -1 ? -1 : 1),
  )

  const locale = toMomentLocale(language) || 'en'
  const data: AsideArchiveItem[] = []
  let length = 0

  for (const post of sorted) {
    const parts = getDateParts(post.date, timezone)
    const year = parts.year
    const month = parts.month
    const lastData = data[length - 1]

    if (!lastData || !compareFunc(lastData.year, lastData.month, year, month)) {
      const name = formatMomentLike(parts, format, locale)
      length = data.push({ name, year, month, count: 1 })
    } else {
      lastData.count++
    }
  }

  const link = (item: AsideArchiveItem): string => {
    let url = `${archiveDir}/${item.year}/`
    if (type === 'monthly') {
      if (item.month < 10) url += '0'
      url += `${item.month}/`
    }
    return urlFor(url)
  }

  const len = data.length
  const judge = limit === 0 ? len : Math.min(len, limit as number)

  let result = ''
  result += `<div class="item-headline"><i class="anzhiyufont anzhiyu-icon-archive"></i><span>${t(
    'aside.card_archives',
  )}</span>`

  if (len > judge) {
    result += `<a class="card-more-btn" href="${urlFor(archiveDir)}/" title="${t('aside.more_button')}">
    <i class="anzhiyufont anzhiyu-icon-angle-right"></i></a>`
  }

  result += '</div><ul class="card-archive-list">'

  for (let i = 0; i < judge; i++) {
    const item = data[i]
    result += '<li class="card-archive-list-item">'
    result += `<a class="card-archive-list-link" href="${link(item)}">`
    result += '<span class="card-archive-list-date">'
    result += transform ? transform(item.name) : item.name
    result += '</span>'
    if (showCount) {
      result += `<div class="card-archive-list-count-group"><span class="card-archive-list-count">${item.count}</span><span>篇</span></div>`
    }
    result += '</a>'
    result += '</li>'
  }

  result += '</ul>'
  return result
}

/* ==================================================================== */
/* 2. aside_categories.js → asideCategories                                */
/* ==================================================================== */

export interface AsideCategoryLike {
  /** 等价 Hexo category 的 `_id`（层级关系靠 parent 指回来）。 */
  _id: string
  name: string
  path: string
  /** 该分类下的文章数。 */
  length: number
  parent?: string | null
}

export interface AsideCategoriesOptions {
  show_count?: boolean
  /** 层级深度；0 / 缺省 = 不限制。 */
  depth?: number | string
  orderby?: string
  order?: 1 | -1
  /** 0 = 全部；缺省时上游行为见 @deviation。 */
  limit?: number
  /** `true` 展开、`'none'` 不展开、其他值只折叠。 */
  expand?: boolean | string
}

export interface AsideCategoriesInput {
  categories: ReadonlyArray<AsideCategoryLike>
  /** 等价 `config.category_dir`。 */
  categoryDir: string
  urlFor: UrlFor
  t: Translate
}

/**
 * 上游 `aside_categories`：输出侧栏分类卡片（支持 parent 层级与展开按钮）。
 *
 * @deviation 上游通过 `this.site.categories.find({parent})` 查询层级；这里改为在纯数组上
 * 过滤，语义等价（`parent` 不存在/为 null 视为顶层）。
 */
export function asideCategories(
  options: AsideCategoriesOptions = {},
  input: AsideCategoriesInput,
): string {
  const { categories, categoryDir, urlFor, t } = input
  if (!categories || !categories.length) return ''

  const showCount = Object.prototype.hasOwnProperty.call(options, 'show_count')
    ? options.show_count
    : true
  const depth = options.depth ? Number.parseInt(String(options.depth), 10) : 0
  const orderby = options.orderby || 'name'
  const order = options.order || 1
  const limit = options.limit === 0 ? categories.length : options.limit
  const isExpand = options.expand !== 'none'
  const expandClass = isExpand && options.expand === true ? 'expand' : ''
  const buttonLabel = t('aside.more_button')
  // 上游第 24 行：categoryDir = this.url_for(config.category_dir)
  const categoryUrl = urlFor(categoryDir)
  let expandBtn = ''

  const prepareQuery = (parent?: string): AsideCategoryLike[] => {
    const filtered = categories.filter((cat) =>
      parent ? cat.parent === parent : cat.parent === undefined || cat.parent === null,
    )
    return [...filtered]
      .sort(compareObjects<AsideCategoryLike>(orderby, order))
      .filter((cat) => Boolean(cat.length))
  }

  const hierarchicalList = (
    budget: number | undefined,
    level: number,
    parent?: string,
    topparent = true,
  ): [string, number | undefined] => {
    let result = ''
    let tLeft = budget
    const isTopParent = topparent
    if ((tLeft as number) > 0) {
      prepareQuery(parent).forEach((cat) => {
        if ((tLeft as number) > 0) {
          tLeft = (tLeft as number) - 1
          let child: string | undefined
          if (!depth || level + 1 < depth) {
            const childList = hierarchicalList(tLeft, level + 1, cat._id, false)
            child = childList[0]
            tLeft = childList[1]
          }

          const parentClass = isExpand && isTopParent && child ? 'parent' : ''

          result += `<li class="card-category-list-item ${parentClass}">`
          result += `<a class="card-category-list-link" href="${urlFor(cat.path)}">`
          result += `<span class="card-category-list-name">${cat.name}</span>`
          if (showCount) {
            result += `<span class="card-category-list-count">${cat.length}</span>`
          }
          if (isExpand && isTopParent && child) {
            expandBtn = ' expandBtn'
            result += `<i class="anzhiyufont anzhiyu-icon-caret-left ${expandClass}"></i>`
          }
          result += '</a>'
          if (child) {
            result += `<ul class="card-category-list child">${child}</ul>`
          }
          result += '</li>'
        }
      })
    }
    return [result, tLeft]
  }

  const list = hierarchicalList(limit, 0)

  const moreButton = (): string => {
    if (categories.length <= (limit as number)) return ''
    return `<a class="card-more-btn" href="${categoryUrl}/" title="${buttonLabel}">
    <i class="anzhiyufont anzhiyu-icon-angle-right"></i></a>`
  }

  return `<div class="item-headline">
            <i class="anzhiyufont anzhiyu-icon-folder-open"></i>
            <span>${t('aside.card_categories')}</span>
            ${moreButton()}
            </div>
            <ul class="card-category-list${expandBtn}" id="aside-cat-list">
            ${list[0]}
            </ul>`
}

/* ==================================================================== */
/* 3. catalog_list.js → catalogList                                       */
/* ==================================================================== */

export interface CatalogItemLike {
  path: string
  name: string
}

/** 上游 `catalog_list`：输出分类/标签页顶部的目录列表 HTML。 */
export function catalogList(items: ReadonlyArray<CatalogItemLike>): string {
  let html = ''
  for (const item of items) {
    html += `
    <div class="catalog-list-item" id="/${item.path}">
      <a href="/${item.path}">
        ${item.name}
      </a>
    </div>
    `
  }
  return html
}

/* ==================================================================== */
/* 4. findArchiveLength.js → getArchiveLength                             */
/* ==================================================================== */

export interface ArchiveGeneratorConfig {
  enable?: boolean
  yearly?: boolean
  monthly?: boolean
  daily?: boolean
}

export interface GetArchiveLengthInput {
  posts: ReadonlyArray<{ date: DateLike }>
  /** 归档页的 `page.year / page.month / page.day`。 */
  page: { year?: number | string | null; month?: number | string | null; day?: number | string | null }
  /** 等价 `hexo.config.archive_generator`。 */
  archiveGenerator?: ArchiveGeneratorConfig
  timezone?: string
}

interface ArchiveCountItem {
  name: string | number
  year: number
  month: number
  day: number
  count: number
}

/**
 * 上游 `getArchiveLength`：返回当前归档页（年/月/日）对应的文章数。
 *
 * @deviation 上游 `data.find(...).count` 在找不到对应归档时抛 TypeError；这里返回 0。
 */
export function getArchiveLength(input: GetArchiveLengthInput): number {
  const { posts, page, archiveGenerator, timezone } = input
  const { enable, yearly, monthly, daily } = archiveGenerator ?? {}

  if (enable === false) return posts.length
  const { year, month, day } = page
  if (yearly === false || !year) return posts.length

  const sorted = [...posts].sort((a, b) => timestampOf(a.date) - timestampOf(b.date))

  const compareFunc = (
    type: 'year' | 'month' | 'day',
    y1: number,
    m1: number,
    d1: number,
    y2: number,
    m2: number,
    d2: number,
  ): boolean => {
    switch (type) {
      case 'year':
        return y1 === y2
      case 'month':
        return y1 === y2 && m1 === m2
      case 'day':
        return y1 === y2 && m1 === m2 && d1 === d2
      default:
        return false
    }
  }

  const generateDateObj = (type: 'year' | 'month' | 'day'): ArchiveCountItem[] =>
    sorted.reduce<ArchiveCountItem[]>((dateObj, post) => {
      const parts = getDateParts(post.date, timezone)
      const lastData = dateObj[dateObj.length - 1]
      if (
        !lastData ||
        !compareFunc(type, lastData.year, lastData.month, lastData.day, parts.year, parts.month, parts.day)
      ) {
        const name =
          type === 'year'
            ? parts.year
            : type === 'month'
              ? `${parts.year}-${parts.month}`
              : `${parts.year}-${parts.month}-${parts.day}`
        dateObj.push({
          name,
          year: parts.year,
          month: parts.month,
          day: parts.day,
          count: 1,
        })
      } else {
        lastData.count++
      }
      return dateObj
    }, [])

  // 上游把结果放进 this.fragment_cache('createArchiveObj')；纯函数版本每次现算。
  const dateObjs: ArchiveCountItem[] = []
  if (yearly) dateObjs.push(...generateDateObj('year'))
  if (monthly) dateObjs.push(...generateDateObj('month'))
  if (daily) dateObjs.push(...generateDateObj('day'))

  const name = month ? (day ? `${year}-${month}-${day}` : `${year}-${month}`) : year
  const found = dateObjs.find((item) => item.name === name)
  return found ? found.count : 0
}

/* ==================================================================== */
/* 5. get_version.js → getVersion                                        */
/* ==================================================================== */

/** 上游 `get_version`：`require('../../package.json').version`。 */
export function getVersion(pkg: { version?: string } = {}): string {
  return pkg.version ?? ''
}

/* ==================================================================== */
/* 6. inject_head_js.js → injectHeadJs                                    */
/* ==================================================================== */

export interface InjectHeadJsInput {
  /** 等价 `this.theme.darkmode`。 */
  darkmode: {
    enable?: boolean
    start?: number
    end?: number
    /** 0 = 只手动、1 = 跟随系统 + 时段、2 = 仅时段。 */
    autoChangeMode?: number
  }
  /** 等价 `this.theme.aside`。 */
  aside: { enable?: boolean; button?: boolean }
  /** 等价 `hexo.theme.config.theme_color`。 */
  themeColor?: {
    enable?: boolean
    meta_theme_color_light?: string
    meta_theme_color_dark?: string
  }
}

/**
 * 上游 `inject_head_js`：把暗色模式 / 本地存储 / getScript / getCSS / aside 状态
 * 等启动脚本内联注入 `<head>`。输出为一段可执行 `<script>` 字符串。
 */
export function injectHeadJs(input: InjectHeadJsInput): string {
  const { darkmode, aside, themeColor } = input
  const start = darkmode.start || 6
  const end = darkmode.end || 18
  const themeColorLight = (themeColor && themeColor.enable && themeColor.meta_theme_color_light) || '#ffffff'
  const themeColorDark = (themeColor && themeColor.enable && themeColor.meta_theme_color_dark) || '#0d0d0d'

  const createLocalStore = (): string => `
      win.saveToLocal = {
        set: (key, value, ttl) => {
          if (ttl === 0) return
          const now = Date.now()
          const expiry = now + ttl * 86400000
          const item = {
            value,
            expiry
          }
          localStorage.setItem(key, JSON.stringify(item))
        },
      
        get: key => {
          const itemStr = localStorage.getItem(key)
      
          if (!itemStr) {
            return undefined
          }
          const item = JSON.parse(itemStr)
          const now = Date.now()
      
          if (now > item.expiry) {
            localStorage.removeItem(key)
            return undefined
          }
          return item.value
        }
      }
    `

  // https://stackoverflow.com/questions/16839698/jquery-getscript-alternative-in-native-javascript
  const createGetScript = (): string => `
      win.getScript = (url, attr = {}) => new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = url
        script.async = true
        script.onerror = reject
        script.onload = script.onreadystatechange = function() {
          const loadState = this.readyState
          if (loadState && loadState !== 'loaded' && loadState !== 'complete') return
          script.onload = script.onreadystatechange = null
          resolve()
        }

        Object.keys(attr).forEach(key => {
          script.setAttribute(key, attr[key])
        })

        document.head.appendChild(script)
      })
    `

  const createGetCSS = (): string => `
      win.getCSS = (url, id = false) => new Promise((resolve, reject) => {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        if (id) link.id = id
        link.onerror = reject
        link.onload = link.onreadystatechange = function() {
          const loadState = this.readyState
          if (loadState && loadState !== 'loaded' && loadState !== 'complete') return
          link.onload = link.onreadystatechange = null
          resolve()
        }
        document.head.appendChild(link)
      })
    `

  const createDarkmodeJs = (): string => {
    if (!darkmode.enable) return ''

    let darkmodeJs = `
      win.activateDarkMode = () => {
        document.documentElement.setAttribute('data-theme', 'dark')
        if (document.querySelector('meta[name="theme-color"]') !== null) {
          document.querySelector('meta[name="theme-color"]').setAttribute('content', '${themeColorDark}')
        }
      }
      win.activateLightMode = () => {
        document.documentElement.setAttribute('data-theme', 'light')
        if (document.querySelector('meta[name="theme-color"]') !== null) {
          document.querySelector('meta[name="theme-color"]').setAttribute('content', '${themeColorLight}')
        }
      }
      const t = saveToLocal.get('theme')
    `

    const autoChangeMode = darkmode.autoChangeMode

    if (autoChangeMode === 1) {
      darkmodeJs += `
          const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches
          const isLightMode = window.matchMedia('(prefers-color-scheme: light)').matches
          const isNotSpecified = window.matchMedia('(prefers-color-scheme: no-preference)').matches
          const hasNoSupport = !isDarkMode && !isLightMode && !isNotSpecified

          if (t === undefined) {
            if (isLightMode) activateLightMode()
            else if (isDarkMode) activateDarkMode()
            else if (isNotSpecified || hasNoSupport) {
              const now = new Date()
              const hour = now.getHours()
              const isNight = hour <= ${start} || hour >= ${end}
              isNight ? activateDarkMode() : activateLightMode()
            }
            window.matchMedia('(prefers-color-scheme: dark)').addListener(e => {
              if (saveToLocal.get('theme') === undefined) {
                e.matches ? activateDarkMode() : activateLightMode()
              }
            })
          } else if (t === 'light') activateLightMode()
          else activateDarkMode()
        `
    } else if (autoChangeMode === 2) {
      darkmodeJs += `
          const now = new Date()
          const hour = now.getHours()
          const isNight = hour <= ${start} || hour >= ${end}
          if (t === undefined) isNight ? activateDarkMode() : activateLightMode()
          else if (t === 'light') activateLightMode()
          else activateDarkMode()
        `
    } else {
      darkmodeJs += `
        if (t === 'dark') activateDarkMode()
        else if (t === 'light') activateLightMode()
      `
    }

    return darkmodeJs
  }

  const createAsideStatus = (): string => {
    if (!aside.enable || !aside.button) return ''

    return `
      const asideStatus = saveToLocal.get('aside-status')
      if (asideStatus !== undefined) {
        if (asideStatus === 'hide') {
          document.documentElement.classList.add('hide-aside')
        } else {
          document.documentElement.classList.remove('hide-aside')
        }
      }
    `
  }

  const createDetectApple = (): string => `
      const detectApple = () => {
        if(/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent)){
          document.documentElement.classList.add('apple')
        }
      }
      detectApple()
    `

  return `<script>(win=>{${
    createLocalStore() +
    createGetScript() +
    createGetCSS() +
    createDarkmodeJs() +
    createAsideStatus() +
    createDetectApple()
  }})(window)</script>`
}

/* ==================================================================== */
/* 7. page.js → pageDescription / getPageFillDescription / cloudTags /     */
/*    urlNoIndex / md5 / injectHtml / findArchivesTitle / isImgOrUrl      */
/* ==================================================================== */

export interface PageLike {
  title?: string
  description?: string
  content?: string
}

export interface PageDescriptionInput {
  /** 等价 `this.page`。 */
  page: PageLike
  /** 等价 `this.config`（只读 `description`）。 */
  config: { description?: string }
}

/**
 * 上游 `page_description`：`page.description || page.content || page.title || config.description`
 * → stripHTML → 截前 150 字符 → trim → escapeHTML → 换行转空格。
 * 全空时返回 `undefined`（上游隐式 return）。
 */
export function pageDescription(input: PageDescriptionInput): string | undefined {
  const { page, config } = input
  let description = page.description || page.content || page.title || config.description
  if (description) {
    description = escapeHtml(stripHtml(description).substring(0, 150).trim()).replace(/\n/g, ' ')
    return description
  }
  return undefined
}

/**
 * 上游 `get_page_fill_description`：抽取正文 h1-h6 的标题文本 + 正文里的中文，
 * 用于文章页底部/填充描述。
 */
export function getPageFillDescription(input: PageDescriptionInput): string | undefined {
  const { page, config } = input
  let description = page.content || page.description || page.title || config.description
  if (!description) return undefined

  // 使用正则表达式匹配 h1-h6 标签中的文本内容
  const regex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/g
  const headings: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(description))) {
    headings.push(match[0])
  }

  const contents = headings.map((heading) => {
    // 去掉 a 标签及其内容
    const text = heading.replace(/<a[^>]*>.*?<\/a>/g, '')
    // 去除特殊符号 &,:,; 等
    return text.replace(/<\/?[^>]+>|&|:|;|quot;|，|,|“|”|"|'|#/g, '')
  })

  // 排除 div.post-ai-description 元素中的内容
  const excludedDivRegex = /<div[^>]*class="?post-ai-description"?.*?>[\s\S]*?<\/div>/gi
  description = description.replace(excludedDivRegex, '')

  description = escapeHtml(stripHtml(description).trim())
    .replace(/\n/g, ' ')
    .replace(/[^\u4e00-\u9fa5]/gi, '')

  return contents.join(', ') + description
}

export interface CloudTagLike {
  name: string
  path: string
  length: number
}

export interface CloudTagsOptions {
  /** 等价上游 `options.source`（Hexo `site.tags` Query），这里直接给 tag 数组。 */
  tags: ReadonlyArray<CloudTagLike>
  minfontsize: number
  maxfontsize: number
  /** 只取前 limit 个 tag（> 0 时生效）。 */
  limit?: number
  /** 字号单位，默认 px。 */
  unit?: string
  /** 随机颜色（上游用 Math.random，这里可注入以做确定性测试）。 */
  color?: boolean
  /** 需要高亮的 tag 名列表。 */
  highlightTags?: readonly string[]
}

export interface CloudTagsInput {
  urlFor: UrlFor
  /** 默认 `Math.random`。 */
  random?: () => number
}

/**
 * 上游 `cloudTags`：标签云。按「不同文章数」比例把字号线性分档（最少的用 minfontsize，
 * 最多的用 maxfontsize），再按 tag 名字排序输出。
 */
export function cloudTags(options: CloudTagsOptions, input: CloudTagsInput): string {
  let source: ReadonlyArray<CloudTagLike> = options.tags
  const { minfontsize, maxfontsize, unit = 'px', color: colorful = false, highlightTags = [] } = options
  const random = input.random ?? Math.random
  const limit = options.limit

  if ((limit as number) > 0) {
    source = source.slice(0, limit)
  }

  const sizes: number[] = []
  for (const tag of [...source].sort(compareObjects<CloudTagLike>('length', 1))) {
    if (sizes.includes(tag.length)) continue
    sizes.push(tag.length)
  }

  const length = sizes.length - 1
  let result = ''

  for (const tag of [...source].sort(compareObjects<CloudTagLike>('name', 1))) {
    const ratio = length ? sizes.indexOf(tag.length) / length : 0
    const size = minfontsize + (maxfontsize - minfontsize) * ratio
    let style = `font-size: ${Number.parseFloat(size.toFixed(2))}${unit};`
    if (colorful) {
      const color = `rgb(${Math.floor(random() * 201)}, ${Math.floor(random() * 201)}, ${Math.floor(random() * 201)})` // 0,0,0 -> 200,200,200
      style += ` color: ${color};`
    }

    const matchingTag = highlightTags.find((highlightTag) => highlightTag === tag.name)
    if (matchingTag) {
      style += ' font-weight: 500; color: var(--anzhiyu-lighttext)'
    }
    result += `<a href="${input.urlFor(tag.path)}" style="${style}">${tag.name}<sup>${tag.length}</sup></a>`
  }
  return result
}

/**
 * 上游 `urlNoIndex`：`prettyUrls(url || this.url, { trailing_index: false, trailing_html: true })`。
 *
 * @deviation 上游 url 与 this.url 都为空时会把 undefined 传给 prettyUrls 并抛 TypeError；
 * 这里回退空串。
 */
export function urlNoIndex(url?: string | null, fallbackUrl?: string | null): string {
  return prettyUrls(url || fallbackUrl || '', { trailing_index: false, trailing_html: true })
}

/** 十六进制 MD5（RFC 1321，UTF-8 输入），等价 Node `crypto.createHash('md5').update(str, 'utf8').digest('hex')`。 */
export function md5Hex(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const total = bytes.length + 9
  const paddedLength = Math.ceil(total / 64) * 64
  const buffer = new Uint8Array(paddedLength)
  buffer.set(bytes)
  buffer[bytes.length] = 0x80
  const bitLength = bytes.length * 8
  const view = new DataView(buffer.buffer)
  view.setUint32(paddedLength - 8, bitLength >>> 0, true)
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000) >>> 0, true)

  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
  const constants = new Int32Array(64)
  for (let i = 0; i < 64; i++) constants[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0

  const state = new Int32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476])
  const words = new Int32Array(16)
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, true) | 0
    let a = state[0]
    let b = state[1]
    let c = state[2]
    let d = state[3]
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const shifted = (i >> 4) * 4 + (i % 4)
      const sum = (a + f + constants[i] + words[g]) | 0
      a = d
      d = c
      c = b
      b = (b + ((sum << shifts[shifted]) | (sum >>> (32 - shifts[shifted])))) | 0
    }
    state[0] = (state[0] + a) | 0
    state[1] = (state[1] + b) | 0
    state[2] = (state[2] + c) | 0
    state[3] = (state[3] + d) | 0
  }

  const hex = (value: number): string => {
    let out = ''
    for (let i = 0; i < 4; i++) out += ((value >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')
    return out
  }
  return hex(state[0]) + hex(state[1]) + hex(state[2]) + hex(state[3])
}

/**
 * 上游 `md5`：`md5(decodeURI(this.url_for(path)))`。
 * @deviation 上游直接 `crypto.createHash('md5')`；这里用纯函数实现，避免把 node:crypto
 * 带进浏览器侧 bundle（正确性由 oracle 对比 + RFC 向量覆盖）。
 */
export function md5(path: string, urlFor: UrlFor): string {
  return md5Hex(decodeURI(urlFor(path)))
}

/** 上游 `injectHtml`：把 `theme.inject.head` / `.bottom` 数组合并成一个字符串。 */
export function injectHtml(data?: readonly string[] | null): string {
  if (!data) return ''
  return data.join('')
}

export interface FindArchivesTitlePage {
  year?: number | string | null
  month?: number | string | null
}

export interface FindArchivesTitleInput {
  /** 等价 `this.theme.config.aside.card_archives.format`。 */
  archiveFormat?: string
  /** 等价 `this._p`。 */
  t: Translate
  /** 等价 `this.date`（年月替换 moment 的注入点）。 */
  formatDate: FormatDate
}

const ARCHIVES_PATH_PATTERN = /\/archives\//

/**
 * 上游 `findArchivesTitle`：归档页标题。
 *  - `page.year` 有值 → 按月/年格式化 dateStr；
 *  - 否则用菜单里指向 `/archives/` 的键名，找不到再回退 `_p('page.archives')`。
 *
 * 注意：上游 `loop()` 在嵌套菜单下**忽略递归返回值**（只有扁平的 `key: '/archives/'`
 * 才返回键名），这里逐行保留该行为。
 */
export function findArchivesTitle(
  page: FindArchivesTitlePage,
  menu: unknown,
  input: FindArchivesTitleInput,
): string {
  const { archiveFormat = 'MMMM YYYY', t, formatDate } = input

  if (page.year) {
    const dateStr = page.month ? `${page.year}-${page.month}` : `${page.year}`
    const dateFormat = page.month ? archiveFormat : 'YYYY'
    return formatDate(dateStr, dateFormat)
  }

  const defaultTitle = t('page.archives')
  if (!menu) return defaultTitle

  const loop = (node: unknown): string | undefined => {
    const record = node as Record<string, unknown>
    for (const key in record) {
      const value = record[key]
      if (typeof value === 'object') {
        loop(value)
      }
      if (ARCHIVES_PATH_PATTERN.test(value as string)) {
        return key
      }
    }
  }

  return loop(menu) || defaultTitle
}

const IMG_TEST_REG = /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i

/** 上游 `isImgOrUrl`：路径是完整 URL（含 `//`）或以图片扩展名结尾。 */
export function isImgOrUrl(path: string): boolean {
  return path.indexOf('//') !== -1 || IMG_TEST_REG.test(path)
}

/* ==================================================================== */
/* 8. random.js → randomGenerator                                        */
/* ==================================================================== */

export interface RandomLinkGroup {
  link_list: ReadonlyArray<{ name: string; link: string; avatar?: string }>
}

export interface RandomGeneratorInput {
  /** 等价 `hexo.config.random.path`。 */
  path?: string
  /** 等价 `theme.pjax.enable`（决定用 pjax.loadUrl 还是 location.href）。 */
  pjaxEnabled?: boolean
  /** 等价 `theme.footer.list.enable`。 */
  footerListEnabled?: boolean
  /** 等价 `theme.footer.list.randomFriends`。 */
  randomFriends?: number
  /** 等价 `locals.data.link`。 */
  links?: ReadonlyArray<RandomLinkGroup>
  /** 等价 `locals.posts`（`random === false` 的文章会被排除）。 */
  posts: ReadonlyArray<{ path: string; random?: boolean }>
}

/**
 * 上游 `random` **generator**（不是 helper）：生成 `anzhiyu/random.js` 里的
 * 「随机文章 / 随机友链」前端脚本。这里返回 `{ path, data }` 纯数据。
 */
export function randomGenerator(input: RandomGeneratorInput): { path: string; data: string } {
  const pjaxEn = input.pjaxEnabled ?? false
  const randomFriends = input.randomFriends ?? 0
  const footerListEnable = input.footerListEnabled ?? false
  const randomPath = input.path || 'anzhiyu/random.js'

  const posts: string[] = []
  for (const post of input.posts) {
    if (post.random !== false) posts.push(post.path)
  }

  const linkList: Array<{ name: string; link: string; avatar?: string }> = []
  for (const element of input.links ?? []) {
    for (const item of element.link_list) {
      linkList.push(item)
    }
  }

  let result = `var posts=${JSON.stringify(posts)};function toRandomPost(){
    ${
      pjaxEn
        ? "pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);"
        : "window.location.href='/'+posts[Math.floor(Math.random() * posts.length)];"
    }
  };`

  if (footerListEnable && randomFriends > 0) {
    result += `var friend_link_list=${JSON.stringify(linkList)};
    var refreshNum = 1;
    function friendChainRandomTransmission() {
      const randomIndex = Math.floor(Math.random() * friend_link_list.length);
      const { name, link } = friend_link_list.splice(randomIndex, 1)[0];
      Snackbar.show({
        text:
          "点击前往按钮进入随机一个友链，不保证跳转网站的安全性和可用性。本次随机到的是本站友链：「" + name + "」",
        duration: 8000,
        pos: "top-center",
        actionText: "前往",
        onActionClick: function (element) {
          element.style.opacity = 0;
          window.open(link, "_blank");
        },
      });
    }
    function addFriendLinksInFooter() {
      var footerRandomFriendsBtn = document.getElementById("footer-random-friends-btn");
      if(!footerRandomFriendsBtn) return;
      footerRandomFriendsBtn.style.opacity = "0.2";
      footerRandomFriendsBtn.style.transitionDuration = "0.3s";
      footerRandomFriendsBtn.style.transform = "rotate(" + 360 * refreshNum++ + "deg)";
      const finalLinkList = [];
  
      let count = 0;

      while (friend_link_list.length && count < ${randomFriends}) {
        const randomIndex = Math.floor(Math.random() * friend_link_list.length);
        const { name, link, avatar } = friend_link_list.splice(randomIndex, 1)[0];
  
        finalLinkList.push({
          name,
          link,
          avatar,
        });
        count++;
      }
  
      let html = finalLinkList
        .map(({ name, link }) => {
          const returnInfo = "<a class='footer-item' href='" + link + "' target='_blank' rel='noopener nofollow'>" + name + "</a>"
          return returnInfo;
        })
        .join("");
  
      html += "<a class='footer-item' href='/link/'>更多</a>";

      document.getElementById("friend-links-in-footer").innerHTML = html;

      setTimeout(()=>{
        footerRandomFriendsBtn.style.opacity = "1";
      }, 300)
    };`
  }

  return { path: randomPath, data: result }
}

/* ==================================================================== */
/* 9. related_post.js → relatedPosts                                     */
/* ==================================================================== */

export interface RelatedPostLike {
  path: string
  title: string
  cover?: false | string | null
  randomcover?: string | null
  updated?: unknown
  date?: unknown
  tags?: ReadonlyArray<{ name: string }>
}

export interface RelatedPostsEnv {
  t: Translate
  urlFor: UrlFor
  /** 等价 `hexo.config.date_format`。 */
  dateFormat?: string
  /** 等价 `hexo.theme.config.related_post`。 */
  relatedPost?: { limit?: number; date_type?: 'created' | 'updated' | string }
  /** 等价 `this.escape_html`，默认用本文件的 escapeHtml。 */
  escapeHtml?: (str: string) => string
  /** 等价 `this.date`。 */
  formatDate: FormatDate
}

interface RelatedPostCandidate {
  title: string
  path: string
  cover?: false | string | null
  randomcover?: string | null
  weight: number
  updated: unknown
  created: unknown
}

function isTagRelated(tagName: string, tags: ReadonlyArray<{ name: string }>): boolean {
  let result = false
  for (const tag of tags) {
    if (tagName === tag.name) result = true
  }
  return result
}

function findItemByPath(items: ReadonlyArray<{ path: string }>, path: string): number {
  for (let i = 0; i < items.length; i++) {
    if (items[i].path === path) return i
  }
  return -1
}

/**
 * 上游 `related_posts`：按 tag 重合度给「相关文章」加权（每重合一个 tag weight +1），
 * 按 weight 降序取前 `limit` 篇输出卡片 HTML；无结果返回空串。
 */
export function relatedPosts(
  currentPost: RelatedPostLike,
  allPosts: ReadonlyArray<RelatedPostLike>,
  env: RelatedPostsEnv,
): string {
  const escape = env.escapeHtml ?? escapeHtml
  const relatedPostConfig = env.relatedPost ?? {}
  const dateFormat = env.dateFormat ?? 'YYYY-MM-DD'
  const relatedPosts: RelatedPostCandidate[] = []

  for (const tag of currentPost.tags ?? []) {
    for (const post of allPosts) {
      if (isTagRelated(tag.name, post.tags ?? [])) {
        const candidate: RelatedPostCandidate = {
          title: post.title,
          path: post.path,
          cover: post.cover,
          randomcover: post.randomcover,
          weight: 1,
          updated: post.updated,
          created: post.date,
        }
        const index = findItemByPath(relatedPosts, post.path)
        if (index !== -1) {
          relatedPosts[index].weight += 1
        } else if (currentPost.path !== post.path) {
          relatedPosts.push(candidate)
        }
      }
    }
  }

  if (relatedPosts.length === 0) return ''

  const limitNum = relatedPostConfig.limit || 6
  const dateType = relatedPostConfig.date_type || 'created'
  const headlineLang = env.t('post.recommend')

  relatedPosts.sort((a, b) => b.weight - a.weight)

  let result = '<div class="relatedPosts">'
  result += `<div class="headline"><i class="anzhiyufont anzhiyu-icon-thumbs-up fa-fw" style="font-size: 1.5rem; margin-right: 4px"></i><span>${headlineLang}</span></div>`
  result += '<div class="relatedPosts-list">'

  for (let i = 0; i < Math.min(relatedPosts.length, limitNum); i++) {
    const cover = relatedPosts[i].cover === false ? relatedPosts[i].randomcover : relatedPosts[i].cover
    const title = escape(relatedPosts[i].title)
    result += `<div><a href="${env.urlFor(relatedPosts[i].path)}" title="${title}">`
    result += `<img class="cover" src="${env.urlFor(cover as string)}" alt="cover">`
    if (dateType === 'created') {
      result += `<div class="content is-center"><div class="date"><i class="anzhiyufont anzhiyu-icon-calendar-days fa-fw"></i> ${env.formatDate(
        relatedPosts[i].created,
        dateFormat,
      )}</div>`
    } else {
      result += `<div class="content is-center"><div class="date"><i class="anzhiyufont anzhiyu-icon-history fa-fw"></i> ${env.formatDate(
        relatedPosts[i].updated,
        dateFormat,
      )}</div>`
    }
    result += `<div class="title">${title}</div>`
    result += '</div></a></div>'
  }

  result += '</div></div>'
  return result
}

/* ==================================================================== */
/* 10. sort_attr_post.js → sortAttrPost                                   */
/* ==================================================================== */

export interface SortAttrPostLike {
  path: string
  swiper_index?: number
  top_group_index?: number
}

export interface SortAttrPostInput {
  /** 等价 `hexo.locals.get('posts').data`。 */
  posts: ReadonlyArray<SortAttrPostLike>
  /** 等价 `hexo.theme.config.home_top.swiper.enable`。 */
  swiperEnable: boolean
}

/**
 * 上游 `sort_attr_post`：按 front-matter 的 `swiper_index` / `top_group_index`
 * 取首页轮播（swiper）与置顶分组（top_group）列表，并用最新文章补足/替换到目标长度
 * （swiper 开启时 4，否则 6）。
 */
export function sortAttrPost(
  type: string,
  input: SortAttrPostInput,
): SortAttrPostLike[] | undefined {
  const postsList = input.posts
  let swiperList: SortAttrPostLike[] = []
  let topGroupList: SortAttrPostLike[] = []
  const targetLength = input.swiperEnable ? 4 : 6

  for (const item of postsList) {
    if (item.swiper_index) swiperList.push(item)
    if (item.top_group_index) topGroupList.push(item)
  }

  const sortNumber = (a: SortAttrPostLike, b: SortAttrPostLike): number =>
    (a.swiper_index as number) - (b.swiper_index as number)
  const sortNumberGroupList = (a: SortAttrPostLike, b: SortAttrPostLike): number =>
    (a.top_group_index as number) - (b.top_group_index as number)

  swiperList = swiperList.sort(sortNumber).reverse()
  topGroupList = topGroupList.sort(sortNumberGroupList).reverse()

  if (topGroupList.length < targetLength) {
    const newPosts = postsList
      .filter((item) => !topGroupList.includes(item))
      .slice(0, targetLength - topGroupList.length)
    topGroupList = [...topGroupList, ...newPosts]
  }
  if (swiperList.length < targetLength) {
    const newPosts = postsList
      .filter((item) => !swiperList.includes(item))
      .slice(0, targetLength - swiperList.length)
    swiperList = [...swiperList, ...newPosts]
  }

  if (topGroupList.length > targetLength) {
    const newPosts = postsList
      .filter((item) => !topGroupList.slice(0, targetLength).includes(item))
      .slice(0, topGroupList.length - targetLength)
    topGroupList = [...topGroupList.slice(0, targetLength), ...newPosts]
  }
  if (swiperList.length > targetLength) {
    const newPosts = postsList
      .filter((item) => !swiperList.slice(0, targetLength).includes(item))
      .slice(0, swiperList.length - targetLength)
    swiperList = [...swiperList.slice(0, targetLength), ...newPosts]
  }

  if (type === 'swiper_list') return swiperList
  if (type === 'top_group_list') return topGroupList
  return undefined
}

/* ==================================================================== */
/* 11. tags_page_list.js → tagsPageList                                  */
/* ==================================================================== */

export interface TagsPageItemLike {
  name: string
  path: string
  length: number
}

/**
 * 上游 `tags_page_list`：标签/分类页的标签列表。
 * 排序不是按名字长度，而是按「文章数」降序（插入排序：第一个文章数更小的位置插入，
 * 相等时保持在后面），HTML 里保留上游的缩进。
 */
export function tagsPageList(tags: ReadonlyArray<TagsPageItemLike>): string {
  const sortedTags = tags.reduce<TagsPageItemLike[]>((acc, tag) => {
    const index = acc.findIndex((item) => item.length < tag.length)
    if (index === -1) {
      acc.push(tag)
    } else {
      acc.splice(index, 0, tag)
    }
    return acc
  }, [])

  let html = ''
  for (const item of sortedTags) {
    html += `
      <a href="/${item.path}" id="/${item.path}">
        <span class="tags-punctuation">#</span>${item.name}
        <span class="tagsPageCount">${item.length}</span>
      </a>
    `
  }
  return html
}

/* ==================================================================== */
/* 12. year.js → getAnimalIcon                                           */
/* ==================================================================== */

const ANIMAL_ICONS: Record<number, string> = {
  0: 'anzhiyu-colorful-icon-monkey',
  1: 'anzhiyu-colorful-icon-rooster',
  2: 'anzhiyu-colorful-icon-dog',
  3: 'anzhiyu-colorful-icon-boar',
  4: 'anzhiyu-colorful-icon-rat',
  5: 'anzhiyu-colorful-icon-ox',
  6: 'anzhiyu-colorful-icon-tiger',
  7: 'anzhiyu-colorful-icon-rabbit',
  8: 'anzhiyu-colorful-icon-dragon',
  9: 'anzhiyu-colorful-icon-snake',
  10: 'anzhiyu-colorful-icon-horse',
  11: 'anzhiyu-colorful-icon-goat',
}

/**
 * 上游 `getAnimalIcon`：按年份取生肖图标 class（`parseInt(year) % 12` 映射）。
 * 非数字/负数会得到 `undefined`（与上游一致）。
 */
export function getAnimalIcon(year: number | string): string | undefined {
  const index = Number.parseInt(String(year), 10) % 12
  return ANIMAL_ICONS[index]
}
