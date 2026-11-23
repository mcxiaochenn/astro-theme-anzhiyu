/**
 * date.ts — Hexo 日期 helper（`date()` / `time()` / `full_date()` / `date_xml()`）的语义移植。
 *
 * 为什么需要这一层：上游模板里所有日期都走 Hexo 的 helper，而 helper 的真实语义是
 * **「先构造 JS Date，再交给 moment-timezone 按站点时区格式化」**
 * （`.baseline-work/node_modules/hexo/dist/plugins/helper/date.js`）：
 *
 * ```js
 * function getMoment(date, lang, timezone) {
 *   if (date == null) date = moment();
 *   if (!isMoment(date)) date = moment(isDate(date) ? date : new Date(date));
 *   if ((lang = toMomentLocale(lang))) date = date.locale(lang);
 *   if (timezone) date = date.tz(timezone);
 *   return date;
 * }
 * dateHelper(date, format) → moment.format(format || config.date_format)
 * timeHelper(date, format) → moment.format(format || config.time_format)
 * fullDateHelper(date, format) → format ? moment.format(format) : `${date(date)} ${time(date)}`
 * date_xml(date) → (date ?? new Date()).toISOString()
 * ```
 *
 * 两个容易踩的点，这里都按 Hexo 实际行为复刻：
 *
 * 1. **无时区字面量按「站点时区」解释。** `new Date('2024-11-01 09:30:00')` 是
 *    **宿主本地时区**（V8 对非 ISO 写法的实现定义行为），Hexo 基准站跑在 UTC+8 上，
 *    所以字面量恰好等于站点时区的墙上时间。我们把它改成「显式按站点时区解释」，
 *    这样换一台 TZ 不同的机器构建也得到同一个时刻（基准站的可复现前提）。
 *    注意 `YYYY-MM-DD`（纯日期、两位月日）在 ECMAScript 规范里是 **UTC**，
 *    Hexo 经 `new Date()` 也落在 UTC，所以这一种必须保持 UTC，不能按站点时区。
 * 2. **格式化在站点时区做，不是宿主时区、不是 UTC。** `2024-11-01T01:30:00Z`
 *    在 Asia/Shanghai 下是 `2024-11-01 09:30:00`，在 UTC 下是 `2024-11-01 01:30:00`，
 *    差 8 小时；19:45 / 23:30 这类晚间的时刻还会跨天。
 *
 * 与 `helpers.ts` 的关系：那边为了不把 moment 带进浏览器 bundle，已经实现了
 * `getDateParts` / `formatMomentLike`（只覆盖 `MMMM YYYY` 这类归档格式需要的 token）。
 * 本文件是**完整的日期 helper 层**：token 覆盖 `YYYY`…`dddd`…`HH:mm:ss`…`Z`，
 * 并且补上「无时区字符串 → 站点时区墙上时间 → 绝对时刻」的归一化。
 * 归档卡片仍可继续用 `formatMomentLike`（它的输出与本文件 `formatDateParts` 在
 * 它支持的那些 token 上一致，由 `scripts/check-date.mjs` 交叉断言）。
 *
 * 与前端 `date_format: relative / simple` 的关系：那是**客户端**模式
 * （上游 `layout/includes/head/config.pug:196` 把开关写进 `#config-diff` 的
 * `relativeDate`，由主题 JS 改写文本），服务端 HTML 永远是
 * `date(page.date, config.date_format)`。所以这里不实现 `fromNow()`，只做服务端格式化；
 * 相对时间由交互层负责。
 *
 * 全部函数都是纯函数：不读全局、不依赖宿主时区，同样的 (value, config) 必得同样输出。
 */
import { monthName, toMomentLocale, type DateLike } from './helpers.ts'

export type { DateLike }

/* ==================================================================== */
/* 默认值（来自基准站 .baseline-work/_config.yml）                        */
/* ==================================================================== */

/**
 * 基准站 `_config.yml` 的 `timezone: 'Asia/Shanghai'`。
 *
 * 注意这不是「固定 +08」：传入的 IANA 时区名会走 `Intl.DateTimeFormat`，
 * 有夏令时的时区（America/New_York 等）会按真实规则换算。
 */
export const DEFAULT_SITE_TIMEZONE = 'Asia/Shanghai'

