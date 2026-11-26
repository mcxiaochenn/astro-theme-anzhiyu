#!/usr/bin/env node
/**
 * 生成 HTML baseline 归档：tests/baseline-html/baseline-html.tar.gz
 *
 * 为什么要有这个文件：`.baseline-work/` 被 gitignore（产物 4.4 MB），CI 上
 * 没有参考 HTML，`scripts/diff-html.mjs --all` 只能 skip。只把 48 个 HTML
 * 打进 tar.gz 约 20+ KB，直接进仓库即可，不需要 Release / CI cache。
 *
 * 归档内容约定（写死，`scripts/extract-baseline-html.mjs` 与它配套）：
 *   1. 只收 `.html`，不收图片 / CSS / JS —— diff 只解析 HTML；
 *   2. 归档内路径 = 相对 `.baseline-work/public` 的路径，POSIX `/` 分隔；
 *   3. 解压根目录就是 baseline HTML 根目录（传给 diff-html 的
 *      `BASELINE_HTML_DIR`）。
 *   例：`index.html`、`404.html`、`about/index.html`、`categories/前端/index.html`。
 *
 * 归档是确定性的：条目按 UTF-8 字节序排序，mtime / uid / gid / mode 固定，
 * gzip 不写 mtime。同一份源目录重复生成 → 同一 SHA256，可用来核对漂移。
 *
 * 用法：
 *   node tests/baseline-html/make-baseline-html-archive.mjs
 *   node tests/baseline-html/make-baseline-html-archive.mjs --source <public 目录>
 *   node tests/baseline-html/make-baseline-html-archive.mjs --dry-run
 *
 * 依赖：只用 node:fs / node:path / node:zlib / node:crypto，零第三方依赖。
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
const DEFAULT_SOURCE = path.join(REPO_ROOT, '.baseline-work', 'public')
const DEFAULT_BASELINE_JSON = path.join(REPO_ROOT, 'docs', 'reference', 'baseline.json')

const ARCHIVE_NAME = 'baseline-html.tar.gz'
const MANIFEST_NAME = 'baseline-html.manifest.json'
const CONVENTION =
  '只含 .html；归档内路径 = 相对 .baseline-work/public 的路径（POSIX /）；解扎根目录即 BASELINE_HTML_DIR'

/** 固定 mtime（2023-11-14T22:13:20Z）：只为可复现，不是真实修改时间 */
const FIXED_MTIME = 1700000000
const GZIP_LEVEL = 9

const log = (...args) => console.log('[baseline-archive]', ...args)

function parseArgs(argv) {
  const options = { source: DEFAULT_SOURCE, dryRun: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--source') {
      const value = argv[++i]
      if (!value) throw new Error('--source 需要一个目录参数')
      options.source = path.resolve(value)
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '-h' || arg === '--help') {
      options.help = true
    } else {
      throw new Error(`未知参数：${arg}`)
    }
  }
  return options
}

const USAGE = `用法：
  node tests/baseline-html/make-baseline-html-archive.mjs [选项]

选项：
  --source <dir>   baseline HTML 根目录，默认 .baseline-work/public
  --dry-run        只统计和校验，不写归档
  -h, --help       显示本帮助

产物（写入本脚本所在目录）：
  ${ARCHIVE_NAME}          只含 .html 的 tar.gz，归档内路径相对 source 根目录
  ${MANIFEST_NAME}   文件数 / 字节数 / 整包与逐文件 SHA256
`

/** 递归收集源目录下所有 .html，返回相对 POSIX 路径 */
function collectHtmlFiles(sourceDir) {
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error(`源目录不存在或不是目录：${sourceDir}（先用 hexo g 生成，或用 --source 指定）`)
  }
  const files = []
  const walk = (absDir, relDir) => {
    const entries = readdirSync(absDir, { withFileTypes: true })
    // 按 UTF-8 字节序排序，保证跨平台结果一致
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.name, 'utf8'), Buffer.from(b.name, 'utf8')))
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      const abs = path.join(absDir, entry.name)
      if (entry.isDirectory()) walk(abs, rel)
      else if (entry.isFile()) {
        if (!entry.name.toLowerCase().endsWith('.html')) continue
        files.push({ abs, rel })
      }
    }
  }
  walk(sourceDir, '')
  return files
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

/** OCTAL 字段：右对齐、零填充、末尾 NUL（tar 的 octal 约定） */
function writeOctal(buffer, offset, length, value) {
  const text = value.toString(8)
  const digits = length - 1
  if (text.length > digits) throw new Error(`tar 字段溢出：${value} 放不进 ${length} 字节`)
  buffer.write(text.padStart(digits, '0') + '\0', offset, length, 'latin1')
}

function writeString(buffer, offset, length, text) {
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.length > length) throw new Error(`tar 字段超长：${JSON.stringify(text)} > ${length} 字节`)
  bytes.copy(buffer, offset)
}

