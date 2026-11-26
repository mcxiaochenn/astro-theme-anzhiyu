#!/usr/bin/env node
/**
 * check-loader.mjs — P1-8 配置加载层验收。
 *
 * 三条主用例（PLAN §P1-8 验收）：
 *   a) 上游 `_config.yml` 全量加载 → 零错误，且抽查 5 个键与上游一致；
 *   b) 只写部分键 → 默认值补全，抽查 5 个键等于 defaults；
 *   c) 某键类型写错 → 抛错，错误信息含完整键路径与期望类型。
 * P1-12 新增主用例：
 *   d) 未知顶层键（`some_new_key: 1`）→ 抛错，错误信息含该键名（strict 顶层）。
 * 附加用例：
 *   e) 旧文件名 `_config.anzhiyu.yml` 兼容（打 deprecation）且新文件名优先；
 *   f) 深合并语义：数组整体替换、对象递归合并；
 *   g) 未找到配置文件 → 返回完整默认配置；
 *   h) 显式路径不存在 → 报错；
 *   i) 返回值与 defaults 隔离。
 * D5 (M1) 新增：用例 a 内含 defaults ↔ 上游 `_config.yml` 直比断言（键序无关，
 *   defaults 值漂移 / 上游新增键 / defaults 多键直接红）。
 * E3 (L1) 新增：上游 `_config.yml` 缺失时明确报错并提示 THEME_UPSTREAM_CONFIG。
 *
 * 用法（在 仓库根目录下）：
 *   node scripts/check-loader.mjs
 *   或 THEME_UPSTREAM_CONFIG=<path> node scripts/check-loader.mjs
 *
 * 退出码：0 = 全部通过；1 = 有失败项。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const UPSTREAM_CONFIG = process.env.THEME_UPSTREAM_CONFIG
  ? path.resolve(process.env.THEME_UPSTREAM_CONFIG)
  : path.resolve(PKG_ROOT, '../_research/anzhiyu-upstream/_config.yml')

// E3：上游配置缺失时给明确报错（含 THEME_UPSTREAM_CONFIG 提示），不裸抛 ENOENT 栈
if (!existsSync(UPSTREAM_CONFIG)) {
  console.error(`[check-loader] 上游配置不存在: ${UPSTREAM_CONFIG}`)
  console.error(
    '[check-loader] 默认读 _research/anzhiyu-upstream/_config.yml；' +
      '上游副本在别处时用 THEME_UPSTREAM_CONFIG=<path> 指向真实 _config.yml。',
  )
  process.exit(1)
}

const { loadThemeConfig } = await import('../src/config/loader.ts')
const { defaults } = await import('../src/config/defaults.ts')

/**
 * 上游为 null 的 11 个顶层键（P1-12）：schema 保持 z.unknown()，不编造类型，
 * 但必须继续被接受。full config 加载 + 深比较已经覆盖，这里再显式抽查。
 */
const NULL_TOP_LEVEL_KEYS = [
  'menu',
  'social',
  'baidu_analytics',
  'google_analytics',
  'cnzz_analytics',
  'cloudflare_analytics',
  'microsoft_clarity',
  'index_site_info_top',
  'index_top_img_height',
  'category_ui',
  'tag_ui',
]

const log = (...args) => console.log('[check-loader]', ...args)
let passed = 0
let failed = 0

function check(label, ok, detail = '') {
  if (ok) {
    passed += 1
    log(`PASS ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`[check-loader] FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** 按点号路径取值，如 `nav.menu`。 */
function getPath(value, keyPath) {
  return keyPath.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), value)
}

const show = (value) => JSON.stringify(value)

/** 递归深比较（对象键顺序无关）。 */
function deepEqual(a, b) {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every(
      (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]),
    )
  }
  return false
}

