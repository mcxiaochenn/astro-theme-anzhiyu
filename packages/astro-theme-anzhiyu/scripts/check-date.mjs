#!/usr/bin/env node
/**
 * check-date.mjs — `src/utils/date.ts`（Hexo 日期 helper 语义移植）验收。
 *
 * 五部分断言：
 *   A. 解析 / 时区归一化：无时区字面量按站点时区解释、纯日期按 UTC、
 *      显式时区 / Date / 时间戳输入，以及非法输入行为。
 *   B. **跨天边界**（本次任务点名）：fixtures 里 19:45 / 23:30 / 06:00 这类时刻，
 *      「按站点时区解释」与「Astro 当 UTC 解释」在日期上差一天；有夏令时的时区
 *      按真实规则换算（含春季跳表的空洞与秋季回拨的重叠）。
 *   C. Hexo helper 输出：`date()` / `time()` / `full_date()` / `date_xml()`，
 *      `config.date_format` / `config.time_format`、moment 的常用 token、
 *      各 locale 的月份/星期名。
 *   D. **上游 oracle**：直接加载 `.baseline-work/node_modules` 里 Hexo 自己用的
 *      `moment-timezone`（Hexo 7.3.0 依赖，版本见输出），按 `hexo/dist/plugins/
 *      helper/date.js` 的调用顺序（`moment(new Date(v)).locale(l).tz(tz).format()`）
 *      对拍。目录缺失时整段 SKIP（可用 THEME_MOMENT_ROOT 指定）。
 *   E. **基准站真实产物对拍**：从 `.baseline-work/public` 的文章页里抽
 *      `<time datetime="…">` / `title="发表于 …"` / 可见文本，断言我们的
 *      `date_xml` / `full_date` / `date` 与 Hexo 产物逐字节一致。
 *
 * 用法（在 packages/astro-theme-anzhiyu 目录下）：
 *   node scripts/check-date.mjs
 *
 * 退出码：0 = 全部通过；1 = 有失败项。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const REPO_ROOT = path.resolve(PKG_ROOT, '..', '..')
const BASELINE_ROOT = process.env.BASELINE_WORK_DIR
  ? path.resolve(process.env.BASELINE_WORK_DIR)
  : path.join(REPO_ROOT, '.baseline-work')
const MOMENT_ROOT = process.env.THEME_MOMENT_ROOT
  ? path.resolve(process.env.THEME_MOMENT_ROOT)
  : path.join(BASELINE_ROOT, 'node_modules')
const BASELINE_PUBLIC = path.join(BASELINE_ROOT, 'public')

const D = await import('../src/utils/date.ts')
const H = await import('../src/utils/helpers.ts')

const log = (...args) => console.log('[check-date]', ...args)
let passed = 0
let failed = 0
let skipped = 0

const show = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text === undefined ? 'undefined' : text
}

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1
    log(`PASS ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`[check-date] FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const checkEq = (label, actual, expected) =>
  check(label, actual === expected, `实际 ${show(actual)} / 期望 ${show(expected)}`)

const checkThrows = (label, fn, expectedName = 'TypeError') => {
  try {
    fn()
    check(label, false, `没有抛异常（期望 ${expectedName}）`)
  } catch (error) {
    check(label, error?.name === expectedName, `抛出 ${error?.name}: ${error?.message}`)
  }
}

/** 与上游一致的站点配置：基准站 `.baseline-work/_config.yml`。 */
const SITE = Object.freeze({ timezone: 'Asia/Shanghai', language: 'zh-CN' })

/* ==================================================================== */
/* A. 解析 / 时区归一化                                                  */
/* ==================================================================== */

log('=== A. 解析与时区归一化 ===')

