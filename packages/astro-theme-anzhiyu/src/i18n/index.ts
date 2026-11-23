/**
 * i18n — 对齐上游 Hexo `_p()` / `__` helper（hexo-i18n）的语义。
 *
 * 上游机制（`hexo/lib/plugins/filter/template_locals/i18n.ts` + `hexo-i18n`）：
 *  1. 主题 `languages/*.yml` 由 `hexo-i18n.set()` 递归摊平成点号键（`aside.more_button`）；
 *  2. 渲染时按语言优先级合并字典（页面 lang → 主题 config.language → `default`）；
 *  3. `__` 返回 `data[key] || key`，即**缺键时回退为键名本身**，再做 printf 插值；
 *  4. `_p` 是复数版：先试 `key.zero` / `key.one` / `key.other`，再试 `key`；
 *     上游 AnZhiYu 的 pug 全部用 `_p`（含无参普通键），因此这里同时提供 `t` 与 `tp`。
 *
 * 本移植与上游的差异（均已在 P2-6-11 报告中记录）：
 *  - 插值：上游 `sprintf-js` 在实参不足时输出 `undefined`/`NaN`；这里保留占位符原文，
 *    避免把「漏传参数」变成可见脏文案（实参传满时两者逐字节一致）。
 *  - 复数：上游在合并后的**扁平 map** 上找后缀，这里按「逐个候选键先查 lang 再查 default」，
 *    4 个语言文件都不含 plural 后缀键，故当前数据下行为一致。
 */

import {
  LOCALE_DICTIONARIES,
  LOCALE_NAMES,
  type LocaleDictionary,
  type LocaleName,
} from './locales.ts'

/** 构建期内置的语言（与 `src/i18n/locales/` 下的 YAML 一一对应）。 */
export const LANGUAGES = LOCALE_NAMES
export type Language = LocaleName

/** 摊平后的字典：点号键 → 字符串。 */
export type Dictionary = LocaleDictionary
/** 允许传入嵌套原始字典，`createI18n()` 会先摊平。 */
export type DictionaryInput = Record<string, unknown>
export type Dictionaries = Partial<Record<string, DictionaryInput>>

/**
 * 语言别名 → 规范 locale 名。
 * 上游用「语言文件名」直接匹配（`zh-CN`），这里额外接受大小写/下划线/hans-hant 变体，
 * 未知语言回退 `default`（上游由 `default` 语言兜底）。
 */
const LANGUAGE_ALIASES: Record<string, LocaleName> = {
  default: 'default',
  en: 'en',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  zh: 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-hant': 'zh-TW',
}

/** 递归摊平字典，语义同 `hexo-i18n` 的 `flattenObject()`（`a.b.c` 点号键）。 */
export function flattenDictionary(
  input: DictionaryInput,
  prefix = '',
  out: Dictionary = {},
): Dictionary {
  for (const key of Object.keys(input)) {
    const value = input[key]
    if (value !== null && typeof value === 'object') {
      flattenDictionary(value as DictionaryInput, `${prefix}${key}.`, out)
    } else if (value === null || value === undefined) {
      out[`${prefix}${key}`] = ''
    } else {
      out[`${prefix}${key}`] = String(value)
    }
  }
  return out
}

/**
 * 把语言名规范化为字典键：`zh_CN` → `zh-CN`、`EN` → `en`，未知 → `default`。
 * 注意：`default` 自身映射到 `default`，不是 `en`（字典兜底用）。
 */
export function normalizeLanguage(lang?: string | null): string {
  if (lang === null || lang === undefined) return 'default'
  const raw = String(lang).trim()
  if (!raw) return 'default'
  const alias = LANGUAGE_ALIASES[raw.toLowerCase().replace(/_/g, '-')]
  return alias ?? raw
}

const PLACEHOLDER = /%%|%(\d+)\$([sdfi])|%([sdfi])/g

function formatValue(value: unknown, specifier: string): string | null {
  if (value === undefined || value === null) return null
  switch (specifier) {
    case 's':
      return String(value)
    case 'd':
    case 'i': {
      const num = Number.parseInt(String(value), 10)
      return Number.isNaN(num) ? null : String(num)
    }
    case 'f': {
      const num = Number.parseFloat(String(value))
      return Number.isNaN(num) ? null : String(num)
    }
    default:
      return String(value)
  }
}

/**
 * printf 风格插值（`%s` / `%d` / `%i` / `%f` / `%1$s` / `%%`）。
 *
 * 与 `sprintf-js` 的 `vsprintf` 对齐：按实参顺序消费占位符，`%%` 输出一个 `%`。
 * 差异：实参不足时**保留占位符原文**（上游会打印 `undefined` / `NaN`）。
 */
