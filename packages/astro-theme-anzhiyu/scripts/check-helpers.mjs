#!/usr/bin/env node
/**
 * check-helpers.mjs — P2-6（12 个 Hexo helper 的 TS 移植）验收。
 *
 * 三部分断言：
 *   A. hexo-util / moment 等价实现（escapeHtml / stripHtml / prettyUrls / md5 / 日期）：
 *      手工样例 + RFC1321 MD5 向量 + 与 node:crypto 对拍。
 *   B. 每个 helper 的业务语义：手造 fixtures 断言输出（分组、计数、比例分档、权重排序、
 *      截断、URL 处理、生肖映射……）。
 *   C. **上游 oracle**：直接 `new Function` 加载 `_research/anzhiyu-upstream/scripts/helpers/*.js`，
 *      用假的 Hexo 上下文（fake `this` / `hexo.config` / `hexo.theme.config` / Query / moment）
 *      执行上游代码，和 TS 移植输出逐字节对比。这是「不要瞎猜、直接对照上游行为」的硬证据。
 *      上游目录缺失时整段 SKIP（可通过 THEME_UPSTREAM_HELPERS 指定）。
 *
 * 用法（在 packages/astro-theme-anzhiyu 目录下）：
 *   node scripts/check-helpers.mjs
 *
 * 退出码：0 = 全部通过；1 = 有失败项。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as nodeCrypto from 'node:crypto'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const UPSTREAM_ROOT = process.env.THEME_UPSTREAM_HELPERS
  ? path.resolve(process.env.THEME_UPSTREAM_HELPERS)
  : path.resolve(PKG_ROOT, '../../../_research/anzhiyu-upstream')
const UPSTREAM_HELPERS = path.join(UPSTREAM_ROOT, 'scripts/helpers')
const UPSTREAM_PKG = path.join(UPSTREAM_ROOT, 'package.json')

const H = await import('../src/utils/helpers.ts')
const { t } = await import('../src/i18n/index.ts')

const log = (...args) => console.log('[check-helpers]', ...args)
let passed = 0
let failed = 0
let skipped = 0

const show = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text && text.length > 220 ? `${text.slice(0, 220)}…(${text.length}B)` : text
}

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1
    log(`PASS ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`[check-helpers] FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const checkEq = (label, actual, expected) =>
  check(label, actual === expected, `实际 ${show(actual)} / 期望 ${show(expected)}`)

/** 长字符串 diff 提示：首个不一致位置 + 上下文。 */
function firstDiff(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return ''
  const max = Math.max(actual.length, expected.length)
  for (let i = 0; i < max; i++) {
    if (actual[i] !== expected[i]) {
      return `首个差异 @${i}: 实际 ${JSON.stringify(actual.slice(Math.max(0, i - 40), i + 80))} / 期望 ${JSON.stringify(
        expected.slice(Math.max(0, i - 40), i + 80),
      )}`
    }
  }
  return ''
}

const checkHtml = (label, actual, expected) =>
  check(label, actual === expected, actual === expected ? '' : firstDiff(actual, expected))

/* ==================================================================== */
/* 日期 / moment fixtures                                                */
/* ==================================================================== */

const utcDate = (y, m, d) => new Date(Date.UTC(y, m - 1, d))

const MOMENT_MONTHS = {
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

/** 独立于 helpers.ts 的 moment 格式实现（用于 oracle 的假 moment）。 */
function formatMomentTokens(parts, format, locale = 'en') {
  const key = String(locale || 'en').toLowerCase()
  const months = MOMENT_MONTHS[key] ?? MOMENT_MONTHS.en
  const tokens = {
    YYYY: String(parts.year).padStart(4, '0'),
    YY: String(parts.year % 100).padStart(2, '0'),
    MMMM: months.long[parts.month - 1],
    MMM: months.short[parts.month - 1],
    MM: String(parts.month).padStart(2, '0'),
    M: String(parts.month),
    DD: String(parts.day).padStart(2, '0'),
    D: String(parts.day),
  }
  return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D/g, (token) => tokens[token])
}

/** 假 moment：只实现上游 helper 用到的方法（clone/year/month/date/locale/tz/format/valueOf）。 */
function fakeMoment(parts) {
  const state = { locale: 'en' }
  const api = {
    _parts: parts,
    clone() {
      const copy = fakeMoment({ ...parts })
      copy.locale(state.locale)
      return copy
    },
    tz() {
      return api
    },
    year: () => parts.year,
    month: () => parts.month - 1,
    date: () => parts.day,
    locale(value) {
      state.locale = value || 'en'
      return api
    },
    format(format) {
      return formatMomentTokens(parts, format, state.locale)
    },
    valueOf() {
      return Date.UTC(parts.year, parts.month - 1, parts.day)
    },
  }
  return api
}

/** 假 Hexo `date()` helper：支持 moment 实例与 `YYYY` / `YYYY-M` 字符串。 */
function fakeDateHelper(locale = 'en') {
  return (value, format) => {
    if (value && typeof value.format === 'function') return value.format(format)
    const match = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(String(value))
    if (!match) return 'Invalid date'
    return formatMomentTokens(
      { year: Number(match[1]), month: Number(match[2] || 1), day: Number(match[3] || 1) },
      format,
      locale,
    )
  }
}

/* ==================================================================== */
/* 假 warehouse Query / 假 Hexo 上下文（oracle 用）                       */
/* ==================================================================== */

function comparable(value) {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof value.valueOf === 'function') {
    const num = Number(value)
    if (!Number.isNaN(num)) return num
  }
  return String(value)
}

function compareValues(a, b) {
  const left = comparable(a)
  const right = comparable(b)
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (left > right) return 1
  if (left < right) return -1
  return 0
}

class FakeQuery {
  constructor(data) {
    this.data = [...data]
    this.length = this.data.length
  }
  count() {
    return this.length
  }
  forEach(iterator) {
    this.data.forEach(iterator)
  }
  map(iterator) {
    return this.data.map(iterator)
  }
  reduce(iterator, initial) {
    return initial === undefined ? this.data.reduce(iterator) : this.data.reduce(iterator, initial)
  }
  filter(iterator) {
    return new FakeQuery(this.data.filter(iterator))
  }
  limit(count) {
    return new FakeQuery(this.data.slice(0, count))
  }
  sort(orderby, order = 1) {
    const direction = order === -1 || order === 'desc' ? -1 : 1
    return new FakeQuery(
      [...this.data].sort((a, b) => compareValues(a[orderby], b[orderby]) * direction),
    )
  }
  find(query) {
    return new FakeQuery(
      this.data.filter((item) =>
        Object.keys(query).every((key) => {
          const expected = query[key]
          if (expected && typeof expected === 'object' && '$exists' in expected) {
            const exists = item[key] !== undefined && item[key] !== null
            return expected.$exists === exists
          }
          return item[key] === expected
        }),
      ),
    )
  }
}

/** 上游 page.js 依赖的 hexo-util 参照实现（独立于 helpers.ts，简单正则版；fixtures 无引号内 `>`）。 */
const REF_HEXO_UTIL = {
  stripHTML: (html) =>
    typeof html === 'string' ? html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '') : '',
  escapeHTML: (str) => {
    if (typeof str !== 'string') throw new TypeError('str must be a string!')
    return str.replace(/[<>"'`/=]|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, (ch) => {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;',
        '/': '&#x2F;',
        '=': '&#x3D;',
      }
      return map[ch]
    })
  },
  prettyUrls: (url, options = {}) => {
    const merged = { trailing_index: true, trailing_html: true, ...options }
    let result = url
    const indexPattern = /index\.html$/
    if (merged.trailing_index === false) result = result.replace(indexPattern, '')
    if (merged.trailing_html === false && !indexPattern.test(result)) result = result.replace(/\.html$/, '')
    return result
  },
}

const upstreamPackageJson = existsSync(UPSTREAM_PKG)
  ? JSON.parse(readFileSync(UPSTREAM_PKG, 'utf8'))
  : { version: '1.7.1' }

/**
 * 加载一个上游 helper 源文件，返回 { hexo, helpers }。
 * 上游文件是普通 CommonJS 风格脚本：`hexo.extend.helper.register(name, fn)` / `generator.register`。
 */