/** 基准站 `_config.yml` 的 `date_format: YYYY-MM-DD`。 */
export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD'

/** 基准站 `_config.yml` 的 `time_format: HH:mm:ss`。 */
export const DEFAULT_TIME_FORMAT = 'HH:mm:ss'

/** moment 的无效日期输出（`moment.invalid().format()` → `'Invalid date'`）。 */
export const INVALID_DATE = 'Invalid date'

const MS_PER_MINUTE = 60_000

/* ==================================================================== */
/* 站点配置                                                              */
/* ==================================================================== */

/** 站点级日期配置：等价 Hexo 的 `config.timezone` / `config.language` / `date_format` / `time_format`。 */
export interface SiteDateConfig {
  /** IANA 时区名（Hexo `config.timezone`），默认 {@link DEFAULT_SITE_TIMEZONE}。 */
  timezone?: string
  /** Hexo `config.language`（`zh-CN` / `zh_TW` / `en`…），决定 `MMMM` / `dddd` 等语言化 token。 */
  language?: string
  /** Hexo `config.date_format`，默认 {@link DEFAULT_DATE_FORMAT}。 */
  dateFormat?: string
  /** Hexo `config.time_format`，默认 {@link DEFAULT_TIME_FORMAT}。 */
  timeFormat?: string
  /** `date == null` 时当作「现在」用的固定时刻（等价 moment 的 `moment()`；测试注入用）。 */
  now?: Date
}

/* ==================================================================== */
/* 时区换算：站点时区墙上时间 ⇄ 绝对时刻                                  */
/* ==================================================================== */

const formatterCache = new Map<string, Intl.DateTimeFormat>()

/** 取（并缓存）站点时区的格式化器。`Intl` 构造器很贵，按日期批量渲染时必须缓存。 */
function zoneFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timezone)
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        // h23：避免部分实现把午夜输出成 24 点
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'long',
      })
    } catch {
      throw new TypeError(`Invalid timezone: ${JSON.stringify(timezone)}`)
    }
    formatterCache.set(timezone, formatter)
  }
  return formatter
}

interface ZoneParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: string
}

/** 把绝对时刻投影到指定时区的日历字段。 */
function zoneParts(date: Date, timezone: string): ZoneParts {
  const parts = zoneFormatter(timezone).formatToParts(date)
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '0'
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
    second: Number(pick('second')),
    weekday: pick('weekday'),
  }
}

/**
 * 绝对时刻投影成「站点时区的墙上时间」，再当成 UTC 时间戳返回（毫秒）。
 *
 * 这是时区换算的公共底座：它只换「日历字段」，毫秒数原样保留
 * （毫秒在任何时区下都一样）。
 */
function wallClockMsOf(date: Date, timezone: string): number {
  const parts = zoneParts(date, timezone)
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) + date.getUTCMilliseconds()
  )
}

/**
 * 指定时刻在该时区的 UTC 偏移（分钟）。
 *
 * 做法：把该时刻的「时区墙上时间」当成 UTC 重算一次，差值就是偏移。
 * 例：`2024-11-01T01:30:00Z` 在 Asia/Shanghai 的墙上时间是 09:30，
 * `Date.UTC(09:30) - Date.UTC(01:30) = +480` 分钟。
 */
function zoneOffsetMinutes(date: Date, timezone: string): number {
  return Math.round((wallClockMsOf(date, timezone) - date.getTime()) / MS_PER_MINUTE)
}