/**
 * 把相对路径拆成 USTAR 的 prefix/name（各 ≤155 / ≤100 字节）。
 * 当前 48 个页面最长 41 字节，这段是为以后加页面留的。
 */
function splitUstarPath(rel) {
  if (Buffer.byteLength(rel, 'utf8') <= 100) return { name: rel, prefix: '' }
  let cut = -1
  for (let i = 0; i < rel.length; i++) {
    if (rel[i] !== '/') continue
    const prefixBytes = Buffer.byteLength(rel.slice(0, i), 'utf8')
    const nameBytes = Buffer.byteLength(rel.slice(i + 1), 'utf8')
    if (prefixBytes <= 155 && nameBytes <= 100) cut = i
  }
  if (cut < 0) throw new Error(`路径过长，USTAR 无法表示：${rel}`)
  return { name: rel.slice(cut + 1), prefix: rel.slice(0, cut) }
}

const BLOCK = 512

function tarHeader({ name, prefix, size }) {
  const header = Buffer.alloc(BLOCK, 0)
  writeString(header, 0, 100, name)
  writeOctal(header, 100, 8, 0o644) // mode
  writeOctal(header, 108, 8, 0) // uid
  writeOctal(header, 116, 8, 0) // gid
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, FIXED_MTIME)
  // chksum 位置先填空格，算完总和后再写
  header.write('        ', 148, 8, 'latin1')
  header.write('0', 156, 1, 'latin1') // typeflag: regular file
  writeString(header, 257, 6, 'ustar') // magic = "ustar\0"
  header.write('00', 263, 2, 'latin1') // version
  writeString(header, 265, 32, 'baseline') // uname
  writeString(header, 297, 32, 'baseline') // gname
  writeOctal(header, 329, 8, 0) // devmajor
  writeOctal(header, 337, 8, 0) // devminor
  writeString(header, 345, 155, prefix)

  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1')
  return header
}

/** 打包成 tar（不含压缩） */
function buildTar(entries) {
  const chunks = []
  for (const { rel, data } of entries) {
    const { name, prefix } = splitUstarPath(rel)
    chunks.push(tarHeader({ name, prefix, size: data.length }))
    chunks.push(data)
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK
    if (pad) chunks.push(Buffer.alloc(pad, 0))
  }
  chunks.push(Buffer.alloc(BLOCK * 2, 0)) // tar 结束标记：两个全零块
  return Buffer.concat(chunks)
}

function readBaselineMeta() {
  if (!existsSync(DEFAULT_BASELINE_JSON)) return null
  try {
    const json = JSON.parse(readFileSync(DEFAULT_BASELINE_JSON, 'utf8'))
    const commit = json?.baseline?.commit
    const version = json?.baseline?.version
    if (!commit && !version) return null
    return { commit: commit ?? null, version: version ?? null }
  } catch {
    return null
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(USAGE)
    return 0
  }

  const files = collectHtmlFiles(options.source)
  if (!files.length) throw new Error(`源目录里没有任何 .html：${options.source}`)

  const entries = files.map(({ abs, rel }) => ({ rel, data: readFileSync(abs) }))
  const htmlBytes = entries.reduce((total, entry) => total + entry.data.length, 0)
  const tarBuffer = buildTar(entries)
  const gzipped = gzipSync(tarBuffer, { level: GZIP_LEVEL })
  const archiveSha256 = sha256(gzipped)

  const manifest = {
    convention: CONVENTION,
    source: path.relative(REPO_ROOT, options.source).split(path.sep).join('/'),
    baselineCommit: readBaselineMeta()?.commit ?? null,
    baselineVersion: readBaselineMeta()?.version ?? null,
    fileCount: entries.length,
    htmlBytes,
    archive: ARCHIVE_NAME,
    archiveBytes: gzipped.length,
    archiveSha256,
    files: entries.map(({ rel, data }) => ({ path: rel, bytes: data.length, sha256: sha256(data) })),
  }

  log(`源目录: ${options.source}`)
  log(`HTML:   ${entries.length} 个文件 / ${htmlBytes} 字节`)
  log(`tar:    ${tarBuffer.length} 字节  →  gzip: ${gzipped.length} 字节 (${(gzipped.length / 1024).toFixed(1)} KB)`)
  log(`SHA256: ${archiveSha256}`)

  if (options.dryRun) {
    log('--dry-run：不写文件')
    return 0
  }

  const archivePath = path.join(HERE, ARCHIVE_NAME)
  const manifestPath = path.join(HERE, MANIFEST_NAME)
  mkdirSync(HERE, { recursive: true })
  writeFileSync(archivePath, gzipped)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  log(`已写入: ${path.relative(REPO_ROOT, archivePath)}`)
  log(`已写入: ${path.relative(REPO_ROOT, manifestPath)}`)
  return 0
}

try {
  process.exitCode = main()
} catch (error) {
  console.error(`[baseline-archive] 错误：${error.message}`)
  process.exitCode = 1
}