checkEq(
  'A1 无时区字面量按站点时区解释（= baseline date_xml）',
  D.parseHexoDate('2024-11-01 09:30:00').toISOString(),
  '2024-11-01T01:30:00.000Z',
)
checkEq(
  'A2 站点时区换成 UTC 时，同一字面量就落在 UTC 墙上时间',
  D.parseHexoDate('2024-11-01 09:30:00', 'UTC').toISOString(),
  '2024-11-01T09:30:00.000Z',
)
checkEq(
  'A3 显式 +08:00 与无时区字面量同一时刻',
  D.parseHexoDate('2024-11-01T09:30:00+08:00').toISOString(),
  '2024-11-01T01:30:00.000Z',
)
checkEq(
  'A4 显式 Z 就是绝对时刻',
  D.parseHexoDate('2024-11-01T09:30:00Z').toISOString(),
  '2024-11-01T09:30:00.000Z',
)
checkEq(
  'A5 纯日期 YYYY-MM-DD 走 UTC（ECMAScript 规范 + Hexo new Date 行为）',
  D.parseHexoDate('2025-04-20').toISOString(),
  '2025-04-20T00:00:00.000Z',
)
checkEq(
  'A6 一位月日的宽松写法走站点时区（V8 对非 ISO 写法按本地解释）',
  D.parseHexoDate('2025-4-20').toISOString(),
  '2025-04-19T16:00:00.000Z',
)
checkEq(
  'A7 秒级毫秒精度保留',
  D.parseHexoDate('2025-04-20 11:15:30.250').toISOString(),
  '2025-04-20T03:15:30.250Z',
)
checkEq(
  'A7a 美式 M/D/YYYY 斜杠写法按站点时区锚定（runtimeshow.publish_date 默认值）',
  D.parseHexoDate('4/1/2021 00:00:00').toISOString(),
  '2021-03-31T16:00:00.000Z',
)
checkEq(
  'A7b 美式写法在显式 UTC 时区下按 UTC 墙上时间锚定',
  D.parseHexoDate('12/31/2021', 'UTC').toISOString(),
  '2021-12-31T00:00:00.000Z',
)
checkEq(
  'A7c 美式写法含时间',
  D.parseHexoDate('12/31/2021 23:59:59').toISOString(),
  '2021-12-31T15:59:59.000Z',
)
// 进程时区无关性无法在单一进程里断言，但 A7a 的期望值（16:00Z）
// 只在「按 Asia/Shanghai 解释墙上时间」时成立——本机 TZ=+08 与 CI TZ=UTC
// 都必须产出它（CI 实证过：修复前 CI 是 00:00Z、本机是 16:00Z）。
{
  const source = new Date('2024-11-01T01:30:00Z')
  const copy = D.parseHexoDate(source)
  check(
    'A8 Date 输入复制一份、值不变',
    copy.getTime() === source.getTime() && copy !== source,
    `getTime=${copy.getTime()}`,
  )
}
checkEq(
  'A9 时间戳输入（毫秒）',
  D.hexoFullDate(Date.UTC(2024, 10, 1, 1, 30), SITE),
  '2024-11-01 09:30:00',
)
checkThrows('A10 非法日期字面量抛 TypeError', () => D.parseHexoDate('不是日期'))
checkEq('A11 非法日期经 date() 输出 moment 同款 "Invalid date"', D.hexoDate('不是日期', SITE), 'Invalid date')
checkThrows(
  'A12 非法时区名抛 TypeError（不是静默按 UTC）',
  () => D.getDateTimeParts(new Date('2024-11-01T01:30:00Z'), 'Not/AZone'),
)
checkThrows('A13 date_xml 对非法日期抛 TypeError（构建期就炸，不写假 datetime）', () => D.hexoDateXml('不是日期'))

/* ==================================================================== */
/* B. 跨天边界（本任务重点）                                             */
/* ==================================================================== */

log('=== B. 跨天边界 ===')

// B1/B2：fixtures/cover-variants.md 的真实值 2025-02-20 19:45
checkEq(
  'B1 正确语义：2025-02-20 19:45（+08）→ UTC 11:45Z，日期不变',
  D.parseHexoDate('2025-02-20 19:45:00').toISOString(),
  '2025-02-20T11:45:00.000Z',
)
checkEq(
  'B1 正确语义：渲染回 +08 仍是 2025-02-20 19:45',
  D.hexoFullDate('2025-02-20 19:45:00', SITE),
  '2025-02-20 19:45:00',
)
checkEq(
  'B2 反向验证：Astro 旧行为（当 UTC 解析 = 19:45Z）在 +08 下跨到 02-21',
  D.formatHexoDate(new Date('2025-02-20T19:45:00Z'), 'YYYY-MM-DD HH:mm', SITE),
  '2025-02-21 03:45',
)