function loadUpstream(file, { config = {}, themeConfig = {}, locals = {}, requireOverrides = {} } = {}) {
  const captured = {}
  const helpers = {}
  const localMap = locals
  const fakeRequire = (id) => {
    if (id in requireOverrides) return requireOverrides[id]
    if (id === 'crypto') return nodeCrypto
    if (id === 'hexo-util') return REF_HEXO_UTIL
    if (id.endsWith('package.json')) return upstreamPackageJson
    throw new Error(`上游 ${file} 里出现了未 mock 的 require('${id}')`)
  }
  const hexo = {
    config,
    theme: { config: themeConfig },
    locals: { get: (type) => localMap[type] },
    extend: {
      helper: {
        register: (name, fn) => {
          captured[name] = fn
        },
      },
      generator: {
        register: (name, fn) => {
          captured[`generator:${name}`] = fn
        },
      },
    },
  }
  const source = readFileSync(path.join(UPSTREAM_HELPERS, file), 'utf8')
  // eslint-disable-next-line no-new-func
  new Function('hexo', 'require', 'module', 'exports', source)(hexo, fakeRequire, {}, {})
  return { hexo, helpers: captured, source }
}

/* ==================================================================== */
/* A. hexo-util / moment 等价实现                                        */
/* ==================================================================== */

log('=== A. hexo-util 等价实现：escapeHtml / stripHtml / prettyUrls / md5 / 日期 ===')

checkEq('escapeHtml 普通文本不变', H.escapeHtml('hello world'), 'hello world')
checkEq('escapeHtml 标签与 &', H.escapeHtml('<b>&</b>'), '&lt;b&gt;&amp;&lt;&#x2F;b&gt;')
checkEq('escapeHtml 已是实体不二次转义', H.escapeHtml('&amp; &lt; &#39;'), '&amp; &lt; &#39;')
checkEq('escapeHtml 引号/斜杠/等号', H.escapeHtml('"a" \'b\' / = `'), '&quot;a&quot; &#39;b&#39; &#x2F; &#x3D; &#96;')
check('escapeHtml 非字符串抛 TypeError', (() => {
  try {
    H.escapeHtml(123)
    return false
  } catch (error) {
    return error instanceof TypeError
  }
})())

checkEq('stripHtml 空串', H.stripHtml(''), '')
checkEq('stripHtml 非字符串安全', H.stripHtml(null), '')
checkEq('stripHtml 普通标签', H.stripHtml('<p>hello <b>world</b></p>'), 'hello world')
checkEq('stripHtml 嵌套块', H.stripHtml('<div><span>a</span><span>b</span></div>'), 'ab')
checkEq('stripHtml 注释', H.stripHtml('a<!-- note -->b'), 'ab')
checkEq('stripHtml 引号里的 >', H.stripHtml('<a title="1 > 0">link</a>'), 'link')
checkEq('stripHtml 裸小于号', H.stripHtml('a < b'), 'a < b')
checkEq('stripHtml script 文本保留', H.stripHtml('<script>alert(1)</script>x'), 'alert(1)x')

checkEq('prettyUrls 默认参数', H.prettyUrls('/a/index.html'), '/a/index.html')
checkEq('prettyUrls trailing_index=false', H.prettyUrls('/a/index.html', { trailing_index: false }), '/a/')
const NO_INDEX = { trailing_index: false, trailing_html: true }
checkEq('prettyUrls post.html 保留 html', H.prettyUrls('/2024/post.html', NO_INDEX), '/2024/post.html')
checkEq('prettyUrls 目录路径不变', H.prettyUrls('/archives/', NO_INDEX), '/archives/')

checkEq('md5Hex 空串（RFC1321）', H.md5Hex(''), 'd41d8cd98f00b204e9800998ecf8427e')
checkEq('md5Hex abc（RFC1321）', H.md5Hex('abc'), '900150983cd24fb0d6963f7d28e17f72')
checkEq('md5Hex message digest', H.md5Hex('message digest'), 'f96b697d7cb7938d525a2f31aaf161d0')
checkEq(
  'md5Hex alphabet',
  H.md5Hex('abcdefghijklmnopqrstuvwxyz'),
  'c3fcd3d76192e4007dfb496cca67e13b',
)
checkEq(
  'md5Hex 80 字符（跨 block）',
  H.md5Hex('12345678901234567890123456789012345678901234567890123456789012345678901234567890'),
  '57edf4a22be3c955ac49da2e2107b67a',
)
checkEq('md5Hex UTF-8 中文', H.md5Hex('你好'), '7eca689f0d3389d9dea66ae112e5cfd7')

let md5Parity = true
let md5ParityDetail = ''
for (const sample of ['', 'a', 'abc', 'Hello, Hexo!', '中文 md5 测试', 'x'.repeat(200), '~!@#$%^&*()_+']) {
  const expected = nodeCrypto.createHash('md5').update(sample).digest('hex')
  if (H.md5Hex(sample) !== expected) {
    md5Parity = false
    md5ParityDetail = `${show(sample)}: ${H.md5Hex(sample)} != ${expected}`
    break
  }
}
check('md5Hex 与 node:crypto 对拍（7 个样例）', md5Parity, md5ParityDetail)

checkEq('getDateParts UTC', JSON.stringify(H.getDateParts(utcDate(2024, 3, 15))), '{"year":2024,"month":3,"day":15}')
checkEq(
  'getDateParts timezone=Asia/Shanghai（跨日）',
  JSON.stringify(H.getDateParts(new Date('2024-03-15T20:30:00.000Z'), 'Asia/Shanghai')),
  '{"year":2024,"month":3,"day":16}',
)
check('getDateParts 非法日期抛错', (() => {
  try {
    H.getDateParts('not-a-date')
    return false
  } catch (error) {
    return error instanceof TypeError
  }
})())
checkEq('toMomentLocale undefined', String(H.toMomentLocale()), 'undefined')
checkEq('toMomentLocale default', H.toMomentLocale('default'), 'en')
checkEq('toMomentLocale zh_CN', H.toMomentLocale('zh_CN'), 'zh-cn')
checkEq('monthName zh-cn MMMM', H.monthName(5, 'zh-cn', 'long'), '五月')
checkEq('monthName zh-tw MMMM（moment 表，非 Intl 的 5月）', H.monthName(5, 'zh-tw', 'long'), '五月')
checkEq('monthName en MMM', H.monthName(5, 'en', 'short'), 'May')
checkEq('formatMomentLike MMMM YYYY', H.formatMomentLike({ year: 2024, month: 5, day: 1 }, 'MMMM YYYY', 'zh-cn'), '五月 2024')
checkEq('formatMomentLike YYYY年MM月', H.formatMomentLike({ year: 2024, month: 5, day: 1 }, 'YYYY年MM月', 'en'), '2024年05月')
checkEq('formatMomentLike YYYY', H.formatMomentLike({ year: 2024, month: 5, day: 1 }, 'YYYY', 'en'), '2024')

/* ==================================================================== */
/* B. 每个 helper 的业务语义                                             */
/* ==================================================================== */

