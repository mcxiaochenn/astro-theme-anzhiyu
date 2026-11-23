#!/usr/bin/env node
/**
 * check-i18n.mjs — P2-11 i18n 验收。
 *
 * 覆盖 PLAN §P2-11 验收（「4 个字典 + t()，对齐上游 _p()；切换语言后文案正确，缺键回退 default」）：
 *   1. locales.ts 与 src/i18n/locales/*.yml 同步（YAML 是唯一事实源，TS 是生成快照）；
 *   2. 4 个语言的键数量与键集合差异（列出彼此缺的键）；
 *   3. 抽查 10 个键的翻译逐字正确；
 *   4. 缺键回退 default / 未知键回退键名 / 未知语言回退 default / 语言别名；
 *   5. 插值（%s/%d/%%/%1$s）与上游 `_p()` 复数行为（.zero/.one/.other）。
 *
 * 用法（在 packages/astro-theme-anzhiyu 目录下）：
 *   node scripts/check-i18n.mjs           # 校验
 *   node scripts/check-i18n.mjs --write   # 从 YAML 重新生成 src/i18n/locales.ts 后再校验
 *
 * 退出码：0 = 全部通过；1 = 有失败项。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const LOCALES_DIR = path.join(PKG_ROOT, 'src/i18n/locales')
const LOCALES_TS = path.join(PKG_ROOT, 'src/i18n/locales.ts')
const WRITE = process.argv.includes('--write')

/** 规范顺序（与 src/i18n/index.ts 的 LANGUAGES 一致）。 */
const LANGUAGES = ['default', 'en', 'zh-CN', 'zh-TW']

