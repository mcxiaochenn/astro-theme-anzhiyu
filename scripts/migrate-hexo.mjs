#!/usr/bin/env node
/**
 * migrate-hexo.mjs — Hexo(hexo-theme-anzhiyu) → Astro(astro-theme-anzhiyu) 迁移脚手架
 *
 * 用法（在本仓库根目录执行）：
 *   node scripts/migrate-hexo.mjs --site <hexo站点目录> [--out <目标目录>] [--dry-run]
 *
 * 设计要点：
 * - 源站**只读**：脚本只 read/copy，从不写入 --site 指向的目录。
 * - 目标站是一个自包含的 Astro 项目骨架：站点配置、主题配置、内容集合、页面路由、
 *   样式入口、静态资源、package.json 都由脚本生成；主题本体通过 `file:` 相对引用
 *   指向本仓库 packages/*，不复制主题源码。
 * - 配置分两层，与上游 Hexo 一致：
 *     _config.yml          → site.config.ts（站点身份 / 渲染无关字段）
 *     _config.anzhiyu.yml  → anzhiyu.config.yml（主题配置，主题包 loader 的默认文件名）
 * - 1.6.14 → 1.7.1 的配置键差异、无法自动迁移项全部落到 migration-report.json。
 * - --dry-run 不创建/写入任何文件，把完整报告 JSON 打到 stdout。
 *
 * 依赖：仅用 Node 内置模块 + 仓库已 hoisted 的 `yaml`（不新增 npm 依赖）。
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..')
const BLOG = path.join(REPO_ROOT, 'examples', 'blog')
const THEME_PKG_DIR = path.join(REPO_ROOT, 'packages', 'astro-theme-anzhiyu')
const DEFAULTS_TS = path.join(THEME_PKG_DIR, 'src', 'config', 'defaults.ts')

/** [...path].astro 实际分发的 page.type；default 是无 type 时的兜底。 */
const STANDARD_PAGE_TYPES = new Set([
  'tags', 'categories', 'link', 'essay', 'room', 'about', 'album',
  'album_detail', 'music', 'equipment', 'fcircle', 'default',
])

/** Hexo 主配置里需要读取的站点字段（其余原样存进 siteExtras.sourceTopLevelKeys 备查）。 */
const SITE_FIELDS = [
  'title', 'subtitle', 'description', 'keywords', 'author', 'email',
  'language', 'url', 'root', 'timezone', 'per_page', 'permalink', 'external_link',
]

/** 主题包 schema 会 strict 拒绝的键，但 1.7.1 存在大小写/命名等价项；这里只给建议，不自动改值。 */
const KEY_ALIAS_HINTS = {
  Umami: 'umami（1.7.1 已改为小写，且子键变为 apiHost/websiteId/token，需人工重填）',
  ai_summary: 'post_head_ai_description（1.7.1 语义不同，需人工核对）',
  Day_night_toggle_button: 'darkmode.button（1.7.1 已并入 darkmode 区块）',
  friends_lite: 'friends_vue（1.7.1 无 friends_lite，需人工核对）',
}

/** 敏感字段名（命中且值非空时列入「评论/后端密钥」待办）。 */
const SECRET_KEY_RE = /(?:^|_)(key|token|secret|envId|serverURL|accessToken|apiurl|appId|appKey|password|client)$/i

const USAGE = `
用法: node scripts/migrate-hexo.mjs --site <hexo站点目录> [选项]

必填:
  --site <dir>            Hexo 站点根目录（必须含 _config.yml，只读）

可选:
  --out <dir>             目标 Astro 目录，默认 .migration-out/<站点目录名>
  --upstream <path>       1.7.1 上游参考（目录或 _config.yml 文件），用于配置键差异对比；
                          不传时用本仓库 packages/astro-theme-anzhiyu/src/config/defaults.ts
  --dry-run               不写任何文件，把完整 migration-report 打到 stdout
  --no-assets             不复制 source/ 下的静态资源到 public/
  -h, --help              显示本帮助

示例:
  node scripts/migrate-hexo.mjs --site D:/Git-project/xcAnzhiyu --out .migration-out/xcAnzhiyu
  node scripts/migrate-hexo.mjs --site ../my-hexo-site --dry-run
`.trim()

/* ------------------------------------------------------------------ */
/* CLI / 基础设施                                                     */
/* ------------------------------------------------------------------ */

