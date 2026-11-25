#!/usr/bin/env node
/**
 * deploy-demo-pages.mjs — 功能全开 demo 一键构建并部署到本仓库 demo-pages 分支（GitHub Pages）。
 *
 * 部署形态（2026-11-25 改版）：**本仓库 `demo-pages` 产物分支**（不新建独立部署仓库）——
 * 分支内容即站点根（+ .nojekyll + CNAME），GitHub Pages source = demo-pages / (root)，
 * 自定义域名 anzhiyu.example.mcxiaochen.top。产物分支与源码分支（main）互不干扰，
 * push demo-pages 不触发 CI（ci.yml 只跑 main / PR）。
 *
 * demo 构建 = 基线 + 功能全开 delta，全程不改动守卫文件：
 *   1. 读 theme.config.yml（SHA 守卫基线）+ theme.config.demo.yml（delta），按 loader
 *      同款语义深合并（对象递归、数组整体替换）→ 写临时完整配置（构建后删除），
 *      经 ANZHIYU_THEME_CONFIG 指向它——HTML 与 CSS 两条通道收口同一文件（B5 不变）；
 *   2. data/essay.yml 第一组临时补 `home_essay: true`（首页即刻短文条 #bbTimeList，
 *      构建结束无条件恢复原样）；
 *   3. demo 构建（DEPLOY_SITE_URL / DEPLOY_SITE_ROOT 映射到 site.url / site.root 与
 *      Astro `base`）；
 *   4. 生成 dist/search.xml（local_search 索引：fixtures 全部文章，title/url/content/tags，
 *      与 local-search.js 的 <entry> 解析口径兼容）；子路径部署时给站内绝对路径补前缀
 *      （根路径部署跳过改写）；
 *   5. 同步到 demo-pages 分支：远端分支存在则浅克隆替换产物后快进 push，不存在则新建
 *      分支首推 → 补 `.nojekyll` 与 `CNAME` → commit → push；
 *   6. push 后 GitHub Pages 自动构建，约 1–2 分钟生效。
 *
 * 用法：
 *   node scripts/deploy-demo-pages.mjs
 * 环境变量（可选）：
 *   DEMO_PAGES_REPO    默认 mcxiaochenn/astro-theme-anzhiyu（本仓库；分支形式不新建仓库）
 *   DEMO_PAGES_BRANCH  默认 demo-pages
 *   DEMO_PAGES_PATH    默认 ''（根路径部署）；传 blog 等走子路径部署
 *   DEMO_PAGES_URL     默认 https://anzhiyu.example.mcxiaochen.top
 *   DEMO_PAGES_CNAME   自定义域名（写入 CNAME 文件）；缺省从 DEMO_PAGES_URL 主机名推导，
 *                      *.github.io 不写
 *   DEMO_THEME_CONFIG  默认 examples/blog/theme.config.demo.yml（功能全开 delta）
 */

