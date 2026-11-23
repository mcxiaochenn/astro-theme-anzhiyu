#!/usr/bin/env node
/**
 * 解压 baseline HTML 归档到本地目录，给 scripts/diff-html.mjs --all 当
 * BASELINE_HTML_DIR 用。CI 里 bash 完全不知道 `.baseline-work/`，所以靠这个
 * 脚本把 tests/baseline-html/baseline-html.tar.gz 展开成 baseline 根目录。
 *
 * 目录约定（与 tests/baseline-html/make-baseline-html-archive.mjs 写死一致）：
 *   归档内路径 = 相对 `.baseline-work/public` 的路径（POSIX /），解压根目录
 *   就是 baseline HTML 根目录。即解压后：
 *     .baseline-html/index.html
 *     .baseline-html/404.html
 *     .baseline-html/about/index.html
 *     .baseline-html/categories/前端/index.html
 *   这正是 diff-html 的 `pagePathToFile()` 期望的形状：URL `/about/` →
 *   `<BASELINE_HTML_DIR>/about/index.html`。
 *
 * 幂等：重复运行会覆盖同名文件，结果不变（打印的文件数/字节数相同）。
 * 归档里删掉的页面在本地不会被自动清理（需要时手动删输出目录）。
 *
 * 用法：
 *   node scripts/extract-baseline-html.mjs                 # → .baseline-html/
 *   node scripts/extract-baseline-html.mjs --out <dir>
 *   node scripts/extract-baseline-html.mjs --archive <tar.gz> --out <dir>
 *   node scripts/extract-baseline-html.mjs -h
 *
 * 退出码：成功 0；归档缺失/损坏/manifest 不一致/路径不安全 → 1（错误写 stderr）。
 * 依赖：只用 node:fs / node:path / node:zlib / node:crypto，零第三方依赖。
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_ARCHIVE = path.join(REPO_ROOT, 'tests', 'baseline-html', 'baseline-html.tar.gz')
const DEFAULT_OUT = path.join(REPO_ROOT, '.baseline-html')
const MANIFEST_SUFFIX = '.manifest.json'
const BLOCK = 512

const log = (...args) => console.log('[baseline-html]', ...args)

function fail(message) {
  throw new Error(message)
}

function parseArgs(argv) {
  const options = { archive: DEFAULT_ARCHIVE, out: DEFAULT_OUT, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--archive') {
      const value = argv[++i]
      if (!value) fail('--archive 需要一个文件路径')
      options.archive = path.resolve(value)
    } else if (arg === '--out') {
      const value = argv[++i]
      if (!value) fail('--out 需要一个目录路径')
      options.out = path.resolve(value)
    } else if (arg === '-h' || arg === '--help') {
      options.help = true
    } else {
      fail(`未知参数：${arg}`)
    }
  }
  return options
}

const USAGE = `用法：
  node scripts/extract-baseline-html.mjs [选项]

选项：
  --archive <tar.gz>  归档路径，默认 tests/baseline-html/baseline-html.tar.gz
  --out <dir>         解压目标目录，默认 .baseline-html
  -h, --help          显示本帮助

解压后目录就是 diff-html 的 baseline 根目录，跑全量 diff：
  BASELINE_HTML_DIR=.baseline-html node scripts/diff-html.mjs --all
`

function relToRepo(file) {
  const relative = path.relative(REPO_ROOT, file)
  return relative && !relative.startsWith('..') ? relative.split(path.sep).join('/') : file
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

/** tar 的 octal 字段：去掉 NUL/空格后按 8 进制解析 */
function readOctal(header, offset, length, fieldName) {
  const raw = header
    .subarray(offset, offset + length)
    .toString('latin1')
    .replace(/\0/g, ' ')
    .trim()
  if (raw === '') return 0
  if (!/^[0-7]+$/.test(raw)) fail(`tar 头损坏：${fieldName} 字段不是八进制数：${JSON.stringify(raw)}`)
  return Number.parseInt(raw, 8)
}