/**
 * 站点时区的「墙上时间」→ 绝对时刻（毫秒时间戳）。
 *
 * 无时区时间在 Hexo 里是「宿主本地时区的墙上时间」；我们固定按站点时区解释。
 * 换算不能只减一个固定偏移：有夏令时的时区里，同一墙上时间可能对应
 *   - **正常**：唯一的绝对时刻；
 *   - **重叠**（秋季回拨，如 01:30 出现两次）：moment 的
 *     `moveAmbiguousForward` 默认 `false` → 取**较早**的那个（DST 那次）；
 *   - **空洞**（春季跳表，如 02:30 不存在）：moment 的
 *     `moveInvalidForward` 默认 `true` → **向后顺延**（02:30 → 03:30）。
 * 这里按同样的规则选：
 *   1. 采样候选偏移（墙上时间 −24h / +0 / +24h 三处投影的 UTC 偏移，足以跨住
 *      任何 ±2h 内的切换），每个偏移给出一个候选绝对时刻；
 *   2. 候选的偏移自洽（真正落在该偏移区间里）= 合法候选；多个 → 取最早（moment 重叠规则）；
 *   3. 一个都不合法 = 落在夏令时空洞里 → 取「渲染出来最接近且晚于目标」的候选（moment 顺延规则）。
 *
 * 基准站 Asia/Shanghai 无夏令时，第 1 步只会采到一个偏移；额外逻辑是给
 * 「站点 timezone 换成有 DST 的时区」时用的，由 check-date.mjs 的纽约冬/夏用例守着。
 */
function zonedWallClockToMs(
  wall: { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number },
  timezone: string,
): number {
  const target = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    wall.millisecond,
  )

  const offsets = new Set<number>()
  for (const delta of [-86_400_000, 0, 86_400_000]) {
    offsets.add(zoneOffsetMinutes(new Date(target + delta), timezone))
  }

  const candidates: Array<{ utcMs: number; renderedMs: number }> = []
  const valid: number[] = []
  for (const offset of offsets) {
    const utcMs = target - offset * MS_PER_MINUTE
    const renderedMs = wallClockMsOf(new Date(utcMs), timezone)
    candidates.push({ utcMs, renderedMs })
    if (renderedMs === target) valid.push(utcMs)
  }

  // 正常 / 重叠：合法候选取最早（moment 重叠时取较早的一次）
  if (valid.length > 0) return Math.min(...valid)

  // 空洞：取第一个晚于目标的渲染结果（moment 的 moveInvalidForward）
  const forward = candidates.filter((item) => item.renderedMs > target).sort((a, b) => a.renderedMs - b.renderedMs)
  if (forward.length > 0) return forward[0].utcMs
  return candidates.length > 0 ? candidates[0].utcMs : target
}

/* ==================================================================== */
/* 解析：Hexo 的 `new Date(value)` + 站点时区语义                         */
/* ==================================================================== */

/** 纯日期 ISO 写法（两位月日）：ECMAScript 规定按 UTC 解析，Hexo 经 `new Date()` 也是 UTC。 */
const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * 无时区的日期时间写法：`YYYY-M-D`、`YYYY/M/D`，可带 ` HH:mm[:ss[.SSS]]` 或 `THH:mm…`。
 * 与 V8 的宽松解析一致（月日允许一位）；这类在 Hexo 里走宿主本地时区，=
 * 「站点时区墙上时间」。
 */
const BARE_DATE_TIME =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/

function invalidDate(value: unknown): TypeError {
  return new TypeError(`Invalid date: ${JSON.stringify(value)}`)
}

/**
 * 把 Hexo 接受的日期输入归一化成绝对时刻（`Date`）。
 *
 * 输入 → 语义：
 *  - `Date`：原样（复制一份，避免调用方改到内部对象）；
 *  - `number`：毫秒时间戳；
 *  - `'2024-11-01'`（纯日期、两位月日）：**UTC** 零点（ECMAScript 规范 + Hexo `new Date()` 行为）；
 *  - `'2024-11-01 09:30:00'` / `'2024-11-01T09:30:00'` / `'2024/11/1 9:30'`：**站点时区**墙上时间；
 *  - `'2024-11-01T09:30:00Z'` / `'…+08:00'`：绝对时刻，时区只决定显示；
 *  - 其余：交给 `new Date()`（与 Hexo 的兜底一致），解析失败抛 {@link TypeError}。
 */