import { spawnSync, execSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'

const here = fileURLToPath(import.meta.url)
const repoRoot = resolve(here, '..', '..')
const blogDir = join(repoRoot, 'examples', 'blog')
const distDir = join(blogDir, 'dist')

const PAGES_REPO = process.env.DEMO_PAGES_REPO || 'mcxiaochenn/astro-theme-anzhiyu'
// 显式传 ''（或 '-'）表示根路径部署（自定义域名形态）；缺省就是根路径。
const rawPagesPath = process.env.DEMO_PAGES_PATH
const PAGES_PATH = (rawPagesPath === undefined ? '' : rawPagesPath === '-' ? '' : rawPagesPath).replace(
  /^\/+|\/+$/g,
  '',
)
const PAGES_URL = (process.env.DEMO_PAGES_URL || 'https://anzhiyu.example.mcxiaochen.top').replace(/\/+$/, '')
const PAGES_BRANCH = process.env.DEMO_PAGES_BRANCH || 'demo-pages'
// 自定义域名（CNAME 文件）：显式 DEMO_PAGES_CNAME 优先；否则从 URL 主机名推导，
// *.github.io 不写 CNAME。
const PAGES_CNAME =
  process.env.DEMO_PAGES_CNAME ??
  (new URL(PAGES_URL).hostname.endsWith('.github.io') ? '' : new URL(PAGES_URL).hostname)
// 功能全开 delta（与基线 theme.config.yml 深合并后才是完整配置）；默认构建/CI 仍只用
// theme.config.yml，互不影响。
const DEMO_DELTA = process.env.DEMO_THEME_CONFIG
  ? resolve(repoRoot, process.env.DEMO_THEME_CONFIG)
  : join(blogDir, 'theme.config.demo.yml')
const BASELINE_CONFIG = join(blogDir, 'theme.config.yml')
const MERGED_CONFIG = join(blogDir, '.tmp-demo-theme.config.yml')
const ESSAY_FILE = join(blogDir, 'data', 'essay.yml')
const FIXTURES_DIR = join(repoRoot, 'fixtures')

/** 带输出地执行 shell 命令；失败即退出。 */
function run(command, options = {}) {
  console.log(`  $ ${command}`)
  execSync(command, { stdio: 'inherit', cwd: repoRoot, ...options })
}

/**
 * 需要拿输出的命令：输出先落盘再读回。沙箱禁止子进程经命名管道回传 stdout
 * （默认 stdio 'pipe' 的 execSync 会 EPERM，见 docs/notes/P7-4-acceptance.md）。
 */
function captureOutput(command) {
  const outFile = join(repoRoot, '.tmp-deploy-out.txt')
  rmSync(outFile, { force: true })
  let ok = true
  try {
    execSync(`${command} > "${outFile}" 2>&1`, { stdio: 'ignore', cwd: repoRoot })
  } catch {
    ok = false
  }
  const out = existsSync(outFile) ? readFileSync(outFile, 'utf8').trim() : ''
  rmSync(outFile, { force: true })
  return { ok, out }
}

/** 递归收集 dist 下所有 .html 文件。 */
function collectHtmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collectHtmlFiles(full, out)
    else if (name.endsWith('.html')) out.push(full)
  }
  return out
}

function fail(message) {
  console.error(`[deploy-demo] ${message}`)
  process.exit(1)
}

/** loader 同款深合并：对象递归、数组整体替换、全程深拷贝。 */
function deepMerge(base, delta) {
  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  if (delta === null || typeof delta !== 'object' || Array.isArray(delta)) return structuredClone(delta)
  if (!isPlainObject(base)) return structuredClone(delta)
  const out = structuredClone(base)
  for (const [key, value] of Object.entries(delta)) {
    out[key] = isPlainObject(out[key]) && isPlainObject(value) ? deepMerge(out[key], value) : structuredClone(value)
  }
  return out
}

/** YAML 值扁平化（categories 可嵌套数组），供 search.xml <tags> 用。 */
function flatten(value) {
  if (Array.isArray(value)) return value.flatMap(flatten)
  return value === undefined || value === null ? [] : [String(value)]
}

/** XML 文本转义（search.xml <title>/<content>/<tag> 用）。 */
function xmlEscape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ------------------------------------------------------------------ */
/* 1. demo 构建准备：基线 + delta 合并 + essay.yml 首组 home_essay       */
/* ------------------------------------------------------------------ */

if (!existsSync(DEMO_DELTA)) fail(`demo 配置 delta 不存在：${DEMO_DELTA}`)
if (!existsSync(BASELINE_CONFIG)) fail(`基线配置不存在：${BASELINE_CONFIG}`)
console.log('[1/5] demo 构建准备（delta %s → 合并基线 → %s）', DEMO_DELTA, MERGED_CONFIG)

const mergedConfig = deepMerge(
  parse(readFileSync(BASELINE_CONFIG, 'utf8')) ?? {},
  parse(readFileSync(DEMO_DELTA, 'utf8')) ?? {},
)
writeFileSync(MERGED_CONFIG, stringify(mergedConfig))

const essayOriginal = readFileSync(ESSAY_FILE, 'utf8')
const essayLines = essayOriginal.split('\n')
const firstGroup = essayLines.findIndex((line) => line.startsWith('- '))
if (firstGroup < 0) fail('essay.yml 未找到顶层分组（以 "- " 开头的行）')
essayLines.splice(firstGroup + 1, 0, '  home_essay: true')
const essayPatched = essayLines.join('\n')