// B3：任务里点名的 23:30 边界
checkEq(
  'B3 2025-02-20 23:30（+08）→ UTC 15:30Z',
  D.parseHexoDate('2025-02-20 23:30:00').toISOString(),
  '2025-02-20T15:30:00.000Z',
)
checkEq(
  'B3 若当 UTC 解析（23:30Z）在 +08 下变成 02-21 07:30：日期 +1',
  D.formatHexoDate(new Date('2025-02-20T23:30:00Z'), 'YYYY-MM-DD HH:mm', SITE),
  '2025-02-21 07:30',
)
check(
  'B3 两种解释的日期不同（跨天边界确实存在，差 1 天）',
  D.formatHexoDate(new Date('2025-02-20T23:30:00Z'), 'YYYY-MM-DD', SITE) !==
    D.hexoDate('2025-02-20 23:30:00', SITE),
  `${D.hexoDate('2025-02-20 23:30:00', SITE)} vs ${D.formatHexoDate(
    new Date('2025-02-20T23:30:00Z'),
    'YYYY-MM-DD',
    SITE,
  )}`,
)

// B4：反方向跨天（+08 的凌晨 = 前一天 UTC）
checkEq(
  'B4 2025-03-05 06:00（+08）→ UTC 前一天 22:00Z',
  D.parseHexoDate('2025-03-05 06:00:00').toISOString(),
  '2025-03-04T22:00:00.000Z',
)
checkEq(
  'B4 UTC 日历日期是 03-04，+08 日历日期是 03-05（差一天）',
  `${D.formatHexoDate(new Date('2025-03-04T22:00:00Z'), 'YYYY-MM-DD', { ...SITE, timezone: 'UTC' })} / ${D.formatHexoDate(
    new Date('2025-03-04T22:00:00Z'),
    'YYYY-MM-DD',
    SITE,
  )}`,
  '2025-03-04 / 2025-03-05',
)

// B5：真实 fixture 值抽查（10 篇 fixtures 的完整清单见 docs/notes/topics/P-markdown-date-align.md）
checkEq(
  'B5 fixtures/short-note.md：2024-12-15 21:05（+08）→ 13:05Z',
  D.hexoDateXml('2024-12-15 21:05:00', SITE),
  '2024-12-15T13:05:00.000Z',
)
checkEq(
  'B5 fixtures/tags-thirdparty.md：2025-04-20 11:15（+08）→ 03:15Z',
  D.hexoDateXml('2025-04-20 11:15:00', SITE),
  '2025-04-20T03:15:00.000Z',
)

// B6：夏令时（有 DST 的站点时区必须按真实规则换算，不能固定 +8）
checkEq(
  'B6 America/New_York 冬季 2025-01-01 12:00 → 17:00Z（EST，-05:00）',
  D.parseHexoDate('2025-01-01 12:00:00', 'America/New_York').toISOString(),
  '2025-01-01T17:00:00.000Z',
)
checkEq(
  'B6 America/New_York 夏季 2025-07-01 12:00 → 16:00Z（EDT，-04:00）',
  D.parseHexoDate('2025-07-01 12:00:00', 'America/New_York').toISOString(),
  '2025-07-01T16:00:00.000Z',
)
checkEq(
  'B7 春季跳表空洞 2025-03-09 02:30（不存在）→ 顺延到 03:30 EDT = 07:30Z（moment moveInvalidForward）',
  D.parseHexoDate('2025-03-09 02:30:00', 'America/New_York').toISOString(),
  '2025-03-09T07:30:00.000Z',
)
checkEq(
  'B7 秋季回拨重叠 2025-11-02 01:30（出现两次）→ 取较早的 EDT = 05:30Z（moment moveAmbiguousForward=false）',
  D.parseHexoDate('2025-11-02 01:30:00', 'America/New_York').toISOString(),
  '2025-11-02T05:30:00.000Z',
)

/* ==================================================================== */
/* C. Hexo helper 输出                                                   */
/* ==================================================================== */

log('=== C. Hexo helper 输出（date / time / full_date / date_xml） ===')

const CREATED = '2024-11-01 09:30:00'
const INSTANT = new Date('2024-11-01T01:30:00Z')