export function interpolate(template: string, args: readonly unknown[] = []): string {
  if (!template) return template
  let cursor = 0
  return template.replace(PLACEHOLDER, (match, position: string | undefined, positionalSpec, sequentialSpec) => {
    if (match === '%%') return '%'
    const specifier = (positionalSpec ?? sequentialSpec) as string
    const index = position !== undefined ? Number.parseInt(position, 10) - 1 : cursor++
    const formatted = formatValue(args[index], specifier)
    return formatted === null ? match : formatted
  })
}

export interface I18n {
  /** 内置语言列表。 */
  readonly languages: readonly string[]
  /** 普通翻译：`t('aside.more_button', 'zh-CN')`。缺键回退 default，再回退键名。 */
  t(key: string, lang?: string | null, ...args: unknown[]): string
  /** 复数翻译（上游 `_p`）：`tp('cart.items', 'en', 3)`，支持 `.zero/.one/.other` 后缀。 */
  tp(key: string, lang?: string | null, ...args: unknown[]): string
  /** 键是否可解析（含 default 兜底）。 */
  has(key: string, lang?: string | null): boolean
  /** 取摊平后的合并字典（lang + default 兜底）。 */
  dictionary(lang?: string | null): Readonly<Dictionary>
  /** 规范化语言名（未知 → `default`）。 */
  resolveLanguage(lang?: string | null): string
}

/**
 * 用给定字典构造一个 i18n 实例。生产代码用文件末尾的默认单例；
 * 单测可用自定义字典验证复数/回退等分支。
 */
export function createI18n(input: Dictionaries = {}): I18n {
  const dictionaries: Record<string, Dictionary> = Object.create(null) as Record<string, Dictionary>
  for (const name of Object.keys(input)) {
    const value = input[name]
    if (value === undefined) continue
    dictionaries[name] = flattenDictionary(value)
  }

  const resolveLanguage = (lang?: string | null): string => {
    const normalized = normalizeLanguage(lang)
    if (dictionaries[normalized]) return normalized
    const alias = LANGUAGE_ALIASES[normalized.toLowerCase().replace(/_/g, '-')]
    if (alias && dictionaries[alias]) return alias
    return 'default'
  }

  const lookup = (lang: string, key: string): string | undefined => {
    const candidates = lang === 'default' ? ['default'] : [lang, 'default']
    for (const candidate of candidates) {
      const dict = dictionaries[candidate]
      if (!dict) continue
      const value = dict[key]
      if (value !== undefined) return value
    }
    return undefined
  }

  const t = (key: string, lang?: string | null, ...args: unknown[]): string => {
    if (!key) return ''
    const resolved = resolveLanguage(lang)
    return interpolate(lookup(resolved, key) ?? key, args)
  }

  const tp = (key: string, lang?: string | null, ...args: unknown[]): string => {
    if (!key) return ''
    const resolved = resolveLanguage(lang)
    const number = args.length ? Number(args[0]) : 0
    const candidates: string[] = []
    if (!number) candidates.push(`${key}.zero`)
    if (number === 1) candidates.push(`${key}.one`)
    candidates.push(`${key}.other`, key)
    for (const candidate of candidates) {
      const value = lookup(resolved, candidate)
      if (value !== undefined) return interpolate(value, args)
    }
    return interpolate(key, args)
  }

  const has = (key: string, lang?: string | null): boolean => {
    if (!key) return false
    return lookup(resolveLanguage(lang), key) !== undefined
  }

  const dictionary = (lang?: string | null): Readonly<Dictionary> => {
    const resolved = resolveLanguage(lang)
    const merged: Dictionary = { ...(dictionaries.default ?? {}) }
    if (resolved !== 'default') Object.assign(merged, dictionaries[resolved] ?? {})
    return merged
  }

  const languages = Object.keys(dictionaries)

  return { languages, t, tp, has, dictionary, resolveLanguage }
}

/** 默认实例：4 个内置语言字典（由 `scripts/check-i18n.mjs --write` 从 YAML 生成）。 */
export const i18n: I18n = createI18n(LOCALE_DICTIONARIES)

/** 普通翻译（对齐上游 `_p()` 对普通字符串键的用法）。 */
export const t = i18n.t
/** 复数翻译（对齐上游 `_p(path, count)`）。 */
export const tp = i18n.tp
/** 键存在性检查。 */
export const has = i18n.has
/** 合并字典（lang + default 兜底）。 */
export const dictionary = i18n.dictionary