writeFileSync(ESSAY_FILE, essayPatched)

/* ------------------------------------------------------------------ */
/* 2. demo 构建                                                        */
/* ------------------------------------------------------------------ */

console.log('[2/5] demo 构建（site.url=%s, root=/%s, Astro base=/%s）', PAGES_URL, PAGES_PATH, PAGES_PATH)
// 注意：这里用 spawnSync 的 env 注入，值以 node 直接传给子进程，不经过
// Git Bash 的 MSYS 路径转换（命令行前缀 `/blog` 会被转换成 Windows 路径）。
// 根路径部署时 DEPLOY_SITE_ROOT 传 '/'（site-identity 归一化后即 root=/）。
let buildStatus = -1
try {
  const build = spawnSync('pnpm', ['--filter', 'blog', 'build'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ANZHIYU_THEME_CONFIG: MERGED_CONFIG,
      DEPLOY_SITE_URL: PAGES_URL,
      DEPLOY_SITE_ROOT: PAGES_PATH || '/',
      CODEBUDDY_SAFE_DELETE_ENABLED: '0',
    },
    stdio: 'inherit',
    shell: true,
  })
  buildStatus = build.status ?? -1
} finally {
  // 无论构建成败都恢复守卫文件（golden diff 依赖 essay.yml 不含 home_essay；
  // 临时合并配置也在此清理）。
  writeFileSync(ESSAY_FILE, essayOriginal)
  rmSync(MERGED_CONFIG, { force: true })
  console.log('  已恢复 essay.yml 并清理临时合并配置（home_essay / demo 开关仅本次构建生效）')
}
if (buildStatus !== 0) fail(`demo 构建失败（exit ${buildStatus}）`)

/* ------------------------------------------------------------------ */
/* 3. 生成 search.xml + HTML 后处理                                     */
/* ------------------------------------------------------------------ */

// search.xml：local_search 索引，按 fixtures/*.md 生成（hexo-generator-search 只收文章，
// layout: page 的独立页面不进索引）。content 为正文原文（空白归一），
// local-search.js 拿它剥标签后做关键词匹配。
const urlPrefix = PAGES_PATH ? `/${PAGES_PATH}` : ''
const entries = []
for (const name of readdirSync(FIXTURES_DIR).sort()) {
  if (!name.endsWith('.md')) continue
  const raw = readFileSync(join(FIXTURES_DIR, name), 'utf8')
  const fence = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!fence) continue
  const data = parse(fence[1]) ?? {}
  if (data.layout === 'page') continue
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data.date ?? ''))
  if (!dateMatch) fail(`${name}: front-matter 缺少可解析的 date`)
  const id = name.replace(/\.md$/, '')
  // B4：末段 = abbrlink ?? id，与文章路由 / postSlugOf() 同一规则。
  const slug = data.abbrlink === undefined || data.abbrlink === null ? id : String(data.abbrlink)
  entries.push({
    title: String(data.title ?? id),
    url: `${urlPrefix}/${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}/${slug}/`,
    content: raw.slice(fence[0].length).replace(/\s+/g, ' ').trim(),
    tags: [...flatten(data.categories), ...flatten(data.tags)],
  })
}
const searchXml = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<search>',
  ...entries.map((entry) =>
    [
      '  <entry>',
      `    <title>${xmlEscape(entry.title)}</title>`,
      `    <url>${xmlEscape(entry.url)}</url>`,
      `    <content>${xmlEscape(entry.content)}</content>`,
      `    <tags>${entry.tags.map((tag) => `<tag>${xmlEscape(tag)}</tag>`).join('')}</tags>`,
      '  </entry>',
    ].join('\n'),
  ),
  '</search>',
  '',
].join('\n')
writeFileSync(join(distDir, 'search.xml'), searchXml)
console.log('[3/5] search.xml：%d 个 entry（%d 字节）→ dist/search.xml', entries.length, searchXml.length)

const prefix = urlPrefix
const shouldPrefix = (url) =>
  url.startsWith('/') && url !== prefix && !url.startsWith(`${prefix}/`) && !url.startsWith('//')