const log = (...args) => console.log('[check-i18n]', ...args)
let passed = 0
let failed = 0

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1
    log(`PASS ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`[check-i18n] FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const show = (value) => JSON.stringify(value)

/** 与 hexo-i18n `flattenObject()` 等价：嵌套字典点号摊平。 */
function flatten(input, prefix = '', out = {}) {
  for (const key of Object.keys(input)) {
    const value = input[key]
    if (value !== null && typeof value === 'object') flatten(value, `${prefix}${key}.`, out)
    else if (value === null || value === undefined) out[`${prefix}${key}`] = ''
    else out[`${prefix}${key}`] = String(value)
  }
  return out
}

/** 读取 4 个 YAML 并按规范顺序摊平。 */
function readYamlDictionaries() {
  const dictionaries = {}
  for (const language of LANGUAGES) {
    const file = path.join(LOCALES_DIR, `${language}.yml`)
    const doc = parse(readFileSync(file, 'utf8'))
    const flat = flatten(doc)
    const sorted = {}
    for (const key of Object.keys(flat).sort()) sorted[key] = flat[key]
    dictionaries[language] = sorted
  }
  return dictionaries
}

/** 生成 `src/i18n/locales.ts` 内容（确定性，键已排序）。 */
function renderLocalesModule(dictionaries) {
  const json = JSON.stringify(dictionaries, null, 2)
  return [
    '// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.',
    '// Source: src/i18n/locales/{default,en,zh-CN,zh-TW}.yml',
    '//   （上游 _research/anzhiyu-upstream/languages/*.yml 的逐字节拷贝）',
    '// Regenerate: node scripts/check-i18n.mjs --write',
    '',
    '/** 摊平后的字典：点号键 → 字符串。 */',
    'export type LocaleDictionary = Record<string, string>',
    '',
    "export const LOCALE_NAMES = ['default', 'en', 'zh-CN', 'zh-TW'] as const",
    'export type LocaleName = (typeof LOCALE_NAMES)[number]',
    '',
    '/** 4 个内置语言字典（键已排序，内容来自上游 languages/*.yml）。 */',
    'export const LOCALE_DICTIONARIES: Record<LocaleName, LocaleDictionary> =',
    `${json.replace(/^/gm, '  ').trimStart()}`,
    '',
  ].join('\n')
}

/* -------------------------------------------------------------------- */
/* 0. 生成 / 同步 locales.ts                                             */
/* -------------------------------------------------------------------- */
const yamlDictionaries = readYamlDictionaries()
const expectedModule = renderLocalesModule(yamlDictionaries)

if (WRITE) {
  writeFileSync(LOCALES_TS, expectedModule, 'utf8')
  log(`已生成 ${path.relative(PKG_ROOT, LOCALES_TS)}`)
}

const actualModule = readFileSync(LOCALES_TS, 'utf8')
check(
  'locales.ts 与 locales/*.yml 同步（YAML 为唯一事实源）',
  actualModule === expectedModule,
  actualModule === expectedModule ? '逐字节一致' : '不一致，请运行 node scripts/check-i18n.mjs --write',
)

const { t, tp, has, i18n, createI18n, interpolate, normalizeLanguage } = await import(
  '../src/i18n/index.ts'
)

/* -------------------------------------------------------------------- */
/* 1. 键数量与键集合差异                                                  */
/* -------------------------------------------------------------------- */
log('=== 1. 4 个语言字典的键数量与键集合差异 ===')
const allKeys = new Set()
for (const language of LANGUAGES) for (const key of Object.keys(yamlDictionaries[language])) allKeys.add(key)
log(`键集合并集: ${allKeys.size} 个键`)

const expectedCounts = { default: 91, en: 165, 'zh-CN': 165, 'zh-TW': 165 }
for (const language of LANGUAGES) {
  const count = Object.keys(yamlDictionaries[language]).length
  check(`${language} 键数量 = ${expectedCounts[language]}`, count === expectedCounts[language], `实际 ${count}`)
}

check('键集合并集 = 166（default 91 + 三语独有 75）', allKeys.size === 166, `实际 ${allKeys.size}`)

/**
 * 相对并集缺失数（数据事实，不构成失败）：default 只有 91 键，缺 75 个新功能键；
 * en / zh-CN / zh-TW 各缺 default 独有的 scalar 键 `post.edit`（它们把它拆成了 post.edit.github / .yuque）。
 */
const EXPECTED_UNION_MISSING = { default: 75, en: 1, 'zh-CN': 1, 'zh-TW': 1 }
for (const language of LANGUAGES) {
  const keys = new Set(Object.keys(yamlDictionaries[language]))
  const missing = [...allKeys].filter((key) => !keys.has(key)).sort()
  check(
    `${language} 相对并集缺失 ${EXPECTED_UNION_MISSING[language]} 个`,
    missing.length === EXPECTED_UNION_MISSING[language],
    `实际 ${missing.length}`,
  )
  if (!missing.length) continue
  if (missing.length <= 3) {
    log(`  ${language} 相对并集缺失: ${missing.join(', ')}`)
  } else {
    const grouped = new Map()
    for (const key of missing) {
      const group = key.split('.')[0]
      grouped.set(group, [...(grouped.get(group) ?? []), key])
    }
    log(`  ${language} 相对并集缺失的键（按首段分组）:`)
    for (const [group, groupKeys] of grouped) log(`    ${group} (${groupKeys.length}): ${groupKeys.join(', ')}`)
  }
}

log('--- 相对于 default 的差异（彼此缺的键）---')
const defaultKeys = new Set(Object.keys(yamlDictionaries.default))
for (const language of ['en', 'zh-CN', 'zh-TW']) {
  const keys = new Set(Object.keys(yamlDictionaries[language]))
  const onlyInLanguage = [...keys].filter((key) => !defaultKeys.has(key)).sort()
  const onlyInDefault = [...defaultKeys].filter((key) => !keys.has(key)).sort()
  log(
    `${language} vs default: 该语言独有 ${onlyInLanguage.length} 个，仅 default 有 ${onlyInDefault.length} 个`,
  )
  if (onlyInDefault.length) log(`  仅 default 有: ${onlyInDefault.join(', ')}`)
  if (onlyInLanguage.length) {
    log(`  该语言独有分组: ${[...new Set(onlyInLanguage.map((key) => key.split('.')[0]))].join(', ')}`)
    log(`  该语言独有键明细: ${onlyInLanguage.join(', ')}`)
  }
}
const nonDefaultSets = ['en', 'zh-CN', 'zh-TW'].map((language) => new Set(Object.keys(yamlDictionaries[language])))
const nonDefaultUnion = new Set()
for (const set of nonDefaultSets) for (const key of set) nonDefaultUnion.add(key)
const crossMissing = [...nonDefaultUnion].filter((key) => nonDefaultSets.some((set) => !set.has(key)))
check('en / zh-CN / zh-TW 三语键集完全一致', crossMissing.length === 0, crossMissing.length ? crossMissing.join(', ') : '165 键逐键一致')

/* -------------------------------------------------------------------- */
/* 2. 抽查 10 个键的翻译                                                  */
/* -------------------------------------------------------------------- */
log('=== 2. 抽查 10 个键逐字翻译 ===')
const SPOT_CHECKS = [
  ['aside.card_archives', { default: '归档', en: 'Archives', 'zh-CN': '归档', 'zh-TW': '歸檔' }],
  ['aside.more_button', { default: '查看更多', en: 'More', 'zh-CN': '查看更多', 'zh-TW': '檢視更多' }],
  ['page.archives', { default: '归档', en: 'Archives', 'zh-CN': '归档', 'zh-TW': '歸檔' }],
  ['post.recommend', {
    default: '喜欢这篇文章的人也看了',
    en: 'Related Articles',
    'zh-CN': '喜欢这篇文章的人也看了',
    'zh-TW': '相關推薦',
  }],
  ['no_title', { default: '无题', en: 'No title', 'zh-CN': '无题', 'zh-TW': '無題' }],
  ['footer.theme', { default: '主题', en: 'Theme', 'zh-CN': '主题', 'zh-TW': '主題' }],
  ['pagination.prev', { default: '上一篇', en: 'Previous Post', 'zh-CN': '上一篇', 'zh-TW': '上一篇' }],
  ['error404', { default: '页面没有找到', en: 'Page not found', 'zh-CN': '页面没有找到', 'zh-TW': '頁面沒有找到' }],
  ['rightside.translate_title', {
    default: '简繁转换',
    en: 'Switch Between Traditional Chinese And Simplified Chinese',
    'zh-CN': '简繁转换',
    'zh-TW': '簡繁轉換',
  }],
  ['search.local_search.input_placeholder', {
    default: '搜索文章',
    en: 'Search for Posts',
    'zh-CN': '搜索文章',
    'zh-TW': '搜尋文章',
  }],
]
check('抽查键数量 = 10', SPOT_CHECKS.length === 10, `实际 ${SPOT_CHECKS.length}`)
for (const [key, expected] of SPOT_CHECKS) {
  for (const language of LANGUAGES) {
    const actual = t(key, language)
    check(`${language} t('${key}')`, actual === expected[language], `实际 ${show(actual)} / 期望 ${show(expected[language])}`)
  }
}

/* -------------------------------------------------------------------- */
/* 3. 缺键回退                                                           */
/* -------------------------------------------------------------------- */
log('=== 3. 缺键回退 / 未知语言 / 别名 ===')
// 真实数据里的回退样本：default 有 `post.edit`（标量），另 3 语言把它换成了 post.edit.github / post.edit.yuque 对象
check("真实回退: en 缺 'post.edit' → 回退 default('编辑')", t('post.edit', 'en') === '编辑', show(t('post.edit', 'en')))
check("真实回退: zh-TW 缺 'post.edit' → 回退 default('编辑')", t('post.edit', 'zh-TW') === '编辑', show(t('post.edit', 'zh-TW')))
check('嵌套键命中: post.edit.github', t('post.edit.github', 'en') === 'Edited on GitHub', show(t('post.edit.github', 'en')))
check("未知键 → 回退键名本身（上游 __ 语义）", t('not.a.real.key', 'en') === 'not.a.real.key', show(t('not.a.real.key', 'en')))
check('空键 → 空串（上游 `_p`/`__` 语义）', t('', 'en') === '', show(t('', 'en')))
check("未知语言 'ja' → 回退 default", t('aside.more_button', 'ja') === '查看更多', show(t('aside.more_button', 'ja')))
check("未知语言 'default' → default 字典", t('aside.card_archives', 'default') === '归档', show(t('aside.card_archives', 'default')))
check("别名 zh_cn → zh-CN", normalizeLanguage('zh_cn') === 'zh-CN' && t('page.tag', 'zh_cn') === '标签', show(t('page.tag', 'zh_cn')))
check('别名 ZH-TW → zh-TW', t('page.tag', 'ZH-TW') === '標籤', show(t('page.tag', 'ZH-TW')))
check('has() 命中', has('aside.more_button', 'zh-CN') === true)
check('has() 未命中', has('not.a.real.key', 'zh-CN') === false)
check('resolveLanguage 未知 → default', i18n.resolveLanguage('xx') === 'default', i18n.resolveLanguage('xx'))

// 合成字典验证 createI18n 的回退链
const custom = createI18n({
  default: { a: { b: '兜底值' }, onlyDefault: '仅默认' },
  en: { a: { b: 'default value' }, enOnly: 'EN only' },
  'zh-CN': {},
})
check('自定义字典：en 命中', custom.t('a.b', 'en') === 'default value', show(custom.t('a.b', 'en')))
check('自定义字典：zh-CN 缺键回退 default', custom.t('a.b', 'zh-CN') === '兜底值', show(custom.t('a.b', 'zh-CN')))
check('自定义字典：未知语言回退 default', custom.t('onlyDefault', 'sv') === '仅默认', show(custom.t('onlyDefault', 'sv')))
check('自定义字典：嵌套原始字典被摊平', custom.t('onlyDefault', 'en') === '仅默认', show(custom.t('onlyDefault', 'en')))
check('自定义字典：dict 合并 lang 覆盖 default', Object.keys(custom.dictionary('en')).length === 3, show(Object.keys(custom.dictionary('en'))))

/* -------------------------------------------------------------------- */
/* 4. 插值                                                               */
/* -------------------------------------------------------------------- */
log('=== 4. 插值（printf 风格）===')
check("interpolate('%s-%s', ['a','b'])", interpolate('%s-%s', ['a', 'b']) === 'a-b', show(interpolate('%s-%s', ['a', 'b'])))
check("interpolate('%%')", interpolate('%%') === '%', show(interpolate('%%')))
check("interpolate('%d/%i/%f', [3,'4','1.5'])", interpolate('%d/%i/%f', [3, '4', '1.5']) === '3/4/1.5', show(interpolate('%d/%i/%f', [3, '4', '1.5'])))
check('interpolate 位置参数 %2$s %1$s', interpolate('%2$s %1$s', ['A', 'B']) === 'B A', show(interpolate('%2$s %1$s', ['A', 'B'])))
check('实参不足保留占位符（与上游 undefined 输出不同，见报告）', interpolate('%s-%s', ['a']) === 'a-%s', show(interpolate('%s-%s', ['a'])))
check(
  "t('about.total_people','zh-CN','<b>3</b>')",
  t('about.total_people', 'zh-CN', '<b>3</b>') === '共 <b>3</b> 人',
  show(t('about.total_people', 'zh-CN', '<b>3</b>')),
)
check(
  "t('about.learn_more_at','zh-CN',A,B)",
  t('about.learn_more_at', 'zh-CN', 'A', 'B') === '在 A 了解更多关于 B',
  show(t('about.learn_more_at', 'zh-CN', 'A', 'B')),
)
check(
  "t('post.copyright.copyright_content','en',url,license)",
  t('post.copyright.copyright_content', 'en', 'https://example.com/mit', 'MIT') ===
    'All articles in this blog are licensed under <a href="https://example.com/mit">MIT</a> unless stating additionally.',
  show(t('post.copyright.copyright_content', 'en', 'https://example.com/mit', 'MIT')),
)
check(
  "t('post.copyright.copyright_content','zh-CN',...) 4 个 %s",
  t('post.copyright.copyright_content', 'zh-CN', 'U', 'L', 'H', 'T') ===
    '本博客所有文章除特别声明外，均采用 <a href="U" target="_blank">L</a> 许可协议。转载请注明来自 <a href="H" target="_blank">T</a>！',
  show(t('post.copyright.copyright_content', 'zh-CN', 'U', 'L', 'H', 'T')),
)

/* -------------------------------------------------------------------- */
/* 5. 复数（上游 `_p` 的 .zero/.one/.other）                              */
/* -------------------------------------------------------------------- */
log('=== 5. 复数与上游 `_p()` 用法 ===')
check("普通键经 tp(): tp('aside.more_button','zh-CN')", tp('aside.more_button', 'zh-CN') === '查看更多', show(tp('aside.more_button', 'zh-CN')))
const plural = createI18n({
  default: {},
  en: { cart: { zero: 'no items', one: 'one item', other: '%d items' } },
})
check('tp zero', plural.tp('cart', 'en', 0) === 'no items', show(plural.tp('cart', 'en', 0)))
check('tp one', plural.tp('cart', 'en', 1) === 'one item', show(plural.tp('cart', 'en', 1)))
check('tp other 带 %d 插值', plural.tp('cart', 'en', 3) === '3 items', show(plural.tp('cart', 'en', 3)))
check('tp 缺复数键 → 回退键名', plural.tp('missing', 'en') === 'missing', show(plural.tp('missing', 'en')))

/* -------------------------------------------------------------------- */
/* 结果                                                                  */
/* -------------------------------------------------------------------- */
log(`结果: ${failed === 0 ? 'PASS' : 'FAIL'}（通过 ${passed} 项，失败 ${failed} 项）`)
process.exit(failed === 0 ? 0 : 1)