export function parseHexoDate(value: DateLike, timezone: string = DEFAULT_SITE_TIMEZONE): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw invalidDate(value)
    return new Date(value.getTime())
  }

  if (typeof value === 'number') {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw invalidDate(value)
    return date
  }

  if (typeof value !== 'string') throw invalidDate(value)
  const text = value.trim()
  if (!text) throw invalidDate(value)

  const isoDateOnly = ISO_DATE_ONLY.exec(text)
  if (isoDateOnly) {
    return new Date(
      Date.UTC(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3])),
    )
  }

  const bare = BARE_DATE_TIME.exec(text)
  if (bare) {
    const millisecond = Number((bare[7] ?? '0').padEnd(3, '0'))
    const utcMs = zonedWallClockToMs(
      {
        year: Number(bare[1]),
        month: Number(bare[2]),
        day: Number(bare[3]),
        hour: Number(bare[4] ?? '0'),
        minute: Number(bare[5] ?? '0'),
        second: Number(bare[6] ?? '0'),
        millisecond,
      },
      timezone,
    )
    const date = new Date(utcMs)
    if (Number.isNaN(date.getTime())) throw invalidDate(value)
    return date
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) throw invalidDate(value)
  return parsed
}

/**
 * 把 `date == null` 换成「现在」、把无效输入换成 `null`（供格式化层回退 `'Invalid date'`）。
 * 等价 Hexo `getMoment` 里 `date == null → moment()` 的分支。
 */
function normalizeHexoDate(value: DateLike | null | undefined, config: SiteDateConfig): Date | null {
  if (value === null || value === undefined) {
    const now = config.now ? new Date(config.now.getTime()) : new Date()
    return Number.isNaN(now.getTime()) ? null : now
  }
  try {
    return parseHexoDate(value, config.timezone ?? DEFAULT_SITE_TIMEZONE)
  } catch {
    return null
  }
}

/* ==================================================================== */
/* 日历字段与 token 格式化                                              */
/* ==================================================================== */

/** 一个绝对时刻在站点时区下的日历字段。 */
export interface DateTimeParts {
  year: number
  /** 1-12 */
  month: number
  /** 1-31 */
  day: number
  /** 0-23 */
  hour: number
  minute: number
  second: number
  millisecond: number
  /** 英文星期名（`Friday`），仅用于兜底；语言化输出由 {@link formatDateParts} 负责。 */
  weekday: string
  /** 该时刻在站点时区的 UTC 偏移（分钟，东八区 = +480）。 */
  offsetMinutes: number
}

/** 取绝对时刻在站点时区下的日历字段。 */
export function getDateTimeParts(
  date: Date,
  timezone: string = DEFAULT_SITE_TIMEZONE,
): DateTimeParts {
  if (Number.isNaN(date.getTime())) throw invalidDate(date)
  const parts = zoneParts(date, timezone)
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond: date.getUTCMilliseconds(),
    weekday: parts.weekday,
    offsetMinutes: zoneOffsetMinutes(date, timezone),
  }
}

const WEEKDAYS: Record<string, { long: readonly string[]; short: readonly string[]; narrow: readonly string[] }> = {
  en: {
    long: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    narrow: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  },
  'zh-cn': {
    long: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    short: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    narrow: ['日', '一', '二', '三', '四', '五', '六'],
  },
  'zh-tw': {
    long: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    short: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
    narrow: ['日', '一', '二', '三', '四', '五', '六'],
  },
}

/** 英文星期名（`Friday`）→ 0-6（周日 = 0）。未知返回 `-1`。 */
function weekdayIndex(englishWeekday: string): number {
  const names = WEEKDAYS.en.long
  for (let index = 0; index < names.length; index++) {
    if (names[index] === englishWeekday) return index
  }
  const shortIndex = WEEKDAYS.en.short.indexOf(englishWeekday)
  return shortIndex
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function offsetText(offsetMinutes: number, withColon: boolean): string {
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)
  const hours = pad(Math.floor(absolute / 60))
  const minutes = pad(absolute % 60)
  return withColon ? `${sign}${hours}:${minutes}` : `${sign}${hours}${minutes}`
}

function localizedWeekday(
  parts: DateTimeParts,
  locale: string,
  style: 'long' | 'short' | 'narrow',
): string {
  const table = WEEKDAYS[locale]
  const index = weekdayIndex(parts.weekday)
  if (table && index >= 0) return table[style][index]
  return parts.weekday
}