log('=== B1. aside_archives → asideArchives（按月分组 / 计数 / limit / more 按钮）===')
const archivePosts = [
  { date: utcDate(2024, 3, 20) },
  { date: utcDate(2024, 3, 5) },
  { date: utcDate(2024, 2, 10) },
  { date: utcDate(2023, 12, 1) },
]
const archiveInput = (language = 'zh-CN') => ({
  posts: archivePosts,
  archiveDir: 'archives',
  language,
  urlFor: (p) => `/${p}`,
  t: (key) => t(key, language),
})
const monthlyHtml = H.asideArchives({ limit: 2 }, archiveInput())
check('asideArchives 空 posts → 空串', H.asideArchives({ limit: 8 }, { ...archiveInput(), posts: [] }) === '')
check('asideArchives 标题用 t(aside.card_archives)', monthlyHtml.includes('<span>归档</span>'))
check('asideArchives 有更多按钮（4 组 > limit 2）', monthlyHtml.includes('card-more-btn" href="/archives/"'))
check('asideArchives 只渲染 limit 组', monthlyHtml.split('card-archive-list-item').length - 1 === 2)
check('asideArchives 首组为最新月 2024/03', monthlyHtml.includes('href="/archives/2024/03/"'))
check('asideArchives 分组计数=2', monthlyHtml.includes('card-archive-list-count">2</span>'))
check('asideArchives 月名 zh-CN（五月/三月）', monthlyHtml.includes('三月 2024'))
check('asideArchives 篇单位', monthlyHtml.includes('<span>篇</span>'))
check('asideArchives limit 0 = 全部（3 组）', H.asideArchives({ limit: 0 }, archiveInput()).split('card-archive-list-item').length - 1 === 3)
check('asideArchives 无更多按钮（3 组 <= limit 3）', !H.asideArchives({ limit: 3 }, archiveInput()).includes('card-more-btn" href="/archives/"'))
const yearlyHtml = H.asideArchives({ type: 'yearly', limit: 0 }, archiveInput())
check('asideArchives yearly → 年归档链接', yearlyHtml.includes('href="/archives/2024/"') && yearlyHtml.includes('href="/archives/2023/"'))
check('asideArchives yearly 年格式 YYYY', yearlyHtml.includes('>2024</span>'))
check('asideArchives show_count=false 无计数', !H.asideArchives({ limit: 0, show_count: false }, archiveInput()).includes('card-archive-list-count'))
check('asideArchives transform 作用于名称', H.asideArchives({ limit: 1, transform: (name) => `[${name}]` }, archiveInput()).includes('[三月 2024]'))
check('asideArchives order=1 最旧在前', H.asideArchives({ limit: 1, order: 1 }, archiveInput()).includes('href="/archives/2023/12/"'))
check('asideArchives 无 limit 时上游 NaN 行为（不渲染列表项）', H.asideArchives({}, archiveInput()).split('card-archive-list-item').length - 1 === 0)
check('asideArchives en 月名', H.asideArchives({ limit: 1 }, archiveInput('en')).includes('March 2024'))
check('asideArchives zh-TW 月名', H.asideArchives({ limit: 1 }, archiveInput('zh-TW')).includes('三月 2024'))

log('=== B2. aside_categories → asideCategories（层级 / 展开 / limit / more）===')
const categoryFixtures = [
  { _id: 'c1', name: '前端', path: 'categories/frontend/', length: 10 },
  { _id: 'c2', name: '后端', path: 'categories/backend/', length: 8 },
  { _id: 'c1a', name: 'CSS', path: 'categories/frontend/css/', length: 4, parent: 'c1' },
  { _id: 'c1b', name: 'JS', path: 'categories/frontend/js/', length: 6, parent: 'c1' },
  { _id: 'c3', name: '空分类', path: 'categories/empty/', length: 0 },
  { _id: 'c2a', name: 'Go', path: 'categories/backend/go/', length: 5, parent: 'c2' },
]
const categoryInput = (tLanguage = 'zh-CN') => ({
  categories: categoryFixtures,
  categoryDir: 'categories',
  urlFor: (p) => `/${p}`,
  t: (key) => t(key, tLanguage),
})
const categoriesHtml = H.asideCategories({ limit: 8, expand: true }, categoryInput())
check('asideCategories 标题', categoriesHtml.includes('<span>分类</span>'))
check('asideCategories 顶层 3 个（空分类被 length 过滤不展示，但 limit 消耗）', categoriesHtml.includes('前端') && categoriesHtml.includes('后端'))
check('asideCategories 子分类渲染', categoriesHtml.includes('CSS') && categoriesHtml.includes('JS'))
check('asideCategories link 前缀 /', categoriesHtml.includes('href="/categories/frontend/"'))
check('asideCategories 计数', categoriesHtml.includes('card-category-list-count">10</span>'))
check('asideCategories expand=true 生成 expandBtn 与 caret', categoriesHtml.includes('card-category-list expandBtn'.replace('card-category-list expandBtn', 'card-category-list expandBtn')) && categoriesHtml.includes('icon-caret-left expand'))
check('asideCategories 父项 class parent', categoriesHtml.includes('card-category-list-item parent'))
check('asideCategories expand=none 不展开', !H.asideCategories({ limit: 8, expand: 'none' }, categoryInput()).includes('parent'))
check('asideCategories show_count=false', !H.asideCategories({ limit: 8, show_count: false }, categoryInput()).includes('card-category-list-count'))
const categoriesLimited = H.asideCategories({ limit: 1 }, categoryInput())
check('asideCategories limit=1 只渲染一个顶层项', categoriesLimited.split('card-category-list-item').length - 1 === 1)
check('asideCategories 有 more 按钮（6 > limit 1）', categoriesLimited.includes('card-more-btn" href="/categories/"'))
check('asideCategories 无 more（limit 0 = 全部）', !H.asideCategories({ limit: 0 }, categoryInput()).includes('card-more-btn'))
check('asideCategories depth=1 无子分类', !H.asideCategories({ limit: 8, depth: 1 }, categoryInput()).includes('JS'))
check('asideCategories 空分类数组 → 空串', H.asideCategories({}, { ...categoryInput(), categories: [] }) === '')

log('=== B3. catalog_list → catalogList ===')
const catalogHtml = H.catalogList([
  { path: 'categories/a/', name: 'A' },
  { path: 'categories/b/', name: 'B' },
])
check('catalogList 条目数', catalogHtml.split('catalog-list-item').length - 1 === 2)
check('catalogList id/href 前导斜杠', catalogHtml.includes('id="/categories/a/"') && catalogHtml.includes('href="/categories/b/"'))
check('catalogList 名称', catalogHtml.includes('\n        A\n'))
check('catalogList 空数组 → 空串', H.catalogList([]) === '')

log('=== B4. findArchiveLength → getArchiveLength ===')
const lengthFixtures = {
  posts: [
    { date: utcDate(2024, 3, 20) },
    { date: utcDate(2024, 3, 5) },
    { date: utcDate(2024, 2, 10) },
    { date: utcDate(2023, 12, 1) },
    { date: utcDate(2023, 12, 25) },
  ],
}
const fullArchiveGen = { enable: true, yearly: true, monthly: true, daily: false }
check('getArchiveLength 年归档 2024 = 3', H.getArchiveLength({ ...lengthFixtures, page: { year: 2024 }, archiveGenerator: fullArchiveGen }) === 3)
check('getArchiveLength 年归档 2023 = 2', H.getArchiveLength({ ...lengthFixtures, page: { year: 2023 }, archiveGenerator: fullArchiveGen }) === 2)
check('getArchiveLength 月归档 2024-3 = 2', H.getArchiveLength({ ...lengthFixtures, page: { year: 2024, month: 3 }, archiveGenerator: fullArchiveGen }) === 2)
check('getArchiveLength 月归档 2023-12 = 2', H.getArchiveLength({ ...lengthFixtures, page: { year: 2023, month: 12 }, archiveGenerator: fullArchiveGen }) === 2)
check('getArchiveLength archive_generator.enable=false → 全部 5', H.getArchiveLength({ ...lengthFixtures, page: { year: 2024 }, archiveGenerator: { enable: false } }) === 5)
check('getArchiveLength yearly=false → 全部 5', H.getArchiveLength({ ...lengthFixtures, page: { year: 2024 }, archiveGenerator: { enable: true, yearly: false } }) === 5)
check('getArchiveLength 无 page.year → 全部 5', H.getArchiveLength({ ...lengthFixtures, page: {}, archiveGenerator: fullArchiveGen }) === 5)
check('getArchiveLength daily 归档 2024-3-20 = 1', H.getArchiveLength({ ...lengthFixtures, page: { year: 2024, month: 3, day: 20 }, archiveGenerator: { enable: true, yearly: true, monthly: true, daily: true } }) === 1)
check('getArchiveLength 无文章归档 → 0（上游会抛错，见 deviation）', H.getArchiveLength({ ...lengthFixtures, page: { year: 1999 }, archiveGenerator: fullArchiveGen }) === 0)
check('getArchiveLength 入参乱序不影响结果', H.getArchiveLength({ posts: [...lengthFixtures.posts].reverse(), page: { year: 2024 }, archiveGenerator: fullArchiveGen }) === 3)

log('=== B5. get_version → getVersion ===')
checkEq('getVersion 传入 package.json', H.getVersion({ version: '1.7.1' }), '1.7.1')
checkEq('getVersion 缺省空串', H.getVersion(), '')