function readString(header, offset, length) {
  const raw = header.subarray(offset, offset + length).toString('utf8')
  const nul = raw.indexOf('\0')
  return nul === -1 ? raw : raw.slice(0, nul)
}

/**
 * 解析 tar buffer，返回 [{ rel, data }]。做三件事：
 *   1. 每个 512 字节头校验 checksum（损坏立刻报错，而不是解出半个文件）；
 *   2. 只接受普通文件（本归档约定只含 .html）；
 *   3. 拒绝绝对路径 / 盘符 / 反斜杠 / `..`，防目录穿越。
 */
function parseTar(buffer) {
  const entries = []
  let offset = 0
  while (offset + BLOCK <= buffer.length) {
    const header = buffer.subarray(offset, offset + BLOCK)
    if (header.every((byte) => byte === 0)) break // 结束标记（两个全零块）

    const storedChecksum = readOctal(header, 148, 8, 'chksum')
    let computedChecksum = 0
    for (let i = 0; i < BLOCK; i++) computedChecksum += i >= 148 && i < 156 ? 0x20 : header[i]
    if (storedChecksum !== computedChecksum) {
      fail(`归档已损坏：偏移 ${offset} 的 tar 头校验和不匹配（存 ${storedChecksum}，算 ${computedChecksum}）`)
    }

    const magic = readString(header, 257, 6)
    if (magic !== 'ustar') fail(`不支持的 tar 格式：magic=${JSON.stringify(magic)}（期望 USTAR）`)

    const typeFlag = header[156] === 0 ? '0' : String.fromCharCode(header[156])
    if (typeFlag !== '0') {
      fail(`归档含非普通文件条目（typeflag=${JSON.stringify(typeFlag)}），违反「只放 .html」约定`)
    }

    const size = readOctal(header, 124, 12, 'size')
    const dataStart = offset + BLOCK
    const dataEnd = dataStart + size
    if (dataEnd > buffer.length) fail(`归档已损坏：条目越过文件末尾（偏移 ${offset}，声明 ${size} 字节）`)

    const prefix = readString(header, 345, 155)
    const name = readString(header, 0, 100)
    const rel = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, '')

    if (!rel || rel.startsWith('/') || /^[A-Za-z]:/.test(rel) || rel.includes('\\')) {
      fail(`拒绝不安全的归档路径：${JSON.stringify(rel)}`)
    }
    const segments = rel.split('/')
    if (segments.some((segment) => segment === '..' || segment === '' || segment === '.')) {
      fail(`拒绝含 .. / 空段 / . 的归档路径：${JSON.stringify(rel)}`)
    }
    if (!rel.toLowerCase().endsWith('.html')) {
      fail(`归档含非 .html 条目：${rel}（约定：只放 .html，图片/CSS/JS 不进归档）`)
    }

    entries.push({ rel, data: buffer.subarray(dataStart, dataEnd) })
    offset = dataStart + size + ((BLOCK - (size % BLOCK)) % BLOCK)
  }
  if (!entries.length) fail('归档里没有任何文件（解出来 0 个 .html）')
  return entries
}