checkEq('C1 date() 用 config.date_format（YYYY-MM-DD）', D.hexoDate(CREATED, SITE), '2024-11-01')
checkEq('C2 time() 用 config.time_format（HH:mm:ss）', D.hexoTime(CREATED, SITE), '09:30:00')
checkEq('C3 full_date() = date + " " + time', D.hexoFullDate(CREATED, SITE), '2024-11-01 09:30:00')
checkEq(
  'C4 full_date(value, format) 直接按 format 格式化',
  D.hexoFullDate(CREATED, SITE, 'YYYY年MM月DD日'),
  '2024年11月01日',
)
checkEq('C5 date_xml() = toISOString()', D.hexoDateXml(CREATED, SITE), '2024-11-01T01:30:00.000Z')
checkEq(
  'C6 归档卡片的 MMMM YYYY（zh-CN）= 十一月 2024（baseline 侧栏同款）',
  D.formatHexoDate(INSTANT, 'MMMM YYYY', SITE),
  '十一月 2024',
)
checkEq(
  'C7 MMMM YYYY 换 en locale = November 2024',
  D.formatHexoDate(INSTANT, 'MMMM YYYY', { timezone: 'Asia/Shanghai', language: 'en' }),
  'November 2024',
)
checkEq(
  'C8 MMM zh-CN / en = 11月 / Nov',
  `${D.formatHexoDate(INSTANT, 'MMM', SITE)} / ${D.formatHexoDate(INSTANT, 'MMM', { ...SITE, language: 'en' })}`,
  '11月 / Nov',
)
checkEq(
  'C9 星期 token dddd ddd dd d（moment 的 d 是数字星期，0=周日）',
  D.formatHexoDate(INSTANT, 'dddd ddd dd d', SITE),
  '星期五 周五 五 5',
)
checkEq(
  'C10 时间 token HH:mm:ss|H:m:s|hh:mm A|h:mm a（en locale）',
  D.formatHexoDate(INSTANT, 'HH:mm:ss|H:m:s|hh:mm A|h:mm a', { ...SITE, language: 'en' }),
  '09:30:00|9:30:0|09:30 AM|9:30 am',
)
checkEq(
  'C10 中文 locale 的 meridiem 是 moment 的六档「上午/晚上」而不是 AM/PM',
  D.formatHexoDate(INSTANT, 'A / a / hh:mm A', SITE),
  '上午 / 上午 / 09:30 上午',
)
checkEq('C11 偏移量 token Z ZZ', D.formatHexoDate(INSTANT, 'Z ZZ', SITE), '+08:00 +0800')
checkEq(
  'C12 时间戳 token X x',
  D.formatHexoDate(INSTANT, 'X x', SITE),
  '1730424600 1730424600000',
)
checkEq(
  'C13 [字面量] 转义',
  D.formatHexoDate(INSTANT, '[发布于] YYYY 年 [MM 月]', SITE),
  '发布于 2024 年 MM 月',
)
{
  const now = new Date('2026-01-02T03:04:05Z')
  checkEq(
    'C14 date == null 时等价 moment()（注入 config.now 保证确定性）',
    D.hexoFullDate(null, { ...SITE, now }),
    '2026-01-02 11:04:05',
  )
}
{
  const formatter = D.createSiteDateFormatter(SITE)
  checkEq(
    'C15 createSiteDateFormatter 绑定站点配置',
    [
      formatter.date(CREATED),
      formatter.time(CREATED),
      formatter.fullDate(CREATED),
      formatter.xml(CREATED),
      formatter.format(CREATED, 'MMMM YYYY'),
      formatter.parse(CREATED).toISOString(),
    ].join(' | '),
    '2024-11-01 | 09:30:00 | 2024-11-01 09:30:00 | 2024-11-01T01:30:00.000Z | 十一月 2024 | 2024-11-01T01:30:00.000Z',
  )
}

/* ==================================================================== */
/* D. 上游 oracle：真实 moment-timezone（Hexo 7.3.0 的依赖）             */
/* ==================================================================== */

log('=== D. 上游 oracle（moment-timezone） ===')

let momentTz = null
let momentVersion = ''
try {
  if (existsSync(path.join(MOMENT_ROOT, 'moment-timezone'))) {
    const require = createRequire(path.join(MOMENT_ROOT, 'index.js'))
    momentTz = require('moment-timezone')
    momentVersion = require('moment-timezone/package.json').version
  }
} catch (error) {
  log(`moment-timezone 加载失败，D 段跳过：${error?.message}`)
  momentTz = null
}