log('=== B6. inject_head_js → injectHeadJs ===')
const darkmodeOff = H.injectHeadJs({
  darkmode: { enable: false },
  aside: { enable: false, button: false },
  themeColor: { enable: false },
})
check('injectHeadJs 包裹 script + window iife', darkmodeOff.startsWith('<script>(win=>{') && darkmodeOff.endsWith('})(window)</script>'))
check('injectHeadJs 含 saveToLocal', darkmodeOff.includes('win.saveToLocal'))
check('injectHeadJs 含 getScript/getCSS', darkmodeOff.includes('win.getScript') && darkmodeOff.includes('win.getCSS'))
check('injectHeadJs 含 detectApple', darkmodeOff.includes("if(/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent))"))
check('injectHeadJs darkmode.enable=false 不注入 activateDarkMode', !darkmodeOff.includes('activateDarkMode'))
check('injectHeadJs aside 关闭不注入 aside-status', !darkmodeOff.includes('aside-status'))
const darkmodeAuto1 = H.injectHeadJs({
  darkmode: { enable: true, autoChangeMode: 1, start: 7, end: 19 },
  aside: { enable: true, button: true },
  themeColor: { enable: true, meta_theme_color_light: '#fafafa', meta_theme_color_dark: '#101010' },
})
check('injectHeadJs autoChangeMode=1 走 matchMedia', darkmodeAuto1.includes("window.matchMedia('(prefers-color-scheme: dark)')"))
check('injectHeadJs theme color 注入（浅）', darkmodeAuto1.includes("setAttribute('content', '#fafafa')"))
check('injectHeadJs theme color 注入（深）', darkmodeAuto1.includes("setAttribute('content', '#101010')"))
check('injectHeadJs start/end 注入', darkmodeAuto1.includes('hour <= 7 || hour >= 19'))
check('injectHeadJs aside 状态脚本', darkmodeAuto1.includes("saveToLocal.get('aside-status')"))
const darkmodeAuto2 = H.injectHeadJs({ darkmode: { enable: true, autoChangeMode: 2 }, aside: {} })
check('injectHeadJs autoChangeMode=2 仅时段', darkmodeAuto2.includes('isNight ? activateDarkMode() : activateLightMode()') && !darkmodeAuto2.includes('prefers-color-scheme'))
const darkmodeManual = H.injectHeadJs({ darkmode: { enable: true }, aside: {} })
check('injectHeadJs autoChangeMode=0 仅手动', darkmodeManual.includes("if (t === 'dark') activateDarkMode()"))
check('injectHeadJs 默认色 #ffffff / #0d0d0d', darkmodeManual.includes("'#ffffff'") && darkmodeManual.includes("'#0d0d0d'"))

log('=== B7. page_description → pageDescription ===')
checkEq(
  'pageDescription 优先 page.description',
  H.pageDescription({ page: { description: 'desc', content: '<p>content</p>' }, config: {} }),
  'desc',
)
checkEq(
  'pageDescription content 去标签',
  H.pageDescription({ page: { content: '<p>hello <b>world</b></p>' }, config: {} }),
  'hello world',
)
checkEq(
  'pageDescription 截断到 150 字符',
  H.pageDescription({ page: { content: 'a'.repeat(200) }, config: {} })?.length,
  150,
)
checkEq(
  'pageDescription 截断后 trim',
  H.pageDescription({ page: { content: `  ${'b'.repeat(200)}` }, config: {} })?.startsWith('bbbb'),
  true,
)
checkEq('pageDescription title 兜底', H.pageDescription({ page: { title: '标题' }, config: {} }), '标题')
checkEq('pageDescription config.description 兜底', H.pageDescription({ page: {}, config: { description: '站点描述' } }), '站点描述')
checkEq('pageDescription 全空 → undefined', H.pageDescription({ page: {}, config: {} }), undefined)
checkEq(
  'pageDescription 转义发生在 strip 之后',
  H.pageDescription({ page: { content: '<p>a & b</p>' }, config: {} }),
  'a &amp; b',
)
checkEq(
  'pageDescription 换行转空格',
  H.pageDescription({ page: { content: 'line1\nline2' }, config: {} }),
  'line1 line2',
)

log('=== B8. get_page_fill_description → getPageFillDescription ===')
const fillHtml = '<h2>第一节</h2><p>中文正文abc</p><h3><a href="/x">第二节</a></h3><div class="post-ai-description">AI 摘要不要</div>'
const fillDescription = H.getPageFillDescription({ page: { content: fillHtml }, config: {} })
check('getPageFillDescription 返回字符串', typeof fillDescription === 'string')
check('getPageFillDescription 提取 h 标签文本', Boolean(fillDescription?.includes('第一节')) && Boolean(fillDescription?.includes('第二节')))
check('getPageFillDescription 去掉 a 标签', !String(fillDescription).includes('<a'))
check('getPageFillDescription 排除 post-ai-description', !String(fillDescription).includes('AI 摘要不要'))
check('getPageFillDescription 正文只留中文', !/[a-zA-Z]/.test(String(fillDescription).split(', ').at(-1)))
checkEq('getPageFillDescription 全空 → undefined', H.getPageFillDescription({ page: {}, config: {} }), undefined)

log('=== B9. cloudTags → cloudTags（比例分档）===')
const cloudTags = [
  { name: 'B', path: 'tags/b/', length: 3 },
  { name: 'A', path: 'tags/a/', length: 1 },
  { name: 'C', path: 'tags/c/', length: 10 },
]
const cloudInput = { urlFor: (p) => `/${p}` }
const cloudHtml = H.cloudTags({ tags: cloudTags, minfontsize: 10, maxfontsize: 20 }, cloudInput)
check('cloudTags 输出 3 个链接', cloudHtml.split('<a href=').length - 1 === 3)
check('cloudTags 最小站字号 = min', cloudHtml.includes('style="font-size: 10px;"'))
check('cloudTags 中间档字号 = 15', cloudHtml.includes('style="font-size: 15px;"'))
check('cloudTags 最大站字号 = max', cloudHtml.includes('style="font-size: 20px;"'))
check('cloudTags 按 name 排序输出', cloudHtml.indexOf('>A<sup>') < cloudHtml.indexOf('>B<sup>') && cloudHtml.indexOf('>B<sup>') < cloudHtml.indexOf('>C<sup>'))
check('cloudTags sup 显示篇数', cloudHtml.includes('<sup>10</sup>'))
check('cloudTags limit 生效', H.cloudTags({ tags: cloudTags, minfontsize: 10, maxfontsize: 20, limit: 2 }, cloudInput).split('<a href=').length - 1 === 2)
check(
  'cloudTags 单一 size 时全部 minfontsize',
  H.cloudTags({ tags: cloudTags.map((tag) => ({ ...tag, length: 2 })), minfontsize: 10, maxfontsize: 20 }, cloudInput).includes('font-size: 10px;'),
)
check(
  'cloudTags unit=rem / toFixed(2) 去尾零',
  H.cloudTags({ tags: cloudTags, minfontsize: 0.875, maxfontsize: 0.875, unit: 'rem' }, cloudInput).includes('font-size: 0.88rem;'),
)
check(
  'cloudTags highlightTags 追加样式',
  H.cloudTags({ tags: cloudTags, minfontsize: 10, maxfontsize: 20, highlightTags: ['A'] }, cloudInput).includes('font-weight: 500; color: var(--anzhiyu-lighttext)'),
)
const deterministicRandom = () => {
  const values = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
  let index = 0
  return () => values[index++ % values.length]
}
const coloredHtml = H.cloudTags({ tags: cloudTags, minfontsize: 10, maxfontsize: 20, color: true }, { ...cloudInput, random: deterministicRandom() })
check(
  'cloudTags color=true 注入确定性 rgb（0-200）',
  /style="font-size: 10px; color: rgb\(\d{1,3}, \d{1,3}, \d{1,3}\);;?"/.test(coloredHtml) || coloredHtml.includes('color: rgb(20, 40, 60);'),
  show(coloredHtml),
)

log('=== B10. urlNoIndex → urlNoIndex ===')
checkEq('urlNoIndex index.html 去尾', H.urlNoIndex('/archives/index.html'), '/archives/')
checkEq('urlNoIndex 目录路径不变', H.urlNoIndex('/archives/'), '/archives/')
checkEq('urlNoIndex 普通 html 保留', H.urlNoIndex('/2024/post.html'), '/2024/post.html')
checkEq('urlNoIndex 传 null 用 fallback', H.urlNoIndex(null, '/current/index.html'), '/current/')
checkEq('urlNoIndex 两者都空 → 空串（上游会抛错，见 deviation）', H.urlNoIndex(), '')