/** 抽取抛错用例的原始 message；不抛错时返回 null。 */
function captureError(run) {
  try {
    run()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

const tmpRoot = mkdtempSync(path.join(tmpdir(), 'theme-loader-check-'))
const writeConfig = (relativePath, yamlText) => {
  const fullPath = path.join(tmpRoot, relativePath)
  mkdirSync(path.dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, yamlText, 'utf8')
  return fullPath
}

try {
  /* ------------------------------------------------------------------ */
  /* 用例 a：上游 _config.yml 全量加载                                    */
  /* ------------------------------------------------------------------ */
  log('=== 用例 a：上游 _config.yml 全量加载 ===')
  log(`配置源: ${UPSTREAM_CONFIG}`)
  const upstreamDoc = parse(readFileSync(UPSTREAM_CONFIG, 'utf8'))
  const upstreamTopLevelKeys = Object.keys(upstreamDoc).length
  log(`上游顶层 key 数: ${upstreamTopLevelKeys}`)

  const fullConfig = loadThemeConfig({ configPath: UPSTREAM_CONFIG })
  check('全量加载零错误', true)

  for (const keyPath of [
    'theme_color.main',
    'highlight_copy',
    'cover.position',
    'toc.post',
    'post_copyright.license',
  ]) {
    const actual = getPath(fullConfig, keyPath)
    const expected = getPath(upstreamDoc, keyPath)
    check(`抽查 ${keyPath}`, deepEqual(actual, expected), `实际 ${show(actual)} / 上游 ${show(expected)}`)
  }

  check(
    `全量深比较（${upstreamTopLevelKeys} 个顶层键）`,
    deepEqual(fullConfig, upstreamDoc),
    '合并结果与上游 YAML 完全一致',
  )

  // D5 (M1)：defaults ↔ 上游直比。上面的「合并结果 vs 上游」是恒真的用户值胜出合并——
  // defaults 值漂移、上游新增键都抓不到（假绿）。这里直接比 defaults 与上游 YAML：
  // 键序无关，值漂移 / 上游新增键 / defaults 多键都会红。
  check(
    `defaults 与上游 _config.yml 直比（${upstreamTopLevelKeys} 个顶层键）`,
    deepEqual(defaults, upstreamDoc),
    'defaults.ts 与上游 YAML 完全一致（值漂移 / 键漂移在此红）',
  )

  // P1-12：11 个上游 null 顶层键保持 z.unknown()，但必须继续被接受
  check(
    `11 个上游 null 顶层键仍被接受（${NULL_TOP_LEVEL_KEYS.length} 个）`,
    NULL_TOP_LEVEL_KEYS.every((key) => fullConfig[key] === null),
    NULL_TOP_LEVEL_KEYS.map((key) => `${key}=${show(fullConfig[key])}`).join(', '),
  )

  /* ------------------------------------------------------------------ */
  /* 用例 b：只写部分键 → 默认值补全                                      */
  /* ------------------------------------------------------------------ */
  log('=== 用例 b：只写部分键 → 默认值补全 ===')
  const partialConfigPath = writeConfig(
    'partial/anzhiyu.config.yml',
    ['nav:', '  enable: true', ''].join('\n'),
  )
  log(`部分配置: ${partialConfigPath}`)
  log('  内容: nav.enable = true')
  const partialConfig = loadThemeConfig({ configPath: partialConfigPath })
  check('用户写的键生效 nav.enable', partialConfig.nav.enable === true, `实际 ${show(partialConfig.nav.enable)}`)
  for (const keyPath of [
    'theme_color.main',
    'highlight_copy',
    'cover.position',
    'CDN.third_party_provider',
    'post_pagination',
  ]) {
    const actual = getPath(partialConfig, keyPath)
    const expected = getPath(defaults, keyPath)
    check(`默认值补全 ${keyPath}`, deepEqual(actual, expected), `实际 ${show(actual)} = defaults ${show(expected)}`)
  }

  /* ------------------------------------------------------------------ */
  /* 用例 c：类型写错 → 抛错且信息含完整键路径                            */
  /* ------------------------------------------------------------------ */
  log('=== 用例 c：类型写错 → 抛错且信息含完整键路径 ===')

  const badTopPath = writeConfig('bad/top.yml', 'highlight_copy: "yes"\n')
  const topError = captureError(() => loadThemeConfig({ configPath: badTopPath }))
  check('顶层 boolean 写成字符串 → 抛错', topError !== null)
  if (topError) {
    log('原始错误信息：')
    console.log(topError)
    check('错误信息含键路径 highlight_copy', topError.includes('highlight_copy'))
    check('错误信息含期望类型 boolean', /期望 boolean|expected boolean/i.test(topError))
  }

  const badNestedPath = writeConfig('bad/nested.yml', ['theme_color:', '  main: 123', ''].join('\n'))
  const nestedError = captureError(() => loadThemeConfig({ configPath: badNestedPath }))
  check('嵌套键写错类型 → 抛错', nestedError !== null)
  if (nestedError) {
    log('原始错误信息：')
    console.log(nestedError)
    check('错误信息含完整键路径 theme_color.main', nestedError.includes('theme_color.main'))
    check('错误信息含期望类型 string', /期望 string|expected string/i.test(nestedError))
  }

  // P1-12 展开过的区块：更深一层的子键类型也要真的生效
  const badExpandedPath = writeConfig(
    'bad/expanded.yml',
    ['post_meta:', '  page:', '    date_type: 123', ''].join('\n'),
  )
  const expandedError = captureError(() => loadThemeConfig({ configPath: badExpandedPath }))
  check('P1-12 展开区块的深层子键类型生效 → 抛错', expandedError !== null)
  if (expandedError) {
    log('原始错误信息：')
    console.log(expandedError)
    check(
      '错误信息含完整键路径 post_meta.page.date_type',
      expandedError.includes('post_meta.page.date_type'),
    )
    check('错误信息含期望类型 string', /期望 string|expected string/i.test(expandedError))
  }

  /* ------------------------------------------------------------------ */
  /* 用例 d：未知顶层键 → 抛错且信息含键名（P1-12 strict 顶层）           */
  /* ------------------------------------------------------------------ */
  log('=== 用例 d：未知顶层键 → 抛错且信息含键名 ===')
  const unknownKeyPath = writeConfig('unknown/anzhiyu.config.yml', 'some_new_key: 1\n')
  const unknownKeyError = captureError(() => loadThemeConfig({ configPath: unknownKeyPath }))
  check('未知顶层键 some_new_key → 抛错', unknownKeyError !== null)
  if (unknownKeyError) {
    log('原始错误信息：')
    console.log(unknownKeyError)
    check('错误信息含未知键名 some_new_key', unknownKeyError.includes('some_new_key'))
    check('错误信息标记为「未知顶层键」', unknownKeyError.includes('未知顶层键'))
    check('错误信息含 zod 错误码 unrecognized_keys', unknownKeyError.includes('unrecognized_keys'))
    check('不再静默透传（错误信息不含「加载成功」）', !unknownKeyError.includes('加载成功'))
  }

  // 同时拼错多个键：必须全部列出，方便用户一次改完
  const multiUnknownPath = writeConfig(
    'unknown/multi.yml',
    ['some_new_key: 1', 'another_typo_key: 2', 'highlight_copy: true', ''].join('\n'),
  )
  const multiUnknownError = captureError(() => loadThemeConfig({ configPath: multiUnknownPath }))
  check('同时拼错多个顶层键 → 抛错', multiUnknownError !== null)
  if (multiUnknownError) {
    check(
      '错误信息一次列出全部未知键',
      multiUnknownError.includes('some_new_key') && multiUnknownError.includes('another_typo_key'),
    )
    check('已知键 highlight_copy 不背锅（不在错误行）', !/highlight_copy（期望/.test(multiUnknownError))
  }

  /* ------------------------------------------------------------------ */
  /* 附加 e：旧文件名兼容 + 新文件名优先                                  */
  /* ------------------------------------------------------------------ */
  log('=== 附加 e：旧文件名兼容与优先级 ===')
  const legacyDir = path.join(tmpRoot, 'legacy')
  writeConfig('legacy/_config.anzhiyu.yml', 'highlight_copy: false\n')
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  let legacyConfig
  try {
    legacyConfig = loadThemeConfig({ cwd: legacyDir })
  } finally {
    console.warn = originalWarn
  }
  check('旧文件名 _config.anzhiyu.yml 可加载', legacyConfig.highlight_copy === false, `实际 ${show(legacyConfig.highlight_copy)}`)
  check(
    '旧文件名命中时打 deprecation 到 stderr',
    warnings.some((line) => line.includes('DEPRECATED')),
    warnings.join(' | ') || '未捕获到 deprecation',
  )

  const priorityDir = path.join(tmpRoot, 'priority')
  writeConfig('priority/anzhiyu.config.yml', 'highlight_copy: false\n')
  writeConfig('priority/_config.anzhiyu.yml', 'highlight_copy: true\n')
  const priorityWarnings = []
  console.warn = (...args) => priorityWarnings.push(args.join(' '))
  let priorityConfig
  try {
    priorityConfig = loadThemeConfig({ cwd: priorityDir })
  } finally {
    console.warn = originalWarn
  }
  check('新文件名优先于旧文件名', priorityConfig.highlight_copy === false, `实际 ${show(priorityConfig.highlight_copy)}`)
  check('走新文件名时不打 deprecation', priorityWarnings.length === 0, priorityWarnings.join(' | '))

  /* ------------------------------------------------------------------ */
  /* 附加 f：深合并语义（数组整体替换、对象递归合并）                      */
  /* ------------------------------------------------------------------ */
  log('=== 附加 f：深合并语义 ===')
  const mergePath = writeConfig(
    'merge/config.yml',
    [
      'site_verification:',
      '  - name: test-only',
      '    content: abc',
      'nav:',
      '  enable: true',
      'theme_color:',
      '  main: "#123456"',
      '',
    ].join('\n'),
  )
  const merged = loadThemeConfig({ configPath: mergePath })
  check(
    '数组整体替换（site_verification 不拼接）',
    Array.isArray(merged.site_verification) && merged.site_verification.length === 1,
    `实际 ${show(merged.site_verification)} / defaults 长度 ${defaults.site_verification.length}`,
  )
  check(
    '对象递归合并（theme_color.main 用用户值，其余保留默认）',
    merged.theme_color.main === '#123456' &&
      merged.theme_color.dark_main === defaults.theme_color.dark_main,
    `main=${show(merged.theme_color.main)}, dark_main=${show(merged.theme_color.dark_main)}`,
  )
  check(
    '嵌套对象合并（nav.enable 用户值 + nav.menu 默认值仍在）',
    merged.nav.enable === true && merged.nav.menu.length === defaults.nav.menu.length,
    `enable=${show(merged.nav.enable)}, menu.length=${merged.nav.menu.length}`,
  )

  /* ------------------------------------------------------------------ */
  /* 附加 g：未找到配置文件时返回完整默认配置                              */
  /* ------------------------------------------------------------------ */
  log('=== 附加 g：无配置文件 → 默认配置 ===')
  const emptyDir = path.join(tmpRoot, 'empty')
  const defaultConfig = loadThemeConfig({ cwd: emptyDir })
  check('无配置文件时返回 defaults', deepEqual(defaultConfig, defaults))

  /* ------------------------------------------------------------------ */
  /* 附加 h：显式路径不存在 → 报错（不静默回退默认值）                     */
  /* ------------------------------------------------------------------ */
  log('=== 附加 h：显式路径不存在 ===')
  const missingPath = path.join(tmpRoot, 'does-not-exist.yml')
  const missingError = captureError(() => loadThemeConfig({ configPath: missingPath }))
  check('显式 configPath 不存在 → 抛错', missingError !== null, missingError ?? '未抛错')
  if (missingError) check('错误信息含「配置文件不存在」', missingError.includes('配置文件不存在'))

  /* ------------------------------------------------------------------ */
  /* 附加 i：返回值为深拷贝，改它不污染 defaults / 下一次加载             */
  /* ------------------------------------------------------------------ */
  log('=== 附加 i：返回值与 defaults 隔离 ===')
  const firstLoad = loadThemeConfig({ cwd: emptyDir })
  firstLoad.theme_color.main = '#mutated'
  firstLoad.nav.menu.length = 0
  const secondLoad = loadThemeConfig({ cwd: emptyDir })
  check(
    '修改返回值后重新加载仍是默认值',
    secondLoad.theme_color.main === defaults.theme_color.main &&
      secondLoad.nav.menu.length === defaults.nav.menu.length,
    `theme_color.main=${show(secondLoad.theme_color.main)}, nav.menu.length=${secondLoad.nav.menu.length}`,
  )
} finally {
  rmSync(tmpRoot, { recursive: true, force: true })
}

log(`结果: ${failed === 0 ? 'PASS' : 'FAIL'}（通过 ${passed} 项，失败 ${failed} 项）`)
process.exit(failed === 0 ? 0 : 1)