function fail(message) {
  console.error(`\n[migrate] ✗ ${message}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const opts = { site: null, out: null, upstream: null, dryRun: false, assets: true }
  const needValue = (flag) => {
    const value = argv[++argIndex]
    if (value === undefined || value.startsWith('--')) fail(`${flag} 缺少参数值`)
    return value
  }
  let argIndex = -1
  for (argIndex = 0; argIndex < argv.length; argIndex++) {
    const arg = argv[argIndex]
    switch (arg) {
      case '--site': opts.site = needValue(arg); break
      case '--out': opts.out = needValue(arg); break
      case '--upstream': opts.upstream = needValue(arg); break
      case '--dry-run': case '-n': opts.dryRun = true; break
      case '--no-assets': opts.assets = false; break
      case '-h': case '--help': console.log(USAGE); process.exit(0); break
      default:
        if (arg.startsWith('--site=')) opts.site = arg.slice(7)
        else if (arg.startsWith('--out=')) opts.out = arg.slice(6)
        else if (arg.startsWith('--upstream=')) opts.upstream = arg.slice(11)
        else fail(`未知参数：${arg}\n\n${USAGE}`)
    }
  }
  if (!opts.site) fail(`缺少 --site\n\n${USAGE}`)
  return opts
}

/** POSIX 化相对路径，便于写进 ESM import / package.json。 */
function posix(p) {
  return p.split(path.sep).join('/')
}

/** 递归列出目录下所有文件的相对路径（POSIX）。 */
function walkFiles(root) {
  const out = []
  const visit = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(abs, rel)
      else if (entry.isFile()) out.push(rel)
    }
  }
  visit(root, '')
  return out
}

let OUT = ''
let DRY = false
let SITE = ''
const counters = { written: 0, copied: 0, skipped: 0 }
const outputFiles = []

/** 写产物文件；dry-run 只记录计划，不落盘。 */
function writeOut(rel, content) {
  outputFiles.push(rel)
  if (DRY) {
    console.log(`  [dry-run] write ${rel}`)
    return
  }
  const abs = path.join(OUT, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n', 'utf8')
  counters.written++
  console.log(`  + ${rel}`)
}

/** 复制单个文件；dry-run 只记录计划，不落盘。 */
function copyOut(srcAbs, rel, sourceLabel) {
  outputFiles.push(rel)
  if (DRY) {
    console.log(`  [dry-run] copy  ${rel}  <- ${sourceLabel ?? posix(path.relative(SITE, srcAbs))}`)
    return
  }
  const abs = path.join(OUT, rel)
  mkdirSync(path.dirname(abs), { recursive: true })
  copyFileSync(srcAbs, abs)
  counters.copied++
  console.log(`  + ${rel}  <- ${sourceLabel ?? posix(path.relative(SITE, srcAbs))}`)
}

function readYamlFile(abs, label) {
  if (!existsSync(abs)) {
    fail(`缺少 ${label}：${abs}\n请确认 --site 指向 Hexo 站点根目录（含 _config.yml / _config.anzhiyu.yml）。`)
  }
  let raw
  try {
    raw = readFileSync(abs, 'utf8')
  } catch (error) {
    fail(`读取 ${label} 失败：${abs}\n${error.message}`)
  }
  let data
  try {
    data = parseYaml(raw)
  } catch (error) {
    fail(`解析 ${label} 的 YAML 失败：${abs}\n${error.message}\n请先用 YAML 校验工具修好源站配置再重试（源站不会被修改）。`)
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    fail(`${label} 顶层必须是 YAML mapping：${abs}`)
  }
  return { raw, data }
}

/** 从 defaults.ts（AUTO-GENERATED from upstream 1.7.1）提取顶层键。 */
function keysFromDefaultsTs() {
  if (!existsSync(DEFAULTS_TS)) fail(`找不到主题默认配置：${DEFAULTS_TS}`)
  const text = readFileSync(DEFAULTS_TS, 'utf8')
  const keys = [...text.matchAll(/^  "([^"]+)":/gm)].map((match) => match[1])
  if (keys.length === 0) fail(`无法从 ${DEFAULTS_TS} 提取顶层键（格式变化？）`)
  return keys
}

/** 1.7.1 目标键集合：优先 --upstream，否则用主题包 defaults.ts。 */
function loadTargetKeys(upstreamOpt) {
  if (upstreamOpt) {
    const target = path.resolve(upstreamOpt)
    if (!existsSync(target)) fail(`--upstream 路径不存在：${target}`)
    const file = statSync(target).isDirectory() ? path.join(target, '_config.yml') : target
    if (!existsSync(file)) fail(`--upstream 下找不到 _config.yml：${file}`)
    let parsed
    try {
      parsed = parseYaml(readFileSync(file, 'utf8'))
    } catch (error) {
      fail(`解析 --upstream 配置失败：${file}\n${error.message}`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(`--upstream 配置顶层必须是 mapping：${file}`)
    return { keys: Object.keys(parsed), source: posix(file) }
  }
  return { keys: keysFromDefaultsTs(), source: posix(path.relative(REPO_ROOT, DEFAULTS_TS)) + ' (AUTO-GENERATED from 1.7.1)' }
}

/** 用 Intl 求 IANA 时区相对 UTC 的固定偏移（分钟）；无法解析返回 null。 */
function timezoneOffsetMinutes(tz) {
  if (!tz || typeof tz !== 'string') return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date('2024-06-01T00:00:00Z'))
    const label = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(label)
    if (!match) return null
    const sign = match[1] === '-' ? -1 : 1
    return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0))
  } catch {
    return null
  }
}

/**
 * 启发式判定「站点独有键」是 1.6.14 主题官方键还是第三方注入：
 * 扫描源站 themes/anzhiyu 源码里是否引用了 theme.<key> / config.<key> / hexo-config('<key>')。
 */
function scanThemeReferencedKeys(siteRoot) {
  const themeDir = path.join(siteRoot, 'themes', 'anzhiyu')
  if (!existsSync(themeDir)) return { available: false, referenced: new Set(), files: 0 }
  const exts = new Set(['.pug', '.js', '.mjs', '.styl', '.css', '.yml', '.yaml', '.ejs', '.json'])
  const referenced = new Set()
  let files = 0
  let budget = 12 * 1024 * 1024
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(abs)
        continue
      }
      if (!entry.isFile() || !exts.has(path.extname(entry.name).toLowerCase())) continue
      if (budget <= 0) continue
      let text
      try {
        text = readFileSync(abs, 'utf8')
      } catch {
        continue
      }
      budget -= text.length
      files++
      for (const match of text.matchAll(/\b(?:theme|config)\.([A-Za-z_][A-Za-z0-9_]*)/g)) referenced.add(match[1])
      for (const match of text.matchAll(/hexo-config\(\s*['"]([^'"]+)['"]/g)) referenced.add(match[1])
      for (const match of text.matchAll(/\bget_config\(\s*['"]([^'"]+)['"]/g)) referenced.add(match[1])
    }
  }
  visit(themeDir)
  return { available: true, referenced, files }
}

/* ------------------------------------------------------------------ */
/* 内容处理                                                           */
/* ------------------------------------------------------------------ */

/** 提取 Markdown 的 frontmatter 文本与解析结果（不重新序列化，保证原样保留）。 */
function readFrontmatter(text, label) {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { fmText: '', data: {}, start: -1, end: -1, lines }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return { fmText: '', data: {}, start: 0, end: -1, lines }
  const fmText = lines.slice(1, end).join('\n')
  let data = {}
  try {
    const parsed = parseYaml(fmText)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed
  } catch {
    // 坏 YAML（例如 date 里混入不换行空格）：保留原文，仅用正则补 type/layout/permalink
    const type = /^type:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(fmText)?.[1]?.trim()
    const layout = /^layout:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(fmText)?.[1]?.trim()
    data = { ...(type ? { type } : {}), ...(layout ? { layout } : {}) }
  }
  return { fmText, data, start: 0, end, lines }
}

/** 在 frontmatter 末尾补 layout: page 与 permalink；其余行原样不动。 */
function injectPageFrontmatter(text, permalink) {
  const { end, lines, fmText } = readFrontmatter(text, '')
  const has = (key) => new RegExp(`^${key}\\s*:`, 'm').test(fmText)
  const additions = []
  if (!has('layout')) additions.push('layout: page')
  if (!has('permalink')) additions.push(`permalink: ${permalink}`)
  if (additions.length === 0) return text
  if (end < 0) {
    // 没有 frontmatter：新建一段
    return `---\n${additions.join('\n')}\n---\n${text}`
  }
  return [...lines.slice(0, end), ...additions, ...lines.slice(end)].join('\n')
}

/* ------------------------------------------------------------------ */
/* 主流程                                                             */
/* ------------------------------------------------------------------ */

function main() {
  const opts = parseArgs(process.argv.slice(2))
  DRY = opts.dryRun
  SITE = path.resolve(opts.site)
  const siteName = path.basename(SITE)
  OUT = path.resolve(opts.out ?? path.join('.migration-out', siteName))

  console.log('='.repeat(72))
  console.log(`Hexo → Astro 迁移脚手架${DRY ? '（DRY-RUN，不写任何文件）' : ''}`)
  console.log('='.repeat(72))
  console.log(`源站（只读）: ${SITE}`)
  console.log(`目标       : ${OUT}`)

  /* ---- [1/8] 校验 ---- */
  console.log('\n[1/8] 校验源站与目标路径')
  if (!existsSync(SITE) || !statSync(SITE).isDirectory()) fail(`--site 不是有效目录：${SITE}`)
  if (path.resolve(OUT) === SITE || OUT.startsWith(SITE + path.sep)) {
    fail(`--out 不能位于源站目录内（源站只读）：${OUT}`)
  }
  if (existsSync(OUT) && readdirSync(OUT).length > 0 && !DRY) {
    fail(`目标目录已存在且非空，为避免覆盖请换一个 --out 或先清空：${OUT}`)
  }
  const themeVersionFile = path.join(SITE, 'themes', 'anzhiyu', 'package.json')
  let siteThemeVersion = 'unknown'
  if (existsSync(themeVersionFile)) {
    try { siteThemeVersion = JSON.parse(readFileSync(themeVersionFile, 'utf8')).version ?? 'unknown' } catch { /* ignore */ }
  }
  console.log(`  ✓ 源站目录有效；主题版本 ${siteThemeVersion}`)
  console.log(`  ✓ 目标目录${DRY ? '（dry-run 不创建）' : '可写且为空/不存在'}`)

  /* 目标站 → 仓库根的相对前缀（用于 package.json 的 file: 依赖）。 */
  const repoRelRaw = path.relative(OUT, REPO_ROOT)
  const CROSS_DRIVE = path.isAbsolute(repoRelRaw) // Windows 跨盘时 path.relative 返回绝对路径
  const repoRel = posix(repoRelRaw)
  const repoImportPrefix = CROSS_DRIVE
    ? pathToFileURL(REPO_ROOT).href
    : repoRel === '' ? '.' : repoRel.startsWith('.') ? repoRel : `./${repoRel}`
  const warnings = []
  if (CROSS_DRIVE) {
    warnings.push('目标站与本仓库不在同一磁盘：生成的主题包 import 使用 file:// URL，部分构建工具可能不支持，请把目标站移到同盘或手工改相对路径。')
  }
  const pkgPrefix = `${repoImportPrefix.replace(/\/$/, '')}/packages/`

  /**
   * ESM import 说明符按「引用文件所在目录」解析，不能所有页面共用一个前缀。
   * 这里按每个产物文件单独计算到仓库根 / 目标站根的相对路径。
   */
  const relativeSpecifier = (fileRel, targetAbs) => {
    const from = path.dirname(path.join(OUT, fileRel))
    let r = posix(path.relative(from, targetAbs))
    if (r === '') r = '.'
    else if (!r.startsWith('.')) r = `./${r}`
    return r
  }
  const packagesSpecifier = (fileRel) =>
    CROSS_DRIVE
      ? `${pathToFileURL(REPO_ROOT).href}/packages/`
      : `${relativeSpecifier(fileRel, REPO_ROOT)}/packages/`
  const siteConfigSpecifier = (fileRel) =>
    CROSS_DRIVE
      ? `${pathToFileURL(OUT).href}/site.config.ts`
      : `${relativeSpecifier(fileRel, OUT)}/site.config`
  console.log(`  ✓ 主题包引用前缀（package.json / astro.config.mjs）: ${pkgPrefix}`)

  /* ---- [2/8] 读配置 ---- */
  console.log('\n[2/8] 读取源站配置')
  const siteCfg = readYamlFile(path.join(SITE, '_config.yml'), '_config.yml')
  const themeCfgPath = path.join(SITE, '_config.anzhiyu.yml')
  const themeCfg = readYamlFile(themeCfgPath, '_config.anzhiyu.yml')
  const siteKeys = Object.keys(siteCfg.data)
  const themeKeys = Object.keys(themeCfg.data)
  console.log(`  ✓ _config.yml          : ${siteKeys.length} 个顶层键`)
  console.log(`  ✓ _config.anzhiyu.yml  : ${themeKeys.length} 个顶层键`)
  const foundSiteFields = SITE_FIELDS.filter((key) => key in siteCfg.data)
  console.log(`  ✓ 站点字段命中 ${foundSiteFields.length}/${SITE_FIELDS.length}: ${foundSiteFields.join(', ')}`)

  const target = loadTargetKeys(opts.upstream)
  const targetKeySet = new Set(target.keys)
  const matchedThemeKeys = themeKeys.filter((key) => targetKeySet.has(key))
  const missingIn171 = themeKeys.filter((key) => !targetKeySet.has(key))
  const addedIn171 = target.keys.filter((key) => !themeKeys.includes(key))

  /* ---- [3/8] site.config.ts ---- */
  console.log('\n[3/8] 站点配置 → site.config.ts')
  const siteForRender = {}
  for (const key of ['title', 'subtitle', 'description', 'keywords', 'author', 'email', 'language', 'url', 'root']) {
    if (key in siteCfg.data) siteForRender[key] = siteCfg.data[key]
  }
  if (!siteForRender.root) siteForRender.root = '/'
  if (!siteForRender.title) siteForRender.title = siteName
  const extras = {}
  for (const key of ['timezone', 'per_page', 'permalink', 'external_link', 'index_generator', 'pagination_dir']) {
    if (key in siteCfg.data) extras[key] = siteCfg.data[key]
  }
  extras.sourceTopLevelKeys = siteKeys
  const siteConfigTs = `/**
 * AUTO-GENERATED by scripts/migrate-hexo.mjs — 来自源站 _config.yml。
 *
 * site      : 主题渲染需要的站点元数据（对应 packages/.../src/layouts/site.ts 的 SiteConfig）。
 *             页面路由已从硬编码的 BASELINE_SITE 改为 import 本文件。
 * siteExtras: 渲染无关、但迁移/部署/验证会用到的原始字段（时区、分页、permalink、外链策略）。
 *
 * 未命中的字段: ${SITE_FIELDS.filter((k) => !foundSiteFields.includes(k)).join(', ') || '（无）'}
 */
export const site = ${JSON.stringify(siteForRender, null, 2)}

export const siteExtras = ${JSON.stringify(extras, null, 2)}
`
  writeOut('site.config.ts', siteConfigTs)

  /* ---- [4/8] anzhiyu.config.yml ---- */
  console.log('\n[4/8] 主题配置 → anzhiyu.config.yml（含 1.6.14 → 1.7.1 键差异）')
  const themeScan = scanThemeReferencedKeys(SITE)
  const legacyOfficialKeys = missingIn171.filter((key) => themeScan.referenced.has(key))
  const thirdPartyKeys = missingIn171.filter((key) => !themeScan.referenced.has(key))
  const coverageRate = themeKeys.length ? matchedThemeKeys.length / themeKeys.length : 1

  const cleaned = {}
  for (const [key, value] of Object.entries(themeCfg.data)) {
    if (targetKeySet.has(key)) cleaned[key] = value
  }
  const header = [
    '# AUTO-GENERATED by scripts/migrate-hexo.mjs',
    `# 来源: ${posix(themeCfgPath)}`,
    `# 基准: ${target.source}`,
    '#',
    '# 主题包 loader 默认读取本文件（anzhiyu.config.yml），与 defaults 深合并后用 strict schema 校验。',
    `# 已剔除 ${missingIn171.length} 个 1.7.1 不接受的顶层键: ${missingIn171.join(', ') || '（无）'}`,
    '# 原文（含注释）完整保存在 anzhiyu.config.original.yml，请据此人工映射后再合并回来。',
    `# 未配置的 ${addedIn171.length} 个 1.7.1 键由 defaults 自动补齐: ${addedIn171.join(', ') || '（无）'}`,
    '',
  ].join('\n')
  writeOut('anzhiyu.config.yml', header + stringifyYaml(cleaned, { lineWidth: 0 }))
  writeOut('anzhiyu.config.original.yml', themeCfg.raw)
  console.log(`  ✓ 覆盖率 ${matchedThemeKeys.length}/${themeKeys.length} = ${(coverageRate * 100).toFixed(2)}%`)
  console.log(`  · 1.7.1 新增键 (${addedIn171.length}): ${addedIn171.join(', ') || '（无）'}`)
  console.log(`  · 1.7.1 缺失键 (${missingIn171.length}): ${missingIn171.join(', ') || '（无）'}`)
  console.log(`  · 其中 1.6.14 官方遗留 ${legacyOfficialKeys.length} / 第三方注入 ${thirdPartyKeys.length}（主题源码扫描 ${themeScan.files} 个文件）`)

  /* ---- [5/8] 文章 + 页面 ---- */
  console.log('\n[5/8] 文章与独立页面 → src/content/posts/')
  const postsDir = path.join(SITE, 'source', '_posts')
  if (!existsSync(postsDir)) fail(`找不到文章目录：${postsDir}`)
  const postFiles = walkFiles(postsDir).filter((rel) => rel.toLowerCase().endsWith('.md'))
  const postRecords = []
  const usedNames = new Set()
  for (const rel of postFiles) {
    const srcAbs = path.join(postsDir, rel)
    const flat = rel.split('/').pop()
    let outRel = flat
    if (usedNames.has(outRel)) outRel = `${rel.replace(/\//g, '-')}` // 同名时带目录前缀
    usedNames.add(outRel)
    const text = readFileSync(srcAbs, 'utf8')
    const { data } = readFrontmatter(text, rel)
    const dest = `src/content/posts/${outRel}`
    copyOut(srcAbs, dest)
    postRecords.push({
      source: `source/_posts/${rel}`,
      target: dest,
      title: typeof data.title === 'string' ? data.title : null,
      hasAbbrlink: data.abbrlink !== undefined && data.abbrlink !== null && data.abbrlink !== '',
      abbrlink: data.abbrlink ?? null,
      date: data.date instanceof Date ? data.date.toISOString() : (typeof data.date === 'string' ? data.date : null),
    })
  }
  const postsWithAbbrlink = postRecords.filter((p) => p.hasAbbrlink).length
  console.log(`  ✓ 文章 ${postRecords.length} 篇（含 abbrlink ${postsWithAbbrlink} 篇）`)

  const sourceDir = path.join(SITE, 'source')
  const pageFiles = walkFiles(sourceDir).filter(
    (rel) => rel.endsWith('/index.md') && !rel.startsWith('_posts/') && !rel.startsWith('_data/'),
  )
  const pageRecords = []
  const unsupported = []
  for (const rel of pageFiles) {
    const srcAbs = path.join(sourceDir, rel)
    const dirName = rel.slice(0, -'/index.md'.length)
    const permalink = `/${dirName}/`
    const original = readFileSync(srcAbs, 'utf8')
    const { data } = readFrontmatter(original, rel)
    const type = typeof data.type === 'string' && data.type ? data.type : 'default'
    const declaredLayout = typeof data.layout === 'string' ? data.layout : null
    const hadPermalink = /^permalink\s*:/m.test(readFrontmatter(original, rel).fmText)
    const migrated = injectPageFrontmatter(original, permalink)
    const dest = `src/content/posts/${dirName.replace(/\//g, '-')}-page.md`
    writeOut(dest, migrated)
    pageRecords.push({
      source: `source/${rel}`,
      target: dest,
      dir: dirName,
      type,
      permalink: hadPermalink ? (data.permalink ?? permalink) : permalink,
      injectedLayout: !declaredLayout,
      declaredLayout,
    })
    if (!STANDARD_PAGE_TYPES.has(type)) {
      unsupported.push({
        category: 'page.type',
        item: type,
        location: `source/${rel}`,
        reason: `Astro 侧 [...path].astro 只分发 ${[...STANDARD_PAGE_TYPES].join('/')}，${type} 会落到 DefaultPage（仅渲染正文），专属布局/数据丢失。`,
        action: '在目标站 src/pages/[...path].astro 增加对应分支，或把该页改造成自定义 Astro 页面。',
      })
    }
    if (declaredLayout && declaredLayout !== 'page') {
      unsupported.push({
        category: 'layout',
        item: declaredLayout,
        location: `source/${rel}`,
        reason: `该页声明 layout: ${declaredLayout}，不会命中 [..path].astro 的 layout === 'page' 过滤，迁移后该 URL 会 404。`,
        action: '在目标站为该页补一个专用路由，或人工把 layout 改为 page 并接受默认渲染。',
      })
    }
  }
  const pageTypeList = [...new Set(pageRecords.map((p) => p.type))].sort()
  console.log(`  ✓ 独立页面 ${pageRecords.length} 个；page.type: ${pageTypeList.join(', ')}`)

  /* ---- [6/8] 数据 + 静态资源 ---- */
  console.log('\n[6/8] 站点数据 → data/，静态资源 → public/')
  const dataDir = path.join(SITE, 'source', '_data')
  const dataRecords = []
  if (existsSync(dataDir)) {
    for (const rel of walkFiles(dataDir)) {
      const srcAbs = path.join(dataDir, rel)
      const dest = `data/${rel}`
      copyOut(srcAbs, dest)
      dataRecords.push({ source: `source/_data/${rel}`, target: dest })
    }
  } else {
    console.log('  · 源站没有 source/_data/，跳过')
  }
  // 注意：examples/blog 的 site-data.ts 只 glob data/*.yml，.json 数据需自行接入。
  const ymlData = dataRecords.filter((d) => d.target.endsWith('.yml')).length
  console.log(`  ✓ 数据文件 ${dataRecords.length} 个（其中 .yml ${ymlData} 个可被 site-data.ts 读取）`)

  let assetCount = 0
  if (opts.assets) {
    for (const rel of walkFiles(sourceDir)) {
      if (rel.startsWith('_posts/') || rel.startsWith('_data/') || rel.startsWith('.obsidian/')) continue
      if (rel === 'index.md' || rel.endsWith('/index.md')) continue
      copyOut(path.join(sourceDir, rel), `public/${rel}`)
      assetCount++
    }
    console.log(`  ✓ 静态资源 ${assetCount} 个 → public/`)
  } else {
    console.log('  · --no-assets：跳过静态资源')
  }

  /* ---- [7/8] Astro 骨架 ---- */
  console.log('\n[7/8] Astro 项目骨架（配置 / 内容集合 / 路由 / 样式）')

  // package.json：主题包与 vite 插件用 file: 相对引用，其余依赖与 examples/blog 对齐。
  const packageJson = {
    name: `${siteName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-astro`,
    private: true,
    type: 'module',
    scripts: { dev: 'astro dev', build: 'astro build', preview: 'astro preview' },
    dependencies: {
      '@astrojs/markdown-remark': '^7.3.10',
      astro: '^7.4.13',
      'astro-theme-anzhiyu': `file:${pkgPrefix}astro-theme-anzhiyu`,
      yaml: '^2.9.1',
    },
    devDependencies: {
      'highlight.js': '^11.12.0',
      stylus: '^0.64.0',
      'vite-plugin-stylus-hexo-config': `file:${pkgPrefix}vite-plugin-stylus-hexo-config`,
    },
  }
  writeOut('package.json', packageJson)

  // astro.config.mjs：复用 examples/blog 的自定义 Markdown processor + stylus 插件，重写路径。
  let astroConfig = readFileSync(path.join(BLOG, 'astro.config.mjs'), 'utf8')
  astroConfig = astroConfig.replace(/(?:\.\.\/)+packages\//g, packagesSpecifier('astro.config.mjs'))
  astroConfig = astroConfig.replace(
    "path.join(root, 'theme.config.yml')",
    "path.join(root, 'anzhiyu.config.yml')",
  )
  writeOut('astro.config.mjs', astroConfig)

  // content.config.ts：复用 examples/blog 的 schema，把 loader base 指向本站内容目录。
  let contentConfig = readFileSync(path.join(BLOG, 'src', 'content.config.ts'), 'utf8')
  contentConfig = contentConfig.replace(/^\/\*\*[\s\S]*?\*\/\n/, `/**
 * AUTO-GENERATED by scripts/migrate-hexo.mjs（schema 复用 examples/blog）。
 * 内容来源改为本目标站的 src/content/posts/（文章 + 独立页面共用一个集合）。
 * date/updated 的 Hexo 时区语义见下方 hexoDate 注释。
 */
`)
  contentConfig = contentConfig.replace("base: '../../fixtures'", "base: './src/content/posts'")
  const tz = siteCfg.data.timezone
  const offset = timezoneOffsetMinutes(tz)
  if (offset !== null) {
    contentConfig = contentConfig.replace(/const SITE_UTC_OFFSET_MINUTES = 8 \* 60/, `const SITE_UTC_OFFSET_MINUTES = ${offset}`)
    console.log(`  ✓ timezone ${tz} → UTC${offset >= 0 ? '+' : ''}${(offset / 60).toFixed(2)}h，已写入 content.config.ts`)
  } else {
    warnings.push(`源站 timezone 为空/无法解析（${JSON.stringify(tz ?? '')}），content.config.ts 沿用 +08:00；若文章日期含显式时区请人工核对（见 MIGRATION.md「时区」）。`)
  }
  writeOut('src/content.config.ts', contentConfig)

  // 站点数据读取层（与 examples/blog 完全一致，glob data/*.yml）。
  copyOut(path.join(BLOG, 'src', 'data', 'site-data.ts'), 'src/data/site-data.ts', 'examples/blog/src/data/site-data.ts')

  // 样式入口（整目录复制，index.styl 的 @import 相对路径保持有效）。
  const stylesRoot = path.join(BLOG, 'src', 'styles')
  for (const rel of walkFiles(stylesRoot)) {
    copyOut(path.join(stylesRoot, rel), `src/styles/${rel}`, `examples/blog/src/styles/${rel}`)
  }

  // 最小路由集合：首页 / 分页 / 独立页面 / 文章页。
  // 归档/标签/分类/404 依赖 examples/blog 的 archives/_data.ts 与 BASELINE_SITE，属于后续待办。
  const ROUTES = [
    'src/pages/index.astro',
    'src/pages/page/[...page].astro',
    'src/pages/[...path].astro',
    'src/pages/[year]/[month]/[day]/[slug].astro',
  ]
  for (const rel of ROUTES) {
    let text = readFileSync(path.join(BLOG, rel), 'utf8')
    text = text.replace(/(?:\.\.\/)+packages\//g, packagesSpecifier(rel))
    const siteConst = /^const site = \{[\s\S]*?^\}/m
    if (siteConst.test(text)) {
      text = text.replace(siteConst, `import { site } from '${siteConfigSpecifier(rel)}'`)
    } else {
      warnings.push(`${rel} 未找到硬编码的 site 常量，可能仍使用基准站身份，请人工检查。`)
    }
    writeOut(rel, text)
  }
  console.log(`  ✓ 最小路由 ${ROUTES.length} 个（BASELINE_SITE → site.config.ts）`)

  /* ---- 无法自动迁移项（配置侧） ---- */
  for (const key of missingIn171) {
    unsupported.push({
      category: 'config-key',
      item: key,
      location: '_config.anzhiyu.yml',
      reason: `1.7.1 默认配置无此顶层键，主题包 schema 为 strict，直接保留会让 loadThemeConfig() 抛错；已剔除并备份到 anzhiyu.config.original.yml。${themeScan.available ? (themeScan.referenced.has(key) ? '1.6.14 主题源码有引用（官方遗留键）。' : '1.6.14 主题源码无引用（疑似第三方插件/自定义注入）。') : ''}`,
      action: KEY_ALIAS_HINTS[key] ? `人工迁移到 ${KEY_ALIAS_HINTS[key]}` : '确认 1.7.1 是否有等价键；无则删除该配置及对应功能。',
    })
  }

  /** 递归扫描配置对象里的敏感字段（只记路径，不记值，避免报告泄漏密钥）。 */
  const secretPaths = []
  const collectSecrets = (value, prefix, source) => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      const p = prefix ? `${prefix}.${key}` : key
      // max_token / limit_token 这类是数量上限，不是凭据，排除误报
      const isCredential =
        SECRET_KEY_RE.test(key) && !/^(?:max|min|limit)[_-]?/i.test(key)
      if (isCredential && child !== null && child !== undefined && child !== '' && child !== false) {
        secretPaths.push({ path: p, source })
      }
      if (child && typeof child === 'object') collectSecrets(child, p, source)
    }
  }
  collectSecrets(themeCfg.data, '', '_config.anzhiyu.yml')
  collectSecrets(siteCfg.data, '', '_config.yml')
  const seenSecret = new Set()
  for (const item of secretPaths) {
    const id = `${item.source}:${item.path}`
    if (seenSecret.has(id)) continue
    seenSecret.add(id)
    unsupported.push({
      category: 'comment-backend-secret',
      item: item.path,
      location: item.source,
      reason: '评论/统计/AI 摘要等后端地址与密钥依赖 Hexo 插件注入或服务端渲染，Astro 静态产物不会自动带过去；且密钥不应写进前端产物。',
      action: '改为目标站的环境变量 + 前端组件显式读取，部署平台单独配置；确认后端服务仍可用。',
    })
  }

  const cdn = themeCfg.data.CDN
  if (cdn && typeof cdn === 'object') {
    if (cdn.custom_format || (cdn.option && Object.keys(cdn.option).length)) {
      unsupported.push({
        category: 'cdn',
        item: 'CDN.custom_format / CDN.option',
        location: '_config.anzhiyu.yml',
        reason: 'Hexo 主题按 CDN option 在服务端拼静态资源 URL；Astro 主题的资源由 Vite 打包，CDN provider 机制不存在。',
        action: '在 astro.config.mjs 用 build.assetsPrefix / vite.base，或在部署层配置 CDN 回源；删除自定义 CDN option。',
      })
    }
    unsupported.push({
      category: 'cdn',
      item: `CDN.internal_provider=${cdn.internal_provider ?? ''} / third_party_provider=${cdn.third_party_provider ?? ''}`,
      location: '_config.anzhiyu.yml',
      reason: 'provider 选择是 Hexo 模板逻辑，Astro 侧无对应实现。',
      action: '按 MIGRATION.md「自定义 CDN」章节改为构建/部署层配置。',
    })
  }
  if (themeCfg.data.inject && typeof themeCfg.data.inject === 'object') {
    const inject = themeCfg.data.inject
    for (const slot of ['head', 'bottom']) {
      const list = inject[slot]
      if (Array.isArray(list) && list.length) {
        unsupported.push({
          category: 'inject',
          item: `inject.${slot} (${list.length} 项)`,
          location: '_config.anzhiyu.yml',
          reason: 'Hexo inject 在服务端拼接 HTML；Astro 需把脚本/样式放进布局组件或页面 <head>/<body>。',
          action: '把内容迁到目标站 src/layouts 或 BaseLayout 的对应插槽。',
        })
      }
    }
  }
  if (themeCfg.data.pjax && themeCfg.data.pjax.enable) {
    unsupported.push({
      category: 'hexo-only',
      item: 'pjax.enable',
      location: '_config.anzhiyu.yml',
      reason: 'Astro 是 MPA/静态输出，不使用 pjax；相关脚本与 exclude 规则无对应物。',
      action: '改用 Astro 的 View Transitions（若需要无刷新导航），或删除该配置。',
    })
  }
  const HEXO_PLUGINS = [
    'abbrlink', 'bangumi', 'envelope_comment', 'hexo_safego', 'baidu_url_submit',
    'aisummary', 'feed', 'sitemap', 'baidusitemap', 'search', 'all_minifier',
    'aplayer', 'nofollow', 'auto_spacing', 'highlight', 'prismjs', 'deploy',
  ]
  const presentPlugins = HEXO_PLUGINS.filter((key) => key in siteCfg.data)
  if (presentPlugins.length) {
    unsupported.push({
      category: 'hexo-plugin',
      item: presentPlugins.join(', '),
      location: '_config.yml',
      reason: '这些是 Hexo 生成器/渲染器插件配置，Astro 没有等价插件机制；RSS、sitemap、abbrlink、AI 摘要、图床/压缩等需换实现。',
      action: 'abbrlink 已作为 frontmatter 字段被文章路由读取（无需插件）；其余按 MIGRATION.md「部署 / 验证」章节改用 @astrojs/rss、@astrojs/sitemap 或 CI 脚本。',
    })
  }
  if (postsWithAbbrlink < postRecords.length) {
    warnings.push(`${postRecords.length - postsWithAbbrlink} 篇文章没有 abbrlink，文章路由末段会退回内容集合 id；若 id 带目录前缀会产生嵌套 URL，建议补 abbrlink 或扁平化文章。`)
  }
  if (!opts.assets) warnings.push('本次使用 --no-assets，静态资源未复制；上线前需手动同步 source/ 下非页面文件到 public/。')

  /* ---- [8/8] 报告 ---- */
  console.log('\n[8/8] migration-report.json')
  // 快照：把报告文件自身也算进去，避免 counts / generatedFiles / filesWritten 三个数字互相打架。
  const generatedFiles = DRY ? [...outputFiles] : [...outputFiles, 'migration-report.json']
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: DRY,
    sourceSite: posix(SITE),
    sourceSiteReadOnly: true,
    outputDir: posix(path.relative(process.cwd(), OUT)) || '.',
    themeVersion: { source: siteThemeVersion, target: '1.7.1 (upstream reference)' },
    siteConfig: {
      sourceFile: '_config.yml',
      targetFile: 'site.config.ts',
      requestedFields: SITE_FIELDS,
      foundFields: foundSiteFields,
      missingFields: SITE_FIELDS.filter((k) => !foundSiteFields.includes(k)),
      values: Object.fromEntries(foundSiteFields.map((k) => [k, siteCfg.data[k]])),
      sourceTopLevelKeyCount: siteKeys.length,
    },
    themeConfig: {
      sourceFile: '_config.anzhiyu.yml',
      targetFile: 'anzhiyu.config.yml',
      originalBackup: 'anzhiyu.config.original.yml',
      topLevelKeyCount: themeKeys.length,
      keys: themeKeys,
    },
    counts: {
      posts: postRecords.length,
      postsWithAbbrlink,
      pages: pageRecords.length,
      pageTypes: pageTypeList,
      dataFiles: dataRecords.length,
      dataYmlFiles: ymlData,
      staticAssets: assetCount,
      outputFiles: generatedFiles.length,
    },
    posts: postRecords,
    pages: pageRecords,
    data: dataRecords,
    configKeyDelta: {
      baseline: target.source,
      targetKeyCount: target.keys.length,
      siteThemeKeyCount: themeKeys.length,
      matchedKeys: matchedThemeKeys.length,
      coverageRate: Number(coverageRate.toFixed(4)),
      /** 1.7.1 新增、站点未配置：由主题 defaults 深合并自动补齐。 */
      addedIn171,
      /** 站点在用、1.7.1 已无：strict schema 会拒绝，已剔除并备份。 */
      missingIn171,
      /** 需要人工判定的未知键（无自动值映射）。 */
      unknownKeys: missingIn171,
      /** 启发式细分：1.6.14 主题源码引用过的官方遗留键。 */
      legacyOfficialKeys,
      /** 启发式细分：源码无引用，疑似第三方插件/自定义注入。 */
      thirdPartyKeys,
      themeSourceScan: { available: themeScan.available, filesScanned: themeScan.files },
      aliasHints: Object.fromEntries(missingIn171.filter((k) => KEY_ALIAS_HINTS[k]).map((k) => [k, KEY_ALIAS_HINTS[k]])),
    },
    unsupported,
    unsupportedCount: unsupported.length,
    warnings,
    generatedFiles,
    filesWritten: DRY ? 0 : counters.written + 1, // +1 = migration-report.json 自身
    filesCopied: DRY ? 0 : counters.copied,
  }

  if (DRY) {
    console.log('\n--- migration-report.json（dry-run，未写入任何文件）---')
    console.log(JSON.stringify(report, null, 2))
  } else {
    writeOut('migration-report.json', report)
  }

  console.log('\n' + '='.repeat(72))
  console.log('汇总')
  console.log('='.repeat(72))
  console.log(`  文章            : ${postRecords.length}（abbrlink ${postsWithAbbrlink}）`)
  console.log(`  独立页面        : ${pageRecords.length}；type: ${pageTypeList.join(', ')}`)
  console.log(`  数据文件        : ${dataRecords.length}（.yml ${ymlData}）`)
  console.log(`  静态资源        : ${assetCount}`)
  console.log(`  主题配置覆盖    : ${matchedThemeKeys.length}/${themeKeys.length} = ${(coverageRate * 100).toFixed(2)}%`)
  console.log(`  1.7.1 新增/缺失 : ${addedIn171.length} / ${missingIn171.length}`)
  console.log(`  无法自动迁移项  : ${unsupported.length}（${[...new Set(unsupported.map((u) => u.category))].join(', ') || '无'}）`)
  console.log(`  警告            : ${warnings.length}`)
  console.log(`  产物文件        : ${generatedFiles.length}${DRY ? '（dry-run：0 字节落盘）' : `（写 ${counters.written} / 复制 ${counters.copied}）`}`)
  console.log(`  报告            : ${DRY ? 'stdout（未写文件）' : 'migration-report.json'}`)
  console.log('='.repeat(72))
  if (!DRY) {
    console.log('\n下一步：')
    console.log(`  cd ${report.outputDir} && pnpm install && pnpm build`)
    console.log('  详见 docs/MIGRATION.md（评论/搜索/统计、CDN、部署、回滚、验证清单）。')
  }
}

main()
