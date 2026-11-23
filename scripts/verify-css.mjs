#!/usr/bin/env node
/**
 * P1-10 CI：样式基准比对（PLAN §3.1 样式基准 / §P1-5 验收标准）
 *
 * 读 docs/baseline.json（P1-6 产出）里的 css 摘要，与构建产物
 * examples/blog/dist 中 index 页面实际引用的 CSS 比对。
 *
 * 判定规则：
 * - 字节数：相对误差 ≤ ±5%（PLAN §P1-5「字节数与上游 index.css 差异 ≤5%」）
 * - gzip 体积：相对误差 ≤ ±5%（baseline 与本脚本的 zlib 版本/压缩等级可能不同，
 *   实测这种差异远小于 5%，用同一阈值吸收）
 * - SHA-256：只记录、不判失败。迁移期的 CSS 不会与上游逐字节一致，
 *   硬失败会让 ≤5% 的验收标准永远过不了；字节级收敛后再改成硬失败。
 * - baseline.json 不存在：打印「baseline 未就绪，跳过比对」并以 0 退出。
 *   baseline 由 P1-6 并行产出，CI 不能因为它还没进仓库而红。
 *
 * 本地调试用的路径覆盖（CI 不设置）：
 *   BASELINE_PATH=... DIST_DIR=...
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = process.env.BASELINE_PATH
  ? path.resolve(process.env.BASELINE_PATH)
  : path.join(REPO_ROOT, 'docs', 'baseline.json')
const DIST_DIR = process.env.DIST_DIR
  ? path.resolve(process.env.DIST_DIR)
  : path.join(REPO_ROOT, 'examples', 'blog', 'dist')

const BYTE_TOLERANCE = 0.05
const GZIP_TOLERANCE = 0.05

const log = (...args) => console.log('[verify-css]', ...args)
const fail = (message) => {
  console.error('[verify-css] FAIL', message)
  process.exit(1)
}

// —— 1. baseline 缺失：跳过，不算失败 ——
if (!existsSync(BASELINE_PATH)) {
  log('baseline 未就绪，跳过比对')
  process.exit(0)
}

// —— 2. 读 baseline 摘要并校验字段 ——
let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
} catch (error) {
  fail(`读取 baseline 失败（${BASELINE_PATH}）：${error.message}`)
}

const css = baseline?.css
const expected = {
  bytes: css?.indexCssBytes,
  gzip: css?.indexCssGzipBytes,
  sha: css?.indexCssSha256,
}
if (!Number.isFinite(expected.bytes) || expected.bytes <= 0) {
  fail('baseline.css.indexCssBytes 缺失或非法')
}
if (!Number.isFinite(expected.gzip) || expected.gzip <= 0) {
  fail('baseline.css.indexCssGzipBytes 缺失或非法')
}
if (typeof expected.sha !== 'string' || !/^[0-9a-f]{64}$/i.test(expected.sha)) {
  fail('baseline.css.indexCssSha256 缺失或非法')
}

const baselineCommit = baseline?.baseline?.commit
log(
  `baseline: ${path.relative(REPO_ROOT, BASELINE_PATH)}` +
    (baselineCommit ? `（commit ${baselineCommit}）` : '')
)

// —— 3. 找 index 页面实际引用的 CSS ——
const indexPath = path.join(DIST_DIR, 'index.html')
if (!existsSync(indexPath)) {
  fail(`构建产物缺少 ${path.relative(REPO_ROOT, indexPath)}，先跑 pnpm --filter blog build`)
}
const html = readFileSync(indexPath, 'utf8')

const stylesheetHrefs = []
for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
  if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b/i.test(tag)) continue
  const href = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]
  if (href) stylesheetHrefs.push(href)
}
if (stylesheetHrefs.length === 0) {
  fail('index.html 没有引用外部样式表：P1-5 要求构建产出独立 CSS 文件')
}

const cssFiles = []
for (const href of stylesheetHrefs) {
  if (/^(?:[a-z]+:)?\/\//i.test(href)) {
    fail(`index.html 引用了外部样式表 ${href}，无法与本地构建产物比对`)
  }
  const clean = href.split(/[?#]/)[0].replace(/^\/+/, '')
  if (!clean) {
    fail(`样式表 href 无法解析为文件路径：${href}`)
  }
  const file = path.resolve(DIST_DIR, clean)
  if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) {
    fail(`样式表路径越界：${href}`)
  }
  if (!existsSync(file)) {
    fail(`index.html 引用的样式表不存在：${path.relative(REPO_ROOT, file)}`)
  }
  cssFiles.push(file)
}

if (cssFiles.length > 1) {
  log(`index.html 引用 ${cssFiles.length} 个样式表，按文档顺序拼接后比对：`)
  for (const file of cssFiles) log(`  - ${path.relative(REPO_ROOT, file)}`)
} else {
  log(`CSS 源: ${path.relative(REPO_ROOT, cssFiles[0])}`)
}

// —— 4. 计算实际值并比对 ——
const cssBuffer = Buffer.concat(cssFiles.map((file) => readFileSync(file)))
const actual = {
  bytes: cssBuffer.length,
  gzip: gzipSync(cssBuffer, { level: 9 }).length,
  sha: createHash('sha256').update(cssBuffer).digest('hex'),
}

let failed = false
const compare = (label, actualValue, expectedValue, tolerance) => {
  const delta = (actualValue - expectedValue) / expectedValue
  const pct = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(2)}%`
  const line = `${label}: 实际 ${actualValue} / baseline ${expectedValue}（${pct}，阈值 ±${(tolerance * 100).toFixed(0)}%）`
  if (Math.abs(delta) <= tolerance) {
    log(`PASS ${line}`)
  } else {
    console.error(`[verify-css] FAIL ${line}`)
    failed = true
  }
}
compare('字节数', actual.bytes, expected.bytes, BYTE_TOLERANCE)
compare('gzip 体积', actual.gzip, expected.gzip, GZIP_TOLERANCE)

if (actual.sha === expected.sha.toLowerCase()) {
  log('PASS SHA256 一致')
} else {
  log(`WARN SHA256 不一致（记录，不判失败）：实际 ${actual.sha} / baseline ${expected.sha.toLowerCase()}`)
}

if (failed) {
  console.error('[verify-css] 比对失败')
  process.exit(1)
}
log('比对通过')
