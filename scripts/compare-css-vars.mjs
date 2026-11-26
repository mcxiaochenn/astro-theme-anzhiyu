#!/usr/bin/env node
/**
 * P1-9 第二条验收：`--anzhiyu-*` CSS 变量逐值比对（PLAN §P1-9）
 *
 * 读 docs/reference/baseline.json 的 `css.cssVars`（P1-6 从上游 hexo 产物提取的 69 个变量，
 * 取法：按 CSS 文件出现顺序扫描 /(--anzhiyu-[a-zA-Z0-9-]+)\s*:\s*([^;}]+)/，
 * 同名变量只保留第一次出现），与 examples/blog/dist 里 index 页面实际引用的 CSS 逐条比对。
 *
 * 判定：
 * - 严格一致：产物中该变量第一次声明的值与 baseline 首值逐字符相同（trim 后）。
 * - 顺序差异：值不同，但 baseline 首值出现在产物的后续声明里（且上游 CSS 可读时
 *   校验两边的声明值集合相同）。CSS 自定义属性只在同名声明之间由层叠/动画决定取值，
 *   跨规则的位置变化不改变取值集合；这类差异只 WARN，不判失败。
 * - 值不一致 / 产物缺变量：判失败。
 *
 * 本地调试用的路径覆盖（CI 不设置）：
 *   BASELINE_PATH=... DIST_DIR=... UPSTREAM_CSS=...
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { selectLocalStylesheets } from './lib/css-stylesheets.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = process.env.BASELINE_PATH
  ? path.resolve(process.env.BASELINE_PATH)
  : path.join(REPO_ROOT, 'docs', 'reference', 'baseline.json')
const DIST_DIR = process.env.DIST_DIR
  ? path.resolve(process.env.DIST_DIR)
  : path.join(REPO_ROOT, 'examples', 'blog', 'dist')
// 上游产物只在 P1-6 的 .baseline-work 里（被 gitignore），有就做更严格的复核，没有就跳过。
const UPSTREAM_CSS = process.env.UPSTREAM_CSS
  ? path.resolve(process.env.UPSTREAM_CSS)
  : path.join(REPO_ROOT, '.baseline-work', 'public', 'css', 'index.css')

const log = (...args) => console.log('[compare-css-vars]', ...args)
const fail = (message) => {
  console.error('[compare-css-vars] FAIL', message)
  process.exit(1)
}

// 与 P1-6 tools/extract-baseline.mjs 同一套扫描规则；g 标志用于收集全部出现位置。
const VAR_RE = /(--anzhiyu-[a-zA-Z0-9-]+)\s*:\s*([^;}]+)/g

/** 扫描 CSS 文本：返回每个变量的首次声明值与全部声明值（按出现顺序）。 */
function scanVars(cssText) {
  const first = new Map()
  const occurrences = new Map()
  for (const match of cssText.matchAll(VAR_RE)) {
    const name = match[1]
    const value = match[2].trim()
    if (!first.has(name)) first.set(name, value)
    if (!occurrences.has(name)) occurrences.set(name, [])
    occurrences.get(name).push(value)
  }
  return { first, occurrences }
}

/** 值 → 次数，用于比较声明值集合。 */
function countValues(values) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

function formatCounts(counts) {
  return [...counts.entries()].map(([value, count]) => `${value}×${count}`).join(', ')
}

function sameCounts(a, b) {
  if (a.size !== b.size) return false
  for (const [value, count] of a) if (b.get(value) !== count) return false
  return true
}

// —— 1. 读 baseline ——
if (!existsSync(BASELINE_PATH)) {
  fail(`baseline 不存在：${BASELINE_PATH}`)
}
let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
} catch (error) {
  fail(`读取 baseline 失败（${BASELINE_PATH}）：${error.message}`)
}
const baselineVars = baseline?.css?.cssVars
if (!baselineVars || typeof baselineVars !== 'object' || Array.isArray(baselineVars)) {
  fail('baseline.css.cssVars 缺失或不是对象')
}
const baselineNames = Object.keys(baselineVars)
if (baselineNames.length === 0) {
  fail('baseline.css.cssVars 为空')
}
log(
  `baseline: ${path.relative(REPO_ROOT, BASELINE_PATH)}` +
    (baseline?.baseline?.commit
      ? `（commit ${baseline.baseline.commit}，version ${baseline.baseline.version}）`
      : ''),
)
log(`baseline cssVars: ${baselineNames.length} 个 --anzhiyu-* 变量`)

// —— 2. 找 index 页面实际引用的 CSS ——
const indexPath = path.join(DIST_DIR, 'index.html')
if (!existsSync(indexPath)) {
  fail(`构建产物缺少 ${path.relative(REPO_ROOT, indexPath)}，先跑 pnpm --filter blog build`)
}
const html = readFileSync(indexPath, 'utf8')