log('=== B11. md5 → md5 ===')
checkEq('md5 走 url_for + decodeURI', H.md5('/a%20b.html', (p) => p), H.md5Hex('/a b.html'))
checkEq('md5 与 oracle 相同的 url_for 结果', H.md5('post/1', (p) => `/${p}`), H.md5Hex('/post/1'))

log('=== B12. injectHtml → injectHtml ===')
checkEq('injectHtml null → 空串', H.injectHtml(null), '')
checkEq('injectHtml 数组合并', H.injectHtml(['<meta a>', '<script b></script>']), '<meta a><script b></script>')
checkEq('injectHtml 空数组', H.injectHtml([]), '')

log('=== B13. findArchivesTitle → findArchivesTitle ===')
const titleRecorder = (value, format) => `[${value}][${format}]`
const titleBase = { t: (key) => t(key, 'zh-CN'), formatDate: titleRecorder, archiveFormat: 'MMMM YYYY' }
checkEq('findArchivesTitle page.year', H.findArchivesTitle({ year: 2024 }, null, titleBase), '[2024][YYYY]')
checkEq(
  'findArchivesTitle page.year+month 用 card_archives.format',
  H.findArchivesTitle({ year: 2024, month: 5 }, null, { ...titleBase, archiveFormat: 'YYYY年MM月' }),
  '[2024-5][YYYY年MM月]',
)
checkEq('findArchivesTitle 无 menu 回退 t(page.archives)', H.findArchivesTitle({}, null, titleBase), '归档')
checkEq('findArchivesTitle 嵌套 menu（上游忽略递归结果）→ 回退', H.findArchivesTitle({}, { 文章: { 归档: '/archives/ || icon' } }, titleBase), '归档')
checkEq('findArchivesTitle 扁平 menu 命中键名', H.findArchivesTitle({}, { 归档: '/archives/' }, titleBase), '归档')
checkEq('findArchivesTitle 扁平 menu 英文键名', H.findArchivesTitle({}, { Archives: '/archives/' }, titleBase), 'Archives')
checkEq('findArchivesTitle menu 无 archives → 回退', H.findArchivesTitle({}, { 首页: '/' }, titleBase), '归档')

log('=== B14. isImgOrUrl → isImgOrUrl ===')
for (const [input, expected] of [
  ['https://example.com/a', true],
  ['//cdn.example.com/a', true],
  ['/img/a.png', true],
  ['a.jpeg', true],
  ['a.webp?x=1', true],
  ['/post/hello.html', false],
  ['/img/a', false],
]) {
  checkEq(`isImgOrUrl(${show(input)})`, H.isImgOrUrl(input), expected)
}

log('=== B15. random.js → randomGenerator ===')
const randomInput = {
  posts: [{ path: 'p/1/' }, { path: 'p/2/', random: false }, { path: 'p/3/' }],
  links: [{ link_list: [{ name: '友链A', link: 'https://a.example' }] }],
}
const randomBasic = H.randomGenerator(randomInput)
checkEq('randomGenerator 默认 path', randomBasic.path, 'anzhiyu/random.js')
checkEq('randomGenerator 自定义 path', H.randomGenerator({ ...randomInput, path: 'custom/random.js' }).path, 'custom/random.js')
check('randomGenerator 排除 random:false 的文章', randomBasic.data.includes('var posts=["p/1/","p/3/"];'))
check('randomGenerator 默认 location.href 跳转', randomBasic.data.includes("window.location.href='/'+posts[Math.floor(Math.random() * posts.length)];"))
check('randomGenerator pjax 开启用 pjax.loadUrl', H.randomGenerator({ ...randomInput, pjaxEnabled: true }).data.includes("pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);"))
check('randomGenerator footer 关闭不生成友链脚本', !randomBasic.data.includes('friend_link_list'))
const randomFriends = H.randomGenerator({ ...randomInput, footerListEnabled: true, randomFriends: 2 })
check('randomGenerator 友链 JSON 注入', randomFriends.data.includes('var friend_link_list=[{"name":"友链A","link":"https://a.example"}];'))
check('randomGenerator 友链数量注入 while 条件', randomFriends.data.includes('count < 2'))
check('randomGenerator 友链功能函数', randomFriends.data.includes('function addFriendLinksInFooter()'))

log('=== B16. related_post → relatedPosts（tag 权重排序）===')
const relatedFixtures = {
  current: { path: 'posts/current/', title: 'Current', tags: [{ name: 'js' }, { name: 'css' }] },
  all: [
    { path: 'posts/current/', title: 'Current', tags: [{ name: 'js' }, { name: 'css' }] },
    { path: 'posts/only-css/', title: 'Only CSS', cover: 'img/only-css.png', tags: [{ name: 'css' }], date: utcDate(2024, 1, 1), updated: utcDate(2024, 2, 1) },
    { path: 'posts/both/', title: 'Both <b>', cover: 'img/both.png', tags: [{ name: 'js' }, { name: 'css' }], date: utcDate(2024, 3, 1), updated: utcDate(2024, 4, 1) },
    { path: 'posts/unrelated/', title: 'Unrelated', tags: [{ name: 'go' }], date: utcDate(2024, 5, 1) },
  ],
}
const relatedEnv = {
  t: (key) => t(key, 'zh-CN'),
  urlFor: (p) => `/${p}`,
  dateFormat: 'YYYY-MM-DD',
  relatedPost: { limit: 6, date_type: 'created' },
  formatDate: (value) => `D(${value instanceof Date ? value.getUTCDate() : value})`,
}
const relatedHtml = H.relatedPosts(relatedFixtures.current, relatedFixtures.all, relatedEnv)
check('relatedPosts 标题', relatedHtml.includes('<span>喜欢这篇文章的人也看了</span>'))
check('relatedPosts 排序：weight 2 的 Both 在仅 1 个的 Only CSS 前', relatedHtml.indexOf('Both') < relatedHtml.indexOf('Only CSS'))
check('relatedPosts 排除当前文章', !relatedHtml.includes('href="/posts/current/"'))
check('relatedPosts 不相关文章不出现', !relatedHtml.includes('Unrelated'))
check('relatedPosts 转义标题', relatedHtml.includes('title="Both &lt;b&gt;"'))
check('relatedPosts cover 路径', relatedHtml.includes('src="/img/both.png"'))
check('relatedPosts created 日期图标', relatedHtml.includes('anzhiyu-icon-calendar-days'))
checkEq('relatedPosts 无 tag 匹配 → 空串', H.relatedPosts({ path: 'x/', title: 'X', tags: [] }, relatedFixtures.all, relatedEnv), '')
const relatedLimited = H.relatedPosts(relatedFixtures.current, relatedFixtures.all, {
  ...relatedEnv,
  relatedPost: { limit: 1, date_type: 'updated' },
})
check('relatedPosts limit=1 只输出 1 张卡片', (relatedLimited.match(/class="cover"/g) ?? []).length === 1)
check('relatedPosts date_type=updated 用 updated 图标', relatedLimited.includes('anzhiyu-icon-history'))
const relatedRandomCover = [
  { path: 'posts/both/', title: 'Both', cover: false, randomcover: 'img/random.png', tags: [{ name: 'js' }], date: utcDate(2024, 3, 1) },
]
check(
  'relatedPosts cover=false 用 randomcover',
  H.relatedPosts({ path: 'c/', title: 'C', tags: [{ name: 'js' }] }, relatedRandomCover, relatedEnv).includes('src="/img/random.png"'),
)