/**
 * moment locale 的 meridiem（`A` / `a` token）。
 *
 * 中文 locale 的 `A` 不是 AM/PM，也不是两段式，而是按小时分六档
 * （`.baseline-work/node_modules/moment/locale/zh-cn.js` 与 `zh-tw.js` 完全相同）：
 * `<06:00 凌晨`、`<09:00 早上`、`<11:30 上午`、`<12:30 中午`、`<18:00 下午`、其它 `晚上`。
 * 两个中文 locale 都忽略 `isLower`，所以 `A` 与 `a` 输出相同。
 * 未收录的 locale（`fr` / `ja` …）退回 AM/PM——主题目前只有中英四语言，
 * 真要扩语言时按 moment locale 数据补一张表即可。
 */
function meridiemText(parts: DateTimeParts, locale: string, isLower: boolean): string {
  const key = locale.toLowerCase()
  if (key === 'zh-cn' || key === 'zh-tw') {
    const hm = parts.hour * 100 + parts.minute
    if (hm < 600) return '凌晨'
    if (hm < 900) return '早上'
    if (hm < 1130) return '上午'
    if (hm < 1230) return '中午'
    if (hm < 1800) return '下午'
    return '晚上'
  }
  const upper = parts.hour < 12 ? 'AM' : 'PM'
  return isLower ? upper.toLowerCase() : upper
}

/**
 * moment 的 `format(fmt)` token 子集。
 *
 * 支持：`YYYY` `YY` `MMMM` `MMM` `MM` `M` `DD` `D` `dddd` `ddd` `dd` `d`
 * `HH` `H` `hh` `h` `mm` `m` `ss` `s` `SSS` `A` `a` `Z` `ZZ` `X` `x`，以及
 * `[字面量]` 转义。未列出的 token（`L` / `LL` / `Do` / `Q` 等）原样保留——
 * 主题配置里没有用到，真要用时再加，不猜 moment 的本地化 longDateFormat。
 *
 * token 的语义与 moment 一致：`HH` / `MM` / `SS` 补零，`H` / `M` 不补零；
 * `hh` 是 12 小时制（1-12，无前导零用 `h`）；`A` / `a` 走 locale 的 meridiem
 * （中文是「上午/晚上」六档，见 {@link meridiemText}）；`d` 是数字星期（0=周日）。
 * 语言化 token 走 {@link monthName}（与 `helpers.ts` / moment 的月份表一致）和
 * 本文件的星期表。
 */
export function formatDateParts(
  parts: DateTimeParts,
  format: string,
  locale = 'en',
): string {
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12
  const tokens: Record<string, string> = {
    YYYY: pad(parts.year, 4),
    YY: pad(parts.year % 100, 2),
    MMMM: monthName(parts.month, locale, 'long'),
    MMM: monthName(parts.month, locale, 'short'),
    MM: pad(parts.month),
    M: String(parts.month),
    DD: pad(parts.day),
    D: String(parts.day),
    dddd: localizedWeekday(parts, locale, 'long'),
    ddd: localizedWeekday(parts, locale, 'short'),
    dd: localizedWeekday(parts, locale, 'narrow'),
    // moment 的 `d` 是「星期几的数字」（0 = 周日），不是名字；名字是 dd/ddd/dddd
    d: String(weekdayIndex(parts.weekday)),
    HH: pad(parts.hour),
    H: String(parts.hour),
    hh: pad(hour12),
    h: String(hour12),
    mm: pad(parts.minute),
    m: String(parts.minute),
    ss: pad(parts.second),
    s: String(parts.second),
    SSS: pad(parts.millisecond, 3),
    A: meridiemText(parts, locale, false),
    a: meridiemText(parts, locale, true),
    Z: offsetText(parts.offsetMinutes, true),
    ZZ: offsetText(parts.offsetMinutes, false),
    X: String(Math.floor((Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - parts.offsetMinutes * MS_PER_MINUTE) / 1000)),
    x: String(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond) - parts.offsetMinutes * MS_PER_MINUTE),
  }

  // 长的 token 必须排在短的前面：`MMMM` 先于 `MMM` 先于 `MM` 先于 `M`。
  return format.replace(
    /\[([^\]]*)]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|SSS|A|a|ZZ|Z|X|x/g,
    (token, literal?: string) => {
      if (literal !== undefined) return literal
      return tokens[token] ?? token
    },
  )
}

/* ==================================================================== */
/* Hexo helper 对齐层                                                    */
/* ==================================================================== */