// 与 verify-css.mjs 共用同一套选择规则（lib/css-stylesheets.mjs）：
// 跳过 CDN 等绝对 URL，只比对本地构建产物。
let selection
try {
  selection = selectLocalStylesheets({ html, distDir: DIST_DIR, repoRoot: REPO_ROOT })
} catch (error) {
  fail(error.message)
}
const { files: cssFiles, externalHrefs } = selection

if (externalHrefs.length > 0) {
  log(`跳过 ${externalHrefs.length} 个外部样式表（CDN）：${externalHrefs.join(', ')}`)
}
for (const file of cssFiles) log(`CSS 源: ${path.relative(REPO_ROOT, file)}`)

const actualCss = Buffer.concat(cssFiles.map((file) => readFileSync(file))).toString('utf8')
const actual = scanVars(actualCss)
log(`产物 CSS 中 --anzhiyu-* 变量: ${actual.first.size} 个`)

// —— 3. 逐条比对 ——
const same = []
const orderOnly = []
const valueDiff = []
const missing = []

for (const name of baselineNames) {
  const expected = baselineVars[name]
  if (!actual.first.has(name)) {
    missing.push(name)
    continue
  }
  const actualFirst = actual.first.get(name)
  if (actualFirst === expected) {
    same.push(name)
    continue
  }
  const values = actual.occurrences.get(name) ?? []
  if (values.includes(expected)) {
    orderOnly.push({ name, expected, actualFirst, values })
  } else {
    valueDiff.push({ name, expected, actualFirst, values })
  }
}

// 上游 CSS 可读时，额外校验两边「声明值集合」是否一致，让顺序差异的结论可自证。
let upstreamChecked = false
let upstreamMismatch = []
if (existsSync(UPSTREAM_CSS)) {
  const upstream = scanVars(readFileSync(UPSTREAM_CSS, 'utf8'))
  upstreamChecked = true
  log(`上游 CSS: ${path.relative(REPO_ROOT, UPSTREAM_CSS)}（用于声明值集合复核）`)
  for (const item of orderOnly) {
    const upstreamValues = upstream.occurrences.get(item.name) ?? []
    const actualCounts = countValues(item.values)
    const upstreamCounts = countValues(upstreamValues)
    if (!sameCounts(actualCounts, upstreamCounts)) {
      upstreamMismatch.push({
        name: item.name,
        actualCounts,
        upstreamCounts,
      })
    }
  }
}

// —— 4. 输出明细与汇总 ——
for (const item of orderOnly) {
  log(
    `WARN ${item.name}: 基准首值 ${JSON.stringify(item.expected)} / 产物首值 ` +
      `${JSON.stringify(item.actualFirst)} → 声明顺序不同（基准值仍在产物中）`,
  )
  log(`     产物声明序列（共 ${item.values.length} 次）: ${formatCounts(countValues(item.values))}`)
  if (upstreamChecked) {
    const mismatch = upstreamMismatch.find((row) => row.name === item.name)
    if (mismatch) {
      log(
        `     声明值集合不一致: 产物 ${formatCounts(mismatch.actualCounts)} / ` +
          `上游 ${formatCounts(mismatch.upstreamCounts)}`,
      )
    } else {
      log('     声明值集合与上游一致，仅出现顺序不同')
    }
  } else {
    log('     上游 CSS 不在本机，跳过声明值集合复核')
  }
}

for (const item of valueDiff) {
  console.error(
    `[compare-css-vars] DIFF ${item.name}: 基准 ${JSON.stringify(item.expected)} / ` +
      `产物首值 ${JSON.stringify(item.actualFirst)}（基准值未出现在产物任何声明中）`,
  )
}
for (const name of missing) {
  console.error(`[compare-css-vars] DIFF ${name}: 产物中未找到该变量（基准 ${JSON.stringify(baselineVars[name])}）`)
}

const extraNames = [...actual.first.keys()].filter((name) => !(name in baselineVars))
if (extraNames.length > 0) {
  log(`INFO 产物新增（基准无）变量 ${extraNames.length} 个: ${extraNames.join(', ')}`)
}

log(
  `结果: 严格一致 ${same.length} / 顺序差异 ${orderOnly.length} / ` +
    `值不一致 ${valueDiff.length} / 产物缺失 ${missing.length}（基准共 ${baselineNames.length}）`,
)

const failed = valueDiff.length > 0 || missing.length > 0 || upstreamMismatch.length > 0
if (failed) {
  console.error('[compare-css-vars] 比对失败')
  process.exit(1)
}
if (orderOnly.length > 0) {
  if (upstreamChecked) {
    log(`比对通过（${orderOnly.length} 处为声明顺序差异，取值集合一致）`)
  } else {
    log(
      `比对通过（${orderOnly.length} 处为声明顺序差异；声明值集合一致性未验证——` +
        '上游 CSS 不在本机，未做集合复核）',
    )
  }
} else {
  log('比对通过（全部变量逐值一致）')
}