if (!momentTz) {
  skipped += 1
  log(`SKIP D 段：${path.join(MOMENT_ROOT, 'moment-timezone')} 不存在`)
  log('（.baseline-work 被 gitignore；本地跑 hexo g 后才有。可用 THEME_MOMENT_ROOT 指定 node_modules）')
} else {
  log(`oracle = moment-timezone ${momentVersion}（${path.relative(REPO_ROOT, MOMENT_ROOT)}）`)

  /**
   * Hexo `getMoment()` 的直译：
   *   moment(date == null ? undefined : isDate(date) ? date : new Date(date))
   *     .locale(toMomentLocale(lang))
   *     .tz(config.timezone)
   *     .format(fmt)
   */
  const oracleFormat = (value, format, { timezone = 'Asia/Shanghai', locale = 'en' } = {}) => {
    const momentValue =
      value === null || value === undefined
        ? momentTz()
        : momentTz(value instanceof Date ? value : new Date(value))
    momentValue.locale(locale === 'en' ? 'en' : locale)
    return momentValue.tz(timezone).format(format)
  }

  const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const hostMatchesSite = hostTimeZone === 'Asia/Shanghai'

  // D1：固定时刻 × 格式 × locale × 时区 矩阵
  const FORMATS = [
    'YYYY-MM-DD',
    'YYYY-MM-DD HH:mm:ss',
    'dddd ddd dd d',
    'MMMM',
    'MMMM YYYY',
    'MMM',
    'hh:mm A|h:mm a',
    'Z ZZ',
    'X x',
    '[发布于] YYYY',
  ]
  const TIMEZONES = ['Asia/Shanghai', 'UTC', 'America/New_York']
  const LOCALES = ['en', 'zh-cn']
  let matrixChecks = 0
  const matrixFailures = []
  for (const format of FORMATS) {
    for (const locale of LOCALES) {
      for (const timezone of TIMEZONES) {
        const actual = D.formatHexoDate(INSTANT, format, { timezone, language: locale })
        const expected = oracleFormat(INSTANT, format, { timezone, locale })
        matrixChecks += 1
        if (actual !== expected) matrixFailures.push(`${format} / ${locale} / ${timezone}: ${actual} != ${expected}`)
      }
    }
  }
  check(
    `D1 固定时刻格式化矩阵（${TIMEZONES.length} 时区 × ${LOCALES.length} locale × ${FORMATS.length} 格式 = ${matrixChecks} 组）与 moment-timezone 逐字一致`,
    matrixFailures.length === 0,
    matrixFailures.join('; '),
  )

  // D2：无时区字面量 → moment(new Date(v))；宿主时区必须与站点时区一致才有意义
  if (hostMatchesSite) {
    const fixtureDates = [
      '2024-11-01 09:30:00',
      '2024-12-15 21:05:00',
      '2025-01-10 10:00:00',
      '2025-02-02 08:20:00',
      '2025-02-20 19:45:00',
      '2025-03-05 14:10:00',
      '2025-03-18 09:00:00',
      '2025-04-01 16:30:00',
      '2025-04-20 11:15:00',
      '2025-05-01 08:00:00',
    ]
    const mismatches = []
    for (const value of fixtureDates) {
      const actual = D.parseHexoDate(value).toISOString()
      const expected = new Date(value).toISOString()
      if (actual !== expected) mismatches.push(`${value}: ${actual} != ${expected}`)
      const actualFull = D.hexoFullDate(value, SITE)
      const expectedFull = oracleFormat(new Date(value), 'YYYY-MM-DD HH:mm:ss', { locale: 'en' })
      if (actualFull !== expectedFull) mismatches.push(`${value} full_date: ${actualFull} != ${expectedFull}`)
    }
    check(
      `D2 10 篇 fixtures 的无时区字面量，解析结果与 Hexo 的 moment(new Date(v)) 一致（宿主 TZ=${hostTimeZone}）`,
      mismatches.length === 0,
      mismatches.join('; '),
    )
  } else {
    skipped += 1
    log(`SKIP D2：宿主时区 ${hostTimeZone} ≠ 站点时区 Asia/Shanghai，裸字面量的宿主本地解释不可比`)
  }

  // D3：非法日期
  checkEq('D3 非法日期与 moment 同款输出', D.hexoDate('不是日期', SITE), oracleFormat('不是日期', 'YYYY-MM-DD'))

  // D4：helpers.ts 的 formatMomentLike 与 date.ts 的 formatDateParts 交叉一致
  {
    const parts = D.getDateTimeParts(INSTANT, SITE.timezone)
    const cases = [
      ['MMMM YYYY', 'zh-cn'],
      ['MMMM YYYY', 'en'],
      ['YYYY', 'en'],
    ]
    const mismatches = []
    for (const [format, locale] of cases) {
      const fromHelpers = H.formatMomentLike(parts, format, locale)
      const fromDate = D.formatDateParts(parts, format, locale)
      if (fromHelpers !== fromDate) mismatches.push(`${format}/${locale}: ${fromHelpers} != ${fromDate}`)
    }
    check(
      'D4 helpers.ts formatMomentLike 与 date.ts formatDateParts 在共同支持的 token 上一致',
      mismatches.length === 0,
      mismatches.join('; '),
    )
  }
}