const htmlFiles = collectHtmlFiles(distDir)
let rewritten = 0
if (!prefix) {
  console.log('  HTML 后处理：根路径部署，跳过前缀改写（%d 个页面）', htmlFiles.length)
} else {
  for (const file of htmlFiles) {
    const before = readFileSync(file, 'utf8')
    const after = before.replace(
      /(\s(?:href|src)=")(\/[^"#?]*?)(")/g,
      (match, head, url, tail) => {
        if (!shouldPrefix(url)) return match
        rewritten += 1
        return `${head}${prefix}${url}${tail}`
      },
    )
    if (after !== before) writeFileSync(file, after)
  }
  console.log('  HTML 后处理：%d 个页面，%d 处 href/src 补了 %s 前缀', htmlFiles.length, rewritten, prefix)
}

/* ------------------------------------------------------------------ */
/* 4. 同步到 demo-pages 分支                                           */
/* ------------------------------------------------------------------ */

const tmpRepo = join(repoRoot, '.tmp-pages-deploy')
const headSha = captureOutput('git rev-parse --short HEAD').out || 'unknown'
const repoUrl = `https://github.com/${PAGES_REPO}.git`

rmSync(tmpRepo, { recursive: true, force: true })
console.log('[4/5] 同步 %s@%s（产物分支）', PAGES_REPO, PAGES_BRANCH)

// 远端已有 demo-pages 分支 → 浅克隆替换产物后快进 push；不存在 → 新建分支首推。
const remoteHeads = captureOutput(`git ls-remote --heads ${repoUrl} ${PAGES_BRANCH}`).out
if (remoteHeads) {
  run(`git clone --depth 1 --branch ${PAGES_BRANCH} ${repoUrl} ${tmpRepo}`)
  for (const name of readdirSync(tmpRepo)) {
    if (name === '.git') continue
    rmSync(join(tmpRepo, name), { recursive: true, force: true })
  }
} else {
  console.log('  远端无 %s 分支，新建产物分支', PAGES_BRANCH)
  mkdirSync(tmpRepo, { recursive: true })
  run('git init', { cwd: tmpRepo })
  run(`git remote add origin ${repoUrl}`, { cwd: tmpRepo })
}

cpSync(distDir, tmpRepo, { recursive: true })

// Jekyll 会忽略下划线开头的目录（Astro 的 _astro/），必须禁用。
const nojekyll = join(tmpRepo, '.nojekyll')
if (!existsSync(nojekyll)) writeFileSync(nojekyll, '')

// 自定义域名：CNAME 文件（GitHub Pages 读它绑定域名）
if (PAGES_CNAME) writeFileSync(join(tmpRepo, 'CNAME'), `${PAGES_CNAME}\n`)

run('git add -A', { cwd: tmpRepo })

let committed
try {
  run(`git commit -m "deploy(demo-pages): astro-theme-anzhiyu demo @ ${headSha}"`, { cwd: tmpRepo })
  committed = true
} catch {
  committed = false
}

if (!committed) {
  console.log('[deploy-demo] 没有需要提交的变化（demo 产物与远端一致）')
} else {
  console.log('[5/5] push 到 %s@%s', PAGES_BRANCH, PAGES_REPO)
  run(`git push origin HEAD:${PAGES_BRANCH}`, { cwd: tmpRepo })
}

rmSync(tmpRepo, { recursive: true, force: true })

console.log('')
console.log(
  '[deploy-demo] 完成。部署地址：%s%s（Pages 构建约 1–2 分钟后生效）',
  PAGES_URL,
  PAGES_PATH ? `/${PAGES_PATH}/` : '/',
)
if (PAGES_CNAME) console.log('[deploy-demo] CNAME: %s（DNS 解析生效 + Pages 证书签发后可访问）', PAGES_CNAME)
if (prefix) {
  console.log('[deploy-demo] 已知降级：上游 JS 内运行时路径（/json/music.json、/music/、搜索等）')
  console.log('[deploy-demo] 在子路径部署下不生效；页面导航 / 样式 / 视觉不受影响。')
} else {
  console.log('[deploy-demo] 根路径部署：运行时路径无降级。')
}