log('=== B17. sort_attr_post → sortAttrPost（补足 / 截断）===')
const sortFixtures = [
  { path: 'p1' },
  { path: 'p2', swiper_index: 2, top_group_index: 1 },
  { path: 'p3', swiper_index: 1, top_group_index: 3 },
  { path: 'p4', top_group_index: 2 },
  { path: 'p5', swiper_index: 3 },
]
const swiperList = H.sortAttrPost('swiper_list', { posts: sortFixtures, swiperEnable: true })
const topGroupList = H.sortAttrPost('top_group_list', { posts: sortFixtures, swiperEnable: true })
checkEq('sortAttrPost 未知 type → undefined', H.sortAttrPost('nope', { posts: sortFixtures, swiperEnable: true }), undefined)
checkEq('sortAttrPost swiper 按 index 降序', JSON.stringify(swiperList.map((p) => p.path)), '["p5","p2","p3","p1"]')
checkEq('sortAttrPost top_group 按 index 降序', JSON.stringify(topGroupList.map((p) => p.path)), '["p3","p4","p2","p1"]')
checkEq('sortAttrPost swiperEnable=true 目标长度 4', swiperList.length, 4)
checkEq('sortAttrPost swiperEnable=false 目标长度 6（全部）', H.sortAttrPost('swiper_list', { posts: sortFixtures, swiperEnable: false }).length, 5)
const manyTop = Array.from({ length: 8 }, (_, index) => ({ path: `m${index}`, top_group_index: index + 1 }))
const trimmedTop = H.sortAttrPost('top_group_list', { posts: manyTop, swiperEnable: true })
checkEq('sortAttrPost 超出目标长度时保留原长度（上游用新文章替换尾部，不缩短）', trimmedTop.length, 8)
checkEq(
  'sortAttrPost 截断：前 4 个是 index 最大的，尾部换成「最新可用」',
  JSON.stringify(trimmedTop.map((p) => p.path)),
  '["m7","m6","m5","m4","m0","m1","m2","m3"]',
)

log('=== B18. tags_page_list → tagsPageList ===')
const tagsPageHtml = H.tagsPageList([
  { name: 'A', path: 'tags/a/', length: 1 },
  { name: 'B', path: 'tags/b/', length: 5 },
  { name: 'C', path: 'tags/c/', length: 5 },
  { name: 'D', path: 'tags/d/', length: 2 },
])
check('tagsPageList 按文章数降序', tagsPageHtml.indexOf('tags/b/') < tagsPageHtml.indexOf('tags/c/') && tagsPageHtml.indexOf('tags/c/') < tagsPageHtml.indexOf('tags/d/') && tagsPageHtml.indexOf('tags/d/') < tagsPageHtml.indexOf('tags/a/'))
check('tagsPageList href 与 id', tagsPageHtml.includes('href="/tags/b/" id="/tags/b/"'))
check('tagsPageList 井号与前缀', tagsPageHtml.includes('<span class="tags-punctuation">#</span>B'))
check('tagsPageList 计数', tagsPageHtml.includes('<span class="tagsPageCount">5</span>'))
checkEq('tagsPageList 空数组 → 空串', H.tagsPageList([]), '')

log('=== B19. year.js → getAnimalIcon ===')
for (const [year, icon] of [
  [2023, 'anzhiyu-colorful-icon-rabbit'],
  [2024, 'anzhiyu-colorful-icon-dragon'],
  [2025, 'anzhiyu-colorful-icon-snake'],
  [1990, 'anzhiyu-colorful-icon-horse'],
  ['2020', 'anzhiyu-colorful-icon-rat'],
]) {
  checkEq(`getAnimalIcon(${show(year)})`, H.getAnimalIcon(year), icon)
}
checkEq('getAnimalIcon 非数字 → undefined', H.getAnimalIcon('abc'), undefined)
checkEq('getAnimalIcon 负数 → undefined（上游同）', H.getAnimalIcon(-1), undefined)

/* ==================================================================== */
/* C. 上游 oracle：直接执行上游 JS，与 TS 移植逐字节对比                    */
/* ==================================================================== */

log('=== C. 上游 oracle：加载 _research 上游 helper 源码逐字节对比 ===')
const FILES = [
  'aside_archives.js',
  'aside_categories.js',
  'catalog_list.js',
  'findArchiveLength.js',
  'get_version.js',
  'inject_head_js.js',
  'page.js',
  'random.js',
  'related_post.js',
  'sort_attr_post.js',
  'tags_page_list.js',
  'year.js',
]