/* ==================================================================== */
/* E. 基准站真实产物对拍                                                 */
/* ==================================================================== */

log('=== E. 基准站真实产物对拍（.baseline-work/public） ===')

const BASELINE_PAGES = [
  {
    page: '2024/11/01/longform-hexo-astro/index.html',
    frontmatter: '2024-11-01 09:30:00',
    xml: '2024-11-01T01:30:00.000Z',
    text: '2024-11-01',
    fullDate: '2024-11-01 09:30:00',
  },
  {
    page: '2025/02/20/cover-variants/index.html',
    frontmatter: '2025-02-20 19:45:00',
    xml: '2025-02-20T11:45:00.000Z',
    text: '2025-02-20',
    fullDate: '2025-02-20 19:45:00',
  },
  {
    page: '2024/12/15/short-note/index.html',
    frontmatter: '2024-12-15 21:05:00',
    xml: '2024-12-15T13:05:00.000Z',
    text: '2024-12-15',
    fullDate: '2024-12-15 21:05:00',
  },
]

if (!existsSync(BASELINE_PUBLIC)) {
  skipped += 1
  log(`SKIP E 段：${BASELINE_PUBLIC} 不存在（参考产物不进仓库）`)
} else {
  for (const item of BASELINE_PAGES) {
    const file = path.join(BASELINE_PUBLIC, ...item.page.split('/'))
    if (!existsSync(file)) {
      skipped += 1
      log(`SKIP E 段 ${item.page}：文件不存在`)
      continue
    }
    const html = readFileSync(file, 'utf8')
    const datetime = /datetime="([^"]+)"/.exec(html)?.[1]
    const title = /title="(发表于 [^"]+)"/.exec(html)?.[1]
    const visible = /class="post-meta-date-created"[^>]*>([^<]+)</.exec(html)?.[1]
    check(
      `E ${item.page} 的 datetime/可见文本/title 与我们一致`,
      datetime === item.xml && visible === item.text && title === `发表于 ${item.fullDate}`,
      `datetime=${show(datetime)} 文本=${show(visible)} title=${show(title)}`,
    )
    checkEq(
      `E ${item.page} 由 frontmatter 复算 date_xml`,
      D.hexoDateXml(item.frontmatter, SITE),
      item.xml,
    )
    checkEq(
      `E ${item.page} 由 frontmatter 复算可见文本（date）`,
      D.hexoDate(item.frontmatter, SITE),
      item.text,
    )
    checkEq(
      `E ${item.page} 由 frontmatter 复算 title（full_date）`,
      D.hexoFullDate(item.frontmatter, SITE),
      item.fullDate,
    )
  }
}

/* ==================================================================== */
/* 汇总                                                                  */
/* ==================================================================== */

log('')
log(`结果：${passed} PASS / ${failed} FAIL / ${skipped} SKIP`)
if (failed > 0) {
  console.error(`[check-date] 有 ${failed} 项失败`)
  process.exit(1)
}
log('[check-date] 全部通过')
process.exit(0)