/**
 * `this.date(value, format)` 的等价实现。
 * `format` 缺省时用 `config.date_format`（基准站 `YYYY-MM-DD`）。
 * 无效日期返回 `'Invalid date'`（moment 行为），不抛异常——渲染层不该因一条脏数据整页崩。
 */
export function formatHexoDate(
  value: DateLike | null | undefined,
  format: string,
  config: SiteDateConfig = {},
): string {
  const { timezone = DEFAULT_SITE_TIMEZONE, language } = config
  const date = normalizeHexoDate(value, config)
  if (date === null) return INVALID_DATE
  const parts = getDateTimeParts(date, timezone)
  return formatDateParts(parts, format, toMomentLocale(language) ?? 'en')
}

/** Hexo `date(value)`：等价 `date(value, config.date_format)`。 */
export function hexoDate(value: DateLike | null | undefined, config: SiteDateConfig = {}): string {
  return formatHexoDate(value, config.dateFormat ?? DEFAULT_DATE_FORMAT, config)
}

/** Hexo `time(value)`：等价 `time(value, config.time_format)`。 */
export function hexoTime(value: DateLike | null | undefined, config: SiteDateConfig = {}): string {
  return formatHexoDate(value, config.timeFormat ?? DEFAULT_TIME_FORMAT, config)
}

/**
 * Hexo `full_date(value[, format])`：
 *  - 给了 `format` → 直接格式化；
 *  - 没给 → `date(value) + ' ' + time(value)`（上游 `title="发表于 2024-11-01 09:30:00"`）。
 */
export function hexoFullDate(
  value: DateLike | null | undefined,
  config: SiteDateConfig = {},
  format?: string,
): string {
  if (format) return formatHexoDate(value, format, config)
  return `${hexoDate(value, config)} ${hexoTime(value, config)}`
}

/**
 * Hexo `date_xml(value)`：`<time datetime="…">` 用的 UTC ISO 字符串。
 *
 * 上游是 `(date ?? new Date()).toISOString()`；`Date.toISOString()` 本身是 UTC，
 * 但 `new Date(无时区字符串)` 依赖宿主时区，所以这里同样先过 {@link parseHexoDate}
 * 归一化到站点时区，保证产物不受构建机时区影响。
 *
 * 无效日期**抛 TypeError**（与上游 `Invalid Date.toISOString()` 抛 RangeError 的
 * 「构建期就炸」行为对齐），不返回假字符串——`datetime` 属性写错比构建失败更难查。
 */
export function hexoDateXml(
  value: DateLike | null | undefined,
  config: SiteDateConfig = {},
): string {
  const date = normalizeHexoDate(value, config)
  if (date === null) throw invalidDate(value)
  return date.toISOString()
}

/**
 * 绑定站点配置的格式化器：组件层接 `this.date` / `this.time` / `this.full_date` /
 * `this.date_xml` 时用这个，避免每个调用点都重复传 timezone / language / format。
 *
 * @example
 * const fmt = createSiteDateFormatter({ timezone: 'Asia/Shanghai', language: 'zh-CN' })
 * fmt.date(post.date)                        // '2024-11-01'
 * fmt.fullDate(post.date)                    // '2024-11-01 09:30:00'
 * fmt.xml(post.date)                         // '2024-11-01T01:30:00.000Z'
 * fmt.format(post.date, 'MMMM YYYY')         // '十一月 2024'
 */
export function createSiteDateFormatter(config: SiteDateConfig = {}) {
  return {
    parse: (value: DateLike): Date => parseHexoDate(value, config.timezone ?? DEFAULT_SITE_TIMEZONE),
    format: (value: DateLike | null | undefined, format: string): string =>
      formatHexoDate(value, format, config),
    date: (value: DateLike | null | undefined): string => hexoDate(value, config),
    time: (value: DateLike | null | undefined): string => hexoTime(value, config),
    fullDate: (value: DateLike | null | undefined, format?: string): string =>
      hexoFullDate(value, config, format),
    xml: (value: DateLike | null | undefined): string => hexoDateXml(value, config),
    parts: (value: DateLike): DateTimeParts =>
      getDateTimeParts(
        parseHexoDate(value, config.timezone ?? DEFAULT_SITE_TIMEZONE),
        config.timezone ?? DEFAULT_SITE_TIMEZONE,
      ),
  }
}