if (!existsSync(UPSTREAM_HELPERS)) {
  skipped += 1
  log(`SKIP 上游 helper 目录不存在: ${UPSTREAM_HELPERS}（可用 THEME_UPSTREAM_HELPERS 指定）`)
} else {
  check(
    '上游 12 个 helper 源文件可读',
    FILES.every((file) => existsSync(path.join(UPSTREAM_HELPERS, file))),
    FILES.filter((file) => !existsSync(path.join(UPSTREAM_HELPERS, file))).join(', ') || '12/12',
  )

  const p = (pathValue) => `/${pathValue}`
  const zhT = (key, ...args) => t(key, 'zh-CN', ...args)
  const enT = (key, ...args) => t(key, 'en', ...args)

  /* ---------------- C1. aside_archives ---------------- */
  {
    const posts = [
      { date: utcDate(2024, 3, 20) },
      { date: utcDate(2024, 3, 5) },
      { date: utcDate(2024, 2, 10) },
      { date: utcDate(2023, 12, 1) },
    ]
    const oraclePosts = new FakeQuery(posts.map((post) => ({ date: fakeMoment({ year: post.date.getUTCFullYear(), month: post.date.getUTCMonth() + 1, day: post.date.getUTCDate() }) })))
    const { hexo, helpers } = loadUpstream('aside_archives.js', { config: { archive_dir: 'archives', language: 'zh-CN' } })
    const oracleThis = { config: hexo.config, site: { posts: oraclePosts }, url_for: p, _p: zhT, page: {} }
    const tsInput = { posts, archiveDir: 'archives', language: 'zh-CN', urlFor: p, t: zhT }
    for (const options of [
      { limit: 2 },
      { limit: 0 },
      { limit: 8 },
      { type: 'yearly', limit: 0 },
      { limit: 0, show_count: false },
      { limit: 1, order: 1 },
      { limit: 0, transform: (name) => `[${name}]` },
    ]) {
      const expected = helpers.aside_archives.call(oracleThis, options)
      const actual = H.asideArchives(options, tsInput)
      checkHtml(`oracle aside_archives(${JSON.stringify(options, (k, v) => (typeof v === 'function' ? '[fn]' : v))})`, actual, expected)
    }
    const enThis = { ...oracleThis, _p: enT }
    checkHtml(
      'oracle aside_archives en 语言',
      H.asideArchives({ limit: 1 }, { ...tsInput, language: 'en', t: enT }),
      helpers.aside_archives.call({ ...enThis, config: { ...hexo.config, language: 'en' } }, { limit: 1 }),
    )
  }

  /* ---------------- C2. aside_categories ---------------- */
  {
    const categories = categoryFixtures.map((cat) => ({ ...cat }))
    const { hexo, helpers } = loadUpstream('aside_categories.js', { config: { category_dir: 'categories' } })
    const oracleThis = {
      config: hexo.config,
      site: { categories: new FakeQuery(categories) },
      url_for: p,
      _p: zhT,
    }
    for (const options of [
      { limit: 8, expand: true },
      { limit: 8 },
      { limit: 8, expand: 'none' },
      { limit: 8, show_count: false },
      { limit: 1 },
      { limit: 0, depth: 1 },
    ]) {
      const expected = helpers.aside_categories.call(oracleThis, options)
      const actual = H.asideCategories(options, { categories, categoryDir: 'categories', urlFor: p, t: zhT })
      checkHtml(`oracle aside_categories(${JSON.stringify(options)})`, actual, expected)
    }
  }

  /* ---------------- C3. catalog_list ---------------- */
  {
    const categories = [
      { path: 'categories/a/', name: 'A' },
      { path: 'categories/b/', name: 'B' },
    ]
    const { helpers } = loadUpstream('catalog_list.js', { locals: { categories } })
    checkHtml('oracle catalog_list(categories)', H.catalogList(categories), helpers.catalog_list.call({}, 'categories'))
  }

  /* ---------------- C4. findArchiveLength ---------------- */
  {
    const posts = lengthFixtures.posts
    const oraclePosts = new FakeQuery(posts.map((post) => ({ date: fakeMoment({ year: post.date.getUTCFullYear(), month: post.date.getUTCMonth() + 1, day: post.date.getUTCDate() }) })))
    const { hexo, helpers } = loadUpstream('findArchiveLength.js', { config: { archive_generator: fullArchiveGen } })
    const oracleThis = {
      config: hexo.config,
      site: { posts: oraclePosts },
      fragment_cache: (name, fn) => fn(),
    }
    for (const page of [{ year: 2024 }, { year: 2023 }, { year: 2024, month: 3 }, { year: 2023, month: 12 }]) {
      const expected = helpers.getArchiveLength.call({ ...oracleThis, page }, { month: page.month })
      const actual = H.getArchiveLength({ ...lengthFixtures, page, archiveGenerator: fullArchiveGen })
      check(`oracle getArchiveLength(${JSON.stringify(page)})`, actual === expected, `实际 ${actual} / 上游 ${expected}`)
    }
    const dailyGen = { enable: true, yearly: true, monthly: true, daily: true }
    const dailyLoaded = loadUpstream('findArchiveLength.js', { config: { archive_generator: dailyGen } })
    const dailyPage = { year: 2024, month: 3, day: 20 }
    const dailyExpected = dailyLoaded.helpers.getArchiveLength.call({ ...oracleThis, page: dailyPage }, { month: 3, day: 20 })
    check(
      'oracle getArchiveLength(daily)',
      H.getArchiveLength({ ...lengthFixtures, page: dailyPage, archiveGenerator: dailyGen }) === dailyExpected,
      `上游 ${dailyExpected}`,
    )
    const disabled = loadUpstream('findArchiveLength.js', { config: { archive_generator: { enable: false } } })
    check(
      'oracle getArchiveLength(enable=false)',
      H.getArchiveLength({ ...lengthFixtures, page: { year: 2024 }, archiveGenerator: { enable: false } }) ===
        disabled.helpers.getArchiveLength.call({ ...oracleThis, page: { year: 2024 } }),
    )
  }

  /* ---------------- C5. get_version ---------------- */
  {
    const { helpers } = loadUpstream('get_version.js', {})
    const expected = helpers.get_version.call({})
    checkEq('oracle get_version（真实上游 package.json）', H.getVersion(upstreamPackageJson), expected)
  }

  /* ---------------- C6. inject_head_js ---------------- */
  {
    const cases = [
      { darkmode: { enable: false }, aside: {}, themeColor: { enable: false } },
      { darkmode: { enable: true, autoChangeMode: 1, start: 7, end: 19 }, aside: { enable: true, button: true }, themeColor: { enable: true, meta_theme_color_light: '#fafafa', meta_theme_color_dark: '#101010' } },
      { darkmode: { enable: true, autoChangeMode: 2 }, aside: { enable: false, button: true }, themeColor: { enable: false } },
      { darkmode: { enable: true }, aside: { enable: true, button: false }, themeColor: null },
    ]
    for (const item of cases) {
      const { helpers } = loadUpstream('inject_head_js.js', { themeConfig: { theme_color: item.themeColor } })
      const expected = helpers.inject_head_js.call({ theme: { darkmode: item.darkmode, aside: item.aside } })
      const actual = H.injectHeadJs({ darkmode: item.darkmode, aside: item.aside, themeColor: item.themeColor ?? undefined })
      checkHtml(`oracle inject_head_js(autoChangeMode=${item.darkmode.autoChangeMode ?? '-'})`, actual, expected)
    }
  }

  /* ---------------- C7. page.js 的 8 个 helper ---------------- */
  {
    const { hexo, helpers } = loadUpstream('page.js', {
      config: { date_format: 'YYYY-MM-DD', language: 'zh-CN', url: 'https://example.com/current/index.html' },
      themeConfig: { aside: { card_archives: { format: 'MMMM YYYY' } } },
    })
    const dateHelper = fakeDateHelper('zh-cn')

    // page_description
    for (const page of [
      { description: 'plain desc', content: '<p>content</p>' },
      { content: '<p>hello <b>world</b></p>  & more' },
      { content: 'a'.repeat(200) },
      { title: '标题' },
      {},
    ]) {
      const expected = helpers.page_description.call({ config: hexo.config, page })
      const actual = H.pageDescription({ page, config: hexo.config })
      checkEq(`oracle page_description(${show(page).slice(0, 40)})`, actual, expected)
    }

    // get_page_fill_description
    const fillPages = [
      { content: '<h2>第一节</h2><p>中文正文abc</p><h3><a href="/x">第二节</a></h3><div class="post-ai-description">AI 摘要不要</div>' },
      { content: '纯中文内容' },
      {},
    ]
    for (const page of fillPages) {
      const expected = helpers.get_page_fill_description.call({ config: hexo.config, page })
      const actual = H.getPageFillDescription({ page, config: hexo.config })
      checkEq(`oracle get_page_fill_description(${show(page).slice(0, 30)})`, actual, expected)
    }

    // cloudTags（Math.random 打桩，保证颜色可比）
    const tags = [
      { name: 'B', path: 'tags/b/', length: 3 },
      { name: 'A', path: 'tags/a/', length: 1 },
      { name: 'C', path: 'tags/c/', length: 10 },
    ]
    const randomValues = [0.01, 0.5, 0.99, 0.3, 0.7, 0.2, 0.6, 0.4, 0.8]
    const runWithRandom = (run) => {
      let index = 0
      const original = Math.random
      Math.random = () => randomValues[index++ % randomValues.length]
      try {
        return run()
      } finally {
        Math.random = original
      }
    }
    for (const options of [
      { minfontsize: 10, maxfontsize: 20 },
      { minfontsize: 0.875, maxfontsize: 1.05, unit: 'rem', limit: 2 },
      { minfontsize: 10, maxfontsize: 20, color: true },
      { minfontsize: 10, maxfontsize: 20, highlightTags: ['A', 'C'] },
    ]) {
      let expected
      runWithRandom(() => {
        expected = helpers.cloudTags.call({ url_for: p }, { ...options, source: new FakeQuery(tags) })
      })
      let index = 0
      const actual = H.cloudTags(
        { ...options, tags },
        { urlFor: p, random: () => randomValues[index++ % randomValues.length] },
      )
      checkHtml(`oracle cloudTags(${JSON.stringify(options)})`, actual, expected)
    }

    // urlNoIndex
    for (const url of ['https://example.com/current/index.html', 'https://example.com/a/post.html', 'https://example.com/archives/']) {
      checkEq(`oracle urlNoIndex(this.url=${url})`, H.urlNoIndex(null, url), helpers.urlNoIndex.call({ url }))
      checkEq(`oracle urlNoIndex(显式 ${url})`, H.urlNoIndex(url), helpers.urlNoIndex.call({}, url))
    }

    // md5
    for (const input of ['post/1/', '/a%20b.html', 'tags/中文/']) {
      checkEq(`oracle md5(${show(input)})`, H.md5(input, p), helpers.md5.call({ url_for: p }, input))
    }

    // injectHtml
    for (const data of [null, [], ['<meta a>'], ['<a>', '<b>', '<c>']]) {
      checkEq(`oracle injectHtml(${show(data)})`, H.injectHtml(data), helpers.injectHtml.call({}, data))
    }

    // findArchivesTitle
    const titleBase = { _p: zhT }
    const titlePages = [{ year: 2024 }, { year: 2024, month: 5 }, {}]
    for (const page of titlePages) {
      for (const menu of [null, { 归档: '/archives/' }, { 文章: { 归档: '/archives/ || icon' } }]) {
        const expected = helpers.findArchivesTitle.call(titleBase, page, menu, dateHelper)
        const actual = H.findArchivesTitle(page, menu, {
          archiveFormat: 'MMMM YYYY',
          t: zhT,
          formatDate: dateHelper,
        })
        check(
          `oracle findArchivesTitle(${show(page)}, menu=${show(menu)})`,
          actual === expected,
          actual === expected ? '' : `实际 ${show(actual)} / 上游 ${show(expected)}`,
        )
      }
    }

    // isImgOrUrl
    for (const input of ['https://example.com/a', '/img/a.png', 'a.svg?x=1', '/post/a.html', 'a']) {
      checkEq(`oracle isImgOrUrl(${show(input)})`, H.isImgOrUrl(input), helpers.isImgOrUrl.call({}, input))
    }
  }

  /* ---------------- C8. random.js ---------------- */
  {
    const posts = [{ path: 'p/1/' }, { path: 'p/2/', random: false }, { path: 'p/3/' }]
    const links = [{ link_list: [{ name: '友链A', link: 'https://a.example', avatar: '/a.png' }] }]
    const oracleLocals = { posts: { data: posts }, data: { link: links } }
    // fix-plan 2.2.2 有意偏差（见 helpers.ts randomGenerator 的 @deviation 注释）：
    // footer 友链脚本比上游多三处安全补丁（空链表守卫 / name、link 写 HTML 前转义 /
    // 容器判空）。把补丁应用到上游产物后必须与本实现逐字节一致；补丁本身另有专测。
    const applyRandomSafetyPatches = (data) =>
      data
        .replace(
          'function friendChainRandomTransmission() {\n      const randomIndex',
          'function friendChainRandomTransmission() {\n      if (!friend_link_list.length) return;\n      const randomIndex',
        )
        .replace(
          `          const returnInfo = "<a class='footer-item' href='" + link + "' target='_blank' rel='noopener nofollow'>" + name + "</a>"`,
          `          const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');\n          const returnInfo = "<a class='footer-item' href='" + esc(link) + "' target='_blank' rel='noopener nofollow'>" + esc(name) + "</a>"`,
        )
        .replace(
          '      document.getElementById("friend-links-in-footer").innerHTML = html;',
          '      const footerLinksEl = document.getElementById("friend-links-in-footer");\n      if (footerLinksEl) footerLinksEl.innerHTML = html;',
        )
    for (const themeConfig of [
      { pjax: { enable: false }, footer: { list: { enable: false, randomFriends: 0 } } },
      { pjax: { enable: true }, footer: { list: { enable: false, randomFriends: 3 } } },
      { pjax: { enable: true }, footer: { list: { enable: true, randomFriends: 2 } } },
    ]) {
      const { hexo, helpers } = loadUpstream('random.js', { config: { random: {} }, themeConfig })
      const expected = helpers['generator:random'].call(undefined, oracleLocals)
      const actual = H.randomGenerator({
        posts,
        links,
        pjaxEnabled: themeConfig.pjax.enable,
        footerListEnabled: themeConfig.footer.list.enable,
        randomFriends: themeConfig.footer.list.randomFriends,
      })
      checkEq(`oracle random path(pjax=${themeConfig.pjax.enable})`, actual.path, expected.path)
      checkEq(
        `oracle random data(pjax=${themeConfig.pjax.enable}, footer=${themeConfig.footer.list.enable})`,
        actual.data,
        applyRandomSafetyPatches(expected.data),
      )
    }
    // 2.2.2 安全补丁的显式断言（补丁行为本身不靠 oracle 覆盖）
    const patched = H.randomGenerator({ ...randomInput, footerListEnabled: true, randomFriends: 2 }).data
    check('randomGenerator 空链表守卫', patched.includes('if (!friend_link_list.length) return;'))
    check('randomGenerator 友链 name/link 转义后拼 HTML', patched.includes('esc(link)') && patched.includes('esc(name)'))
    check('randomGenerator #friend-links-in-footer 判空', patched.includes('if (footerLinksEl) footerLinksEl.innerHTML = html;'))
  }

  /* ---------------- C9. related_post.js ---------------- */
  {
    const { hexo, helpers } = loadUpstream('related_post.js', {
      config: { date_format: 'YYYY-MM-DD' },
      themeConfig: { related_post: { limit: 6, date_type: 'created' } },
    })
    const dateHelper = fakeDateHelper('zh-cn')
    const toOraclePost = (post) => ({
      ...post,
      date: post.date ? fakeMoment({ year: post.date.getUTCFullYear(), month: post.date.getUTCMonth() + 1, day: post.date.getUTCDate() }) : undefined,
      updated: post.updated ? fakeMoment({ year: post.updated.getUTCFullYear(), month: post.updated.getUTCMonth() + 1, day: post.updated.getUTCDate() }) : undefined,
    })
    const oracleThis = {
      _p: zhT,
      escape_html: REF_HEXO_UTIL.escapeHTML,
      url_for: p,
      date: dateHelper,
    }
    // oracle 侧拿到的是假 moment，TS 侧拿到的是真实 Date；用同一个格式化函数抹平差异
    const tsDateFormatter = (value, format) => {
      if (value instanceof Date) {
        return formatMomentTokens(
          { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() },
          format,
          'zh-cn',
        )
      }
      return dateHelper(value, format)
    }
    const current = toOraclePost(relatedFixtures.current)
    const all = relatedFixtures.all.map(toOraclePost)
    const expected = helpers.related_posts.call(oracleThis, current, all)
    const actual = H.relatedPosts(relatedFixtures.current, relatedFixtures.all, {
      t: zhT,
      urlFor: p,
      dateFormat: 'YYYY-MM-DD',
      relatedPost: { limit: 6, date_type: 'created' },
      formatDate: tsDateFormatter,
    })
    checkHtml('oracle related_posts（created + escape + 权重排序）', actual, expected)

    const updatedLoaded = loadUpstream('related_post.js', {
      config: { date_format: 'YYYY-MM-DD' },
      themeConfig: { related_post: { limit: 2, date_type: 'updated' } },
    })
    const expectedUpdated = updatedLoaded.helpers.related_posts.call(oracleThis, current, all)
    const actualUpdated = H.relatedPosts(relatedFixtures.current, relatedFixtures.all, {
      t: zhT,
      urlFor: p,
      dateFormat: 'YYYY-MM-DD',
      relatedPost: { limit: 2, date_type: 'updated' },
      formatDate: tsDateFormatter,
    })
    checkHtml('oracle related_posts（updated + limit 2）', actualUpdated, expectedUpdated)

    const emptyExpected = helpers.related_posts.call(oracleThis, { path: 'x/', title: 'X', tags: [] }, all)
    const emptyActual = H.relatedPosts({ path: 'x/', title: 'X', tags: [] }, relatedFixtures.all, {
      t: zhT,
      urlFor: p,
      formatDate: tsDateFormatter,
    })
    checkEq('oracle related_posts 无匹配 → 空串', emptyActual, emptyExpected)
  }

  /* ---------------- C10. sort_attr_post.js ---------------- */
  {
    const posts = [
      { path: 'p1' },
      { path: 'p2', swiper_index: 2, top_group_index: 1 },
      { path: 'p3', swiper_index: 1, top_group_index: 3 },
      { path: 'p4', top_group_index: 2 },
      { path: 'p5', swiper_index: 3 },
    ]
    for (const swiperEnable of [true, false]) {
      const { helpers } = loadUpstream('sort_attr_post.js', {
        themeConfig: { home_top: { swiper: { enable: swiperEnable } } },
        locals: { posts: { data: posts } },
      })
      for (const type of ['swiper_list', 'top_group_list']) {
        const expected = helpers.sort_attr_post.call({}, type)
        const actual = H.sortAttrPost(type, { posts, swiperEnable })
        checkEq(
          `oracle sort_attr_post(${type}, swiper=${swiperEnable})`,
          JSON.stringify(actual?.map((item) => item.path)),
          JSON.stringify(expected?.map((item) => item.path)),
        )
      }
    }
  }

  /* ---------------- C11. tags_page_list.js ---------------- */
  {
    const tags = [
      { name: 'A', path: 'tags/a/', length: 1 },
      { name: 'B', path: 'tags/b/', length: 5 },
      { name: 'C', path: 'tags/c/', length: 5 },
      { name: 'D', path: 'tags/d/', length: 2 },
      { name: 'E', path: 'tags/e/', length: 5 },
    ]
    const { helpers } = loadUpstream('tags_page_list.js', { locals: { tags } })
    checkHtml('oracle tags_page_list(tags)', H.tagsPageList(tags), helpers.tags_page_list.call({}, 'tags'))
    const categories = [
      { name: 'X', path: 'categories/x/', length: 2 },
      { name: 'Y', path: 'categories/y/', length: 9 },
    ]
    const categoriesLoaded = loadUpstream('tags_page_list.js', { locals: { categories } })
    checkHtml(
      'oracle tags_page_list(categories)',
      H.tagsPageList(categories),
      categoriesLoaded.helpers.tags_page_list.call({}, 'categories'),
    )
  }

  /* ---------------- C12. year.js ---------------- */
  {
    const { helpers } = loadUpstream('year.js', {})
    let allMatch = true
    let detail = ''
    for (let year = 1990; year <= 2030; year++) {
      const expected = helpers.getAnimalIcon.call({}, year)
      const actual = H.getAnimalIcon(year)
      if (actual !== expected) {
        allMatch = false
        detail = `${year}: 实际 ${actual} / 上游 ${expected}`
        break
      }
    }
    check('oracle getAnimalIcon(1990-2030 全量)', allMatch, detail)
  }
}

/* ==================================================================== */
/* 结果                                                                  */
/* ==================================================================== */
log(`结果: ${failed === 0 ? 'PASS' : 'FAIL'}（通过 ${passed} 项，失败 ${failed} 项，跳过 ${skipped} 项）`)
process.exit(failed === 0 ? 0 : 1)