/** 读 manifest 并校验整包 SHA256 / 文件数 / 字节数；返回逐文件 sha 映射 */
function loadManifest(archivePath, archiveSha256) {
  const manifestPath = path.join(
    path.dirname(archivePath),
    path.basename(archivePath).replace(/\.tar\.gz$/i, '') + MANIFEST_SUFFIX,
  )
  if (!existsSync(manifestPath)) {
    log(`警告：找不到 manifest ${relToRepo(manifestPath)}，跳过整包校验`)
    return null
  }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    fail(`manifest 解析失败：${relToRepo(manifestPath)}（${error.message}）`)
  }
  if (manifest.archiveSha256 && manifest.archiveSha256.toLowerCase() !== archiveSha256.toLowerCase()) {
    fail(
      `归档与 manifest 不一致：\n` +
        `  归档 SHA256:    ${archiveSha256}\n` +
        `  manifest 记录:  ${manifest.archiveSha256}\n` +
        `归档可能已损坏或被改动；确认源目录后重跑 tests/baseline-html/make-baseline-html-archive.mjs`,
    )
  }
  log(`整包校验通过：SHA256 ${archiveSha256}（manifest ${relToRepo(manifestPath)}）`)
  const fileHashes = new Map()
  for (const file of manifest.files ?? []) {
    if (file && typeof file.path === 'string' && typeof file.sha256 === 'string') {
      fileHashes.set(file.path, file.sha256)
    }
  }
  return { manifest, fileHashes }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(USAGE)
    return 0
  }

  if (!existsSync(options.archive) || !statSync(options.archive).isFile()) {
    fail(
      `归档不存在：${relToRepo(options.archive)}\n` +
        `  仓库里应有 tests/baseline-html/baseline-html.tar.gz；缺失说明分支不完整或 checkout 过滤掉了该文件`,
    )
  }

  const archiveBuffer = readFileSync(options.archive)
  const archiveSha256 = sha256(archiveBuffer)
  log(`归档：${relToRepo(options.archive)}（${archiveBuffer.length} 字节）`)
  const loaded = loadManifest(options.archive, archiveSha256)

  let tarBuffer
  try {
    tarBuffer = gunzipSync(archiveBuffer)
  } catch (error) {
    fail(`gzip 解压失败：${relToRepo(options.archive)} 不是合法 gzip（${error.message}）`)
  }

  const entries = parseTar(tarBuffer)
  const totalBytes = entries.reduce((total, entry) => total + entry.data.length, 0)

  if (loaded) {
    const { manifest, fileHashes } = loaded
    if (manifest.fileCount !== undefined && manifest.fileCount !== entries.length) {
      fail(`归档与 manifest 不一致：manifest 记录 ${manifest.fileCount} 个文件，归档里实际 ${entries.length} 个`)
    }
    if (manifest.htmlBytes !== undefined && manifest.htmlBytes !== totalBytes) {
      fail(`归档与 manifest 不一致：manifest 记录 ${manifest.htmlBytes} 字节，归档里实际 ${totalBytes} 字节`)
    }
    let verified = 0
    const bad = []
    for (const entry of entries) {
      const expected = fileHashes.get(entry.rel)
      if (!expected) continue
      if (sha256(entry.data) !== expected) bad.push(entry.rel)
      else verified++
    }
    if (bad.length) {
      fail(`归档内容与 manifest 的逐文件 SHA256 不一致（${bad.length} 个）：\n  ${bad.slice(0, 5).join('\n  ')}`)
    }
    log(`逐文件校验：${verified}/${entries.length} 个文件 SHA256 与 manifest 一致`)
  }

  mkdirSync(options.out, { recursive: true })
  const outRoot = path.resolve(options.out)
  for (const entry of entries) {
    const target = path.resolve(outRoot, ...entry.rel.split('/'))
    if (target !== outRoot && !target.startsWith(outRoot + path.sep)) {
      fail(`拒绝写出到目标目录之外：${target}`)
    }
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, entry.data)
  }

  log(`解压完成：${entries.length} 个文件 / ${totalBytes} 字节 → ${relToRepo(options.out)}`)
  log('目录约定：解压根目录 = baseline HTML 根目录（index.html / 404.html / about/index.html …）')
  log(
    `下一步：BASELINE_HTML_DIR=${path.relative(process.cwd(), options.out) || '.'} ` +
      `node scripts/diff-html.mjs --all`,
  )
  return 0
}

try {
  process.exitCode = main()
} catch (error) {
  console.error(`[baseline-html] 错误：${error.message}`)
  process.exitCode = 1
}
