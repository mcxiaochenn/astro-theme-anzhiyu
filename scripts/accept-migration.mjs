#!/usr/bin/env node
/**
 * P7-4 · 真实站迁移验收（Hexo → Astro 主题）
 * ==========================================================================
 *
 * 一条命令跑完 `migrate-hexo → pnpm install → build → 检查 → 报告`，
 * 对 D:\Git-project\xcAnzhiyu（Hexo 7.3.0 + anzhiyu 1.6.14，只读）这类真实站
 * 给出可复跑的验收结论。脚本**不信任** migrate-hexo 自述的统计：路由从源站
 * `_config.yml` + frontmatter 独立重算，链接/资源/身份全部从构建产物实测。
 *
 * 用法
 * --------------------------------------------------------------------------
 *   node scripts/accept-migration.mjs [选项]
 *
 *   --site <dir>      Hexo 站点根目录（必须含 _config.yml 与 public/），
 *                     默认 $ACCEPT_SITE 或 D:/Git-project/xcAnzhiyu
 *   --out <dir>       验收工作目录，默认 .migration-out/accept-<时间戳>
 *   --reuse           工作目录里已有 migrated/（+ node_modules）时直接复用，
 *                     不重跑 migrate / install（build 默认仍会重跑）
 *   --skip-build      跳过构建，直接用现有 dist 做检查
 *   --json            只往 stdout 打 JSON 报告（人读进度走 stderr）
 *   -h, --help        打印本帮助
 *
 * 退出码
 * --------------------------------------------------------------------------
 *   0  全部检查 PASS（inherited / whitelisted 不计入失败）
 *   1  存在迁移缺口（gap）
 *   2  环境或构建失败（blocked：站点目录不对 / migrate / install / build 挂掉）
 *
 * 检查项
 * --------------------------------------------------------------------------
 *   build        构建 exit=0、dist HTML 页数、根级产物
 *   routes       ① 由 _config.yml permalink + post frontmatter abbrlink +
 *                   source 页面 permalink 独立重算期望 URL，逐条断言 dist 有文件
 *                ② 源站构建产物 public/（golden，97 HTML）vs 迁移 dist（94 HTML）
 *                   的清单差集，给出 missing/extra 精确清单
 *   links        扫描全部 dist HTML 的站内 href/src（含相对路径、pjax.loadUrl），
 *                解析成 dist 文件系统目标，缺失目标按 classifier 聚合
 *                分类：theme-asset / page-missing / taxonomy-slug / old-permalink /
 *                      placeholder / feed / sitemap / search-index / pseudo-scheme / other
 *                三栏归属：migration-gap（迁移必须修）/ inherited（源站本来就缺）/
 *                          whitelisted（已知豁免，表在下方 WHITELIST）
 *   assets       仅静态资源后缀的 404 清单 + golden 静态资源目录清单对比
 *   identity     首页/文章页/about 的 title、html lang、canonical、og:url、og:type
 *                是否使用 site.config.ts 的源站身份与**当前路由**
 *   page-types   17 个独立页面逐个断言存在且含该 page.type 的根选择器
 *   tag-residue  产物不得残留 Hexo tag / EJS 标记，title 不得出现 undefined/NaN；
 *                pre/code 里被示例出来的语法文本不算残留（计入 ignoredCodeSamples，
 *                与 links 检查同一语义——golden 在代码块里同样保留这些字面量）
 *   search       解析首页 GLOBAL_CONFIG.localSearch；enabled 时断言索引文件存在
 *   feed         源站 hexo-generator-feed / sitemap / baidu 配置的等价产物存在且非空
 *   structure    抽样复用 scripts/diff-html.mjs 的单页模式，只报数字（INFO，不判罚）
 *
 * 已知豁免表
 * --------------------------------------------------------------------------
 *   WHITELIST 见文件下方常量；每项必须给 id / 匹配方式 / 理由 / 归属任务。
 *   命中项单独计数并列在报告 whitelist 段，不进 gap 分母、不影响退出码，
 *   但也绝不隐藏——报告里能查到具体 URL、命中次数与所属页面。
 *   归属优先级：inherited（golden 证据最硬）> whitelisted > migration-gap。
 *
 * 链接扫描语义（为什么和「直接 grep href」不同）
 * --------------------------------------------------------------------------
 *   - 只扫真实 HTML 属性（双/单引号 href/src + onclick 里的 pjax.loadUrl），
 *     不扫 data-lazy-src / srcset / CSS url()（列为局限）；
 *   - 相对 URL 按页面所在目录解析，并保留结尾 /；
 *   - <script>/<style> 的内联正文与代码块（figure.highlight / pre / code）
 *     里的 src=、href= 是**被示例出来的文本**，不算链接（计入 ignoredCodeSamples）；
 *   - 伪协议 /mailto: /javascript: 以 / 开头，按坏 URL 报出来（pseudo-scheme）。
 *
 * 子进程输出为什么落盘
 * --------------------------------------------------------------------------
 *   本仓库的 agent 运行在带沙箱的 Windows 环境，沙箱禁止子进程通过命名管道回传
 *   stdout（child_process 的 pipe 会 EPERM）。所以所有外部命令的 stdout/stderr
 *   都写到 `<工作目录>/logs/*.log` 再读回，证据完整且可复跑。
 *
 * golden 参考（源站 public/）
 * --------------------------------------------------------------------------
 *   源站 D:\Git-project\xcAnzhiyu\public 是 Hexo 自己的构建产物（97 个 HTML +
 *   atom.xml / rss2.xml / sitemap.xml / baidusitemap.xml / search.xml / go.html …），
 *   比「只重算 URL」权威得多，因此：
 *     - 路由差集以 golden 为准；
 *     - 一个缺失目标若在 golden 里也缺、且 golden 自己也引用了它 → inherited；
 *     - golden 有文件而 dist 没有 → migration-gap（迁移漏了产物）；
 *     - golden 没有文件、golden 也不引用、dist 却引用 → migration-gap（迁移新造的错 URL）。
 *   注意：golden 是**上一次 Hexo 构建**的静态快照，若源站源码在构建后又改过内容，
 *   个别正文链接可能与 golden 不一致；此类差异会体现在 links 明细里，按 URL 可人工复核。
 *
 * 与 Lead 一次性探针的口径关系
 * --------------------------------------------------------------------------
 *   Lead 的 .tmp-lead-linkcheck.mjs 只匹配「双引号 + 以 / 开头的 href/src」，
 *   得到 70 个缺失目标。本脚本额外解析相对 URL 与 pjax.loadUrl，
 *   因此 normalizedMissing 会大于 70；报告 links.counts.leadStyleAbsoluteAttrMissing
 *   按 Lead 的原始口径复算用来对账，差值来自代码块里被示例出来的 src=（本脚本过滤掉）。
 *
 * 源站只读
 * --------------------------------------------------------------------------
 *   本脚本只 read/copy 源站：migrate-hexo 自带「--out 不得位于源站内」保护，
 *   本脚本也从不向 --site 写文件。
 *
 * 依赖：node 内置模块 + 仓库根 node_modules/yaml（动态 import，缺失时降级为
 * 只解析本脚本需要的少量键）。diff 抽样复用仓库 scripts/diff-html.mjs。
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// ═══════════════════════════════════════════════════════════════════════════
// 0 · 常量
// ═══════════════════════════════════════════════════════════════════════════

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..')
const MIGRATE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'migrate-hexo.mjs')
const DIFF_SCRIPT = path.join(REPO_ROOT, 'scripts', 'diff-html.mjs')
const DEFAULT_SITE = process.env.ACCEPT_SITE || 'D:/Git-project/xcAnzhiyu'
const DEFAULT_OUT_PARENT = path.join(REPO_ROOT, '.migration-out')
const ACCEPT_PREFIX = 'accept-'
const SCHEMA_VERSION = 1

/** Lead 一次性探针的历史口径（仅用于对账，不作为验收依据） */
const LEAD_REFERENCE = { absoluteAttrMissingTargets: 70, distHtmlFiles: 94 }

/** 静态资源后缀（assets 检查口径） */
const STATIC_EXT = new Set([
  '.js', '.mjs', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.avif', '.bmp', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.json', '.xml', '.xsl', '.txt', '.mp3', '.mp4', '.webm', '.ogg', '.wav',
])

/** golden 里需要逐个目录对比的静态资源目录（主题/站点静态资源） */
const ASSET_DIRS = ['js', 'css', 'img', 'anzhiyu', 'feed']

/**
 * 已知豁免表（whitelist）
 *
 * 设计约束：
 *   - 每项必须有 id + 匹配方式 + 理由 + 归属任务；
 *   - 命中项仍会完整列在报告的 whitelist 段（URL / 命中页面数），不掩盖；
 *   - 只用来豁免「同一根因的重复计数」或「已明确登记给其他任务、本次验收不阻塞」
 *     的项，不能用来藏真实迁移缺口。
 */
const WHITELIST = [
  {
    id: 'WL-01',
    kind: 'regex',
    pattern: '^/img-url$',
    reason:
      'uitest 页里 Hexo tag 语法示例 `{% galleryGroup name description link img-url %}` 的占位参数（字面量 img-url），不是真实资源；源站 golden 对同一 demo 渲染为空 href，当前产物多出一个相对路径。属主题 tag demo 内容的渲染差异，不影响真实导航',
    owner: 'hexo-tag-demo / 内容侧',
  },
  {
    id: 'WL-02',
    kind: 'prefix',
    pattern: '/uitest/',
    reason:
      'uitest 页是主题语法测试页，正文示例链接（Pasted image / Slides Demo / xxx.mp4 等）本身就是演示数据；已在 inherited 里逐条登记源站同款引用，此前缀用于兜底后续新增示例，避免把内容演示链接当成迁移缺陷',
    owner: '内容侧',
  },
]

/** page.type → 根选择器（依据 docs/notes/phases/P3-2-page-types.md §6.2 + 源站 golden 实测） */
const PAGE_TYPE_SELECTORS = {
  about: { type: 'about', selectors: [{ test: 'id="about-page"' }] },
  tags: {
    type: 'tags',
    selectors: [{ test: 'class="tag-cloud-list is-center"' }, { test: 'id="tag-page-tags"' }],
  },
  categories: {
    type: 'categories',
    selectors: [{ test: 'category-lists' }, { test: 'id="tag-page-tags"' }],
  },
  link: { type: 'link', selectors: [{ test: 'id="flink-banners"' }] },
  essay: { type: 'essay', selectors: [{ test: 'id="essay_page"' }, { test: 'id="bber"' }] },
  music: { type: 'music', selectors: [{ test: 'id="anMusic-page"' }] },
  equipment: {
    type: 'equipment',
    selectors: [{ test: 'id="equipment"' }, { test: 'goodthings-item' }],
  },
  fcircle: {
    type: 'fcircle',
    selectors: [{ test: 'fcircle_page' }],
    gate: { config: 'friends_vue.enable', note: 'FcirclePage 由 theme.friends_vue.enable 门控' },
  },
  charts: { type: 'charts（内容驱动，无专属模板）', selectors: [{ test: 'id="posts-chart"' }] },
  todolist: {
    type: 'todolist',
    selectors: [{ test: 'id="todolist-box"' }, { test: 'id="todolist-main"' }],
    note: '主题包 components/page 里没有 TodolistPage，1.6.14 的 todolist.pug 未迁移',
  },
  __default__: {
    type: 'default（无专属模板，只断言正文渲染）',
    selectors: [{ test: 'id="article-container"', requireText: true }],
  },
}

/** tag-residue 检查的标记（基于 Hexo 6/7 + 本主题的模板语法） */
const TAG_RESIDUE = [
  { id: 'hexo-tag-open', re: /\{%/g, label: 'Hexo tag 起标记 {%' },
  { id: 'ejs-open', re: /<%/g, label: 'EJS 模板起标记 <%' },
  { id: 'hexo-render-placeholder', re: /<hexoPostRender/gi, label: 'hexoPostRender 占位' },
  { id: 'hexo-comment', re: /<!--\s*hexo/gi, label: 'hexo 渲染注释' },
  { id: 'title-undefined', re: /<title>[^<]*(?:undefined|NaN)[^<]*<\/title>/gi, label: 'title 含 undefined/NaN' },
  { id: 'page-title-undefined', re: /class="page-title"[^>]*>[^<]*(?:undefined|NaN)/gi, label: 'page-title 含 undefined/NaN' },
]

// ═══════════════════════════════════════════════════════════════════════════
// 1 · 日志与进程
// ═══════════════════════════════════════════════════════════════════════════

let JSON_MODE = false
/** 人读进度：--json 时走 stderr，保证 stdout 是纯 JSON */
function say(...args) {
  if (JSON_MODE) console.error(...args)
  else console.log(...args)
}
function warn(...args) {
  console.error(...args)
}
function fail(message) {
  warn(`\n[accept-migration] 失败：${message}`)
  process.exitCode = 2
  throw new Error(message)
}

/**
 * 统一的外部命令执行：真实 spawnSync，记录 exit code / 耗时 / 输出尾部。
 *
 * 为什么不用 `encoding: 'utf8'`（管道捕获）：
 *   本仓库的 agent 运行在带沙箱的 Windows 环境里，沙箱禁止子进程通过命名管道
 *   回传 stdout（Node `child_process` 默认 `stdio: 'pipe'` 会得到 EPERM）。
 *   所以这里把子进程 stdout/stderr 直接落盘到 `<工作目录>/logs/*.log`，再用
 *   文件读取取尾部。副作用是命令输出不能实时刷屏，但证据完整、可复跑。
 */
function runProcess(cmd, args, options = {}) {
  const cwd = options.cwd || REPO_ROOT
  const startedAt = Date.now()
  say(`\n$ ${[cmd, ...args.map(quoteArg)].join(' ')}   (cwd=${relDisplay(cwd)})`)
  const logDir = options.logDir || ensureLogDir()
  fs.mkdirSync(logDir, { recursive: true })
  processSequence += 1
  const slug = `${String(processSequence).padStart(2, '0')}-${slugify(options.name || cmd)}`
  const stdoutFile = path.join(logDir, `${slug}.out.log`)
  const stderrFile = path.join(logDir, `${slug}.err.log`)
  const stdoutFd = fs.openSync(stdoutFile, 'w')
  const stderrFd = fs.openSync(stderrFile, 'w')
  const spawnOptions = {
    cwd,
    stdio: ['ignore', stdoutFd, stderrFd],
    timeout: options.timeout ?? 15 * 60 * 1000,
    env: { ...process.env, ...(options.env || {}) },
    shell: options.shell ?? false,
    windowsHide: true,
  }
  let result
  try {
    // shell:true 时 Node 会拼命令串；自 20.x 起「args + shell:true」有 DEP0190 警告，
    // 这里显式拼成单个命令行传参，避免警告。
    result = options.shell
      ? spawnSync([cmd, ...args.map(quoteArg)].join(' '), spawnOptions)
      : spawnSync(cmd, args, spawnOptions)
  } finally {
    fs.closeSync(stdoutFd)
    fs.closeSync(stderrFd)
  }
  const durationMs = Date.now() - startedAt
  const stdout = fs.readFileSync(stdoutFile, 'utf8')
  const stderr = fs.readFileSync(stderrFile, 'utf8')
  const exitCode = result.status
  const timedOut = result.error?.code === 'ETIMEDOUT' || (result.error && result.error.code !== 'EPERM' && exitCode === null)
  const entry = {
    command: `${cmd} ${args.join(' ')}`.trim(),
    cwd: relDisplay(cwd),
    exitCode,
    signal: result.signal ?? null,
    timedOut: Boolean(timedOut),
    durationMs,
    ok: exitCode === 0,
    error: result.error ? String(result.error.message || result.error) : null,
    stdoutLog: relDisplay(stdoutFile),
    stderrLog: relDisplay(stderrFile),
    stdoutTail: tailLines(stdout, 40),
    stderrTail: tailLines(stderr, 20),
  }
  const mark = entry.ok ? 'OK' : `EXIT=${exitCode}${entry.timedOut ? ' (超时)' : ''}`
  say(`  → ${mark}  ${(durationMs / 1000).toFixed(1)}s`)
  if (!entry.ok && entry.error) say(`  → ${entry.error}`)
  return { entry, stdout, stderr, stdoutFile, stderrFile }
}

let LOG_DIR = null
let processSequence = 0
function ensureLogDir() {
  if (!LOG_DIR) LOG_DIR = path.join(DEFAULT_OUT_PARENT, '_accept-logs')
  fs.mkdirSync(LOG_DIR, { recursive: true })
  return LOG_DIR
}
function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'command'
}

function quoteArg(value) {
  return /[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value
}
function tailLines(text, count) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((line) => line.length > 0)
  return lines.slice(-count)
}
function relDisplay(target) {
  const relative = path.relative(REPO_ROOT, target)
  return relative === '' ? '.' : relative.startsWith('..') ? target : relative
}

/** 只读解析 .git/HEAD（不调用 git 命令，避免任何写倾向的操作） */
function readGitHead() {
  try {
    const head = readText(path.join(REPO_ROOT, '.git', 'HEAD')).trim()
    if (head.startsWith('ref: ')) {
      const refPath = path.join(REPO_ROOT, '.git', head.slice(5).trim())
      return isFile(refPath) ? readText(refPath).trim().slice(0, 12) : null
    }
    return head.slice(0, 12)
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2 · CLI
// ═══════════════════════════════════════════════════════════════════════════

const USAGE = `
用法: node scripts/accept-migration.mjs [选项]

  --site <dir>      Hexo 站点根目录（含 _config.yml 与 public/），只读
                    默认执行环境变量 ACCEPT_SITE 或 ${DEFAULT_SITE}
  --out <dir>       验收工作目录，默认 .migration-out/accept-<时间戳>
  --reuse           复用已有 migrated/ 与 node_modules（不重跑 migrate/install）
  --skip-build      跳过构建，用现有 dist 检查
  --json            stdout 只输出 JSON 报告（进度信息走 stderr）
  -h, --help        打印本帮助

退出码: 0=全部 PASS；1=有迁移缺口；2=环境/构建失败

示例:
  node scripts/accept-migration.mjs
  node scripts/accept-migration.mjs --site D:/Git-project/xcAnzhiyu
  node scripts/accept-migration.mjs --out .migration-out/accept-latest --reuse --skip-build
`

function parseArgs(argv) {
  const options = {
    site: DEFAULT_SITE,
    out: null,
    reuse: false,
    skipBuild: false,
    json: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const needValue = () => {
      const value = argv[++index]
      if (value === undefined || value.startsWith('--')) fail(`${arg} 缺少参数值`)
      return value
    }
    switch (arg) {
      case '--site': options.site = needValue(); break
      case '--out': options.out = path.resolve(REPO_ROOT, needValue()); break
      case '--reuse': options.reuse = true; break
      case '--skip-build': options.skipBuild = true; break
      case '--json': options.json = true; break
      case '-h':
      case '--help': options.help = true; break
      default:
        if (arg.startsWith('--site=')) options.site = arg.slice(7)
        else if (arg.startsWith('--out=')) options.out = path.resolve(REPO_ROOT, arg.slice(6))
        else fail(`未知参数：${arg}\n${USAGE}`)
    }
  }
  options.site = path.resolve(REPO_ROOT, options.site)
  if (!options.out) options.out = path.join(DEFAULT_OUT_PARENT, `${ACCEPT_PREFIX}${timestampSlug()}`)
  return options
}

function timestampSlug() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 · 文件 / YAML / frontmatter 工具
// ═══════════════════════════════════════════════════════════════════════════

function toPosix(value) {
  return value.split(path.sep).join('/')
}
function readText(file) {
  return fs.readFileSync(file, 'utf8')
}
function exists(file) {
  return fs.existsSync(file)
}
function isFile(file) {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

/** 递归列出文件（相对 root 的 posix 路径），filter 可过滤 */
function walkFiles(root, filter = () => true) {
  const out = []
  ;(function visit(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(abs)
      else if (entry.isFile()) {
        const relative = toPosix(path.relative(root, abs))
        if (filter(relative)) out.push(relative)
      }
    }
  })(root)
  return out
}

/** dist / golden 文件索引：{ files:Set, dirs:Set } */
function buildIndex(root) {
  const files = new Set()
  const dirs = new Set([''])
  for (const relative of walkFiles(root)) {
    files.add(relative)
    const parts = relative.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      dirs.add(parts.slice(0, index).join('/'))
    }
  }
  return { root, files, dirs }
}

/**
 * 把站内 URL 解析成索引里的文件目标。
 * 约定：URL 已经过 normalizeUrl（无 query/hash、已 decodeURIComponent）。
 * 返回 { exists, target }，target 为命中的相对文件路径。
 */
function resolveTarget(index, url) {
  if (!url || url === '/') {
    return { exists: index.files.has('index.html'), target: 'index.html' }
  }
  const clean = url.replace(/^\/+/, '').replace(/\/+$/, '')
  if (clean === '') return { exists: index.files.has('index.html'), target: 'index.html' }
  const candidates = []
  if (index.dirs.has(clean)) candidates.push(`${clean}/index.html`)
  if (index.files.has(clean)) candidates.push(clean)
  if (index.files.has(`${clean}.html`)) candidates.push(`${clean}.html`)
  for (const candidate of candidates) {
    if (index.files.has(candidate)) return { exists: true, target: candidate }
  }
  return { exists: false, target: null }
}

/**
 * 把 HTML 里的 URL 归一化：
 *   - 去掉 #fragment / ?query（存在性判断不需要）；
 *   - 协议相对 //host、外链（http:、mailto: 等绝对 scheme）返回 null；
 *   - 以 / 开头 → 站内绝对；否则按页面所在目录补全；
 *   - decodeURIComponent（磁盘上是原始 UTF-8 文件名）。
 * 保留伪协议形态（/javascript:、/mailto:）：它们以 / 开头，本身就是坏 URL，要报出来。
 */
function normalizeUrl(raw, baseDir) {
  if (raw == null) return null
  let value = String(raw).trim()
  if (value === '' || value === '#' || value.startsWith('#')) return null
  value = value.split('#')[0].split('?')[0]
  if (value === '') return null
  if (value.startsWith('//')) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^\/(?:javascript|mailto|tel|data):/i.test(value)) return null
  if (!value.startsWith('/')) {
    // 相对 URL：按页面所在目录补全。path.posix.resolve 会吃掉结尾的 /，
    // 而 /about/ 与 /about 是两个不同目标（前者要 index.html），必须保留。
    const hadTrailingSlash = value.endsWith('/')
    try {
      value = path.posix.resolve(baseDir || '/', value)
    } catch {
      return null
    }
    if (hadTrailingSlash && !value.endsWith('/')) value += '/'
  }
  try {
    value = decodeURIComponent(value)
  } catch {
    /* 非法 % 转义：保留原样，后续解析自然失败并报出来 */
  }
  value = value.replace(/\/{2,}/g, '/')
  if (!value.startsWith('/')) value = `/${value}`
  return value
}

function decodeEntities(text) {
  return String(text)
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ')
}

/** 最小 frontmatter 解析：支持标量 + 行内数组 + 缩进列表；只求够用不求完整 YAML */
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { data: {}, body: text }
  const data = {}
  let currentListKey = null
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim() || line.trim().startsWith('#')) continue
    const listItem = /^\s*-\s+(.*)$/.exec(line)
    if (listItem && currentListKey) {
      data[currentListKey].push(unquoteScalar(listItem[1]))
      continue
    }
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!pair) continue
    const key = pair[1]
    const rawValue = pair[2].trim()
    if (rawValue === '') {
      // 可能是缩进列表的开头（categories: / tags:），也可能就是空值
      data[key] = []
      currentListKey = key
      continue
    }
    currentListKey = null
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      data[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map((item) => unquoteScalar(item.trim()))
        .filter((item) => item.length > 0)
    } else {
      data[key] = unquoteScalar(rawValue)
    }
  }
  // 空列表其实可能是空标量：categories: 这种在本文档里就是「无分类」
  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key]) && data[key].length === 0) data[key] = []
  }
  return { data, body: text.slice(match[0].length) }
}

function unquoteScalar(value) {
  const trimmed = String(value).trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** 读 YAML：优先用仓库根的 yaml 包；缺失时退化成只覆盖本脚本需要的正则提取 */
let yamlModulePromise
async function loadYamlWithFallback(file) {
  const text = readText(file)
  if (!yamlModulePromise) {
    yamlModulePromise = import('yaml')
      .then((mod) => mod.parse ?? mod.default?.parse ?? null)
      .catch(() => null)
  }
  const parse = await yamlModulePromise
  if (typeof parse === 'function') {
    try {
      return { data: parse(text), degraded: false }
    } catch (error) {
      warn(`[accept-migration] yaml 解析失败（${file}）：${error.message}，降级为正则提取`)
    }
  }
  return { data: fallbackConfigExtract(text), degraded: true }
}

/** yaml 包不可用时的最小提取：本验收只用得到这些键 */
function fallbackConfigExtract(text) {
  const pick = (re) => {
    const match = re.exec(text)
    return match ? unquoteScalar(match[1]) : null
  }
  return {
    permalink: pick(/^permalink:\s*(.+)$/m),
    source_dir: pick(/^source_dir:\s*(.+)$/m) || 'source',
    public_dir: pick(/^public_dir:\s*(.+)$/m) || 'public',
    feed: { path: [...text.matchAll(/^feed:[\s\S]*?path:\s*\n((?:\s*-\s*.+\n)+)/m)].flatMap((m) =>
      m[1].split('\n').map((line) => line.replace(/^\s*-\s*/, '').trim()).filter(Boolean),
    ) },
    sitemap: { path: pick(/^sitemap:\s*\n\s*path:\s*(.+)$/m) },
    baidusitemap: { path: pick(/^baidusitemap:\s*\n\s*path:\s*(.+)$/m) },
    search: { path: pick(/^search:\s*\n\s*path:\s*(.+)$/m) },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4 · 源站信息：_config.yml / 内容清单 / golden
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 汇总源站（只读）里验收需要的事实：
 *   - _config.yml 顶层配置（permalink / feed / sitemap / 生成器开关）
 *   - _config.anzhiyu.yml 里评论/友链朋友圈/安全跳转等开关
 *   - posts（frontmatter abbrlink/permalink/date/title/tags/categories）
 *   - pages（source 下除 _posts 外的 *.md）
 */
async function collectSourceFacts(siteDir) {
  const hexoYml = path.join(siteDir, '_config.yml')
  const themeYml = path.join(siteDir, '_config.anzhiyu.yml')
  if (!isFile(hexoYml)) fail(`--site 不是有效 Hexo 站点：缺少 ${hexoYml}`)
  const hexo = await loadYamlWithFallback(hexoYml)
  const theme = isFile(themeYml) ? await loadYamlWithFallback(themeYml) : { data: {}, degraded: false }
  const config = hexo.data || {}
  const themeConfig = theme.data || {}
  const sourceDir = path.join(siteDir, String(config.source_dir || 'source'))
  const publicDir = path.join(siteDir, String(config.public_dir || 'public'))
  if (!fs.existsSync(sourceDir)) fail(`源站缺少 source 目录：${sourceDir}`)

  const postsDir = path.join(sourceDir, '_posts')
  const posts = walkFiles(postsDir, (name) => name.toLowerCase().endsWith('.md')).map((relative) => {
    const abs = path.join(postsDir, relative)
    const frontmatter = parseFrontmatter(readText(abs))
    const slug = path.posix.basename(relative).replace(/\.md$/i, '')
    return {
      relative: toPosix(path.relative(siteDir, abs)),
      dir: path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative),
      slug,
      fm: frontmatter.data,
    }
  })

  const pages = walkFiles(sourceDir, (name) => {
    if (!name.toLowerCase().endsWith('.md')) return false
    if (name.startsWith('_')) return false
    if (name.startsWith('_posts/')) return false
    if (name.split('/').some((part) => part.startsWith('_') || part.startsWith('.'))) return false
    return true
  }).map((relative) => {
    const abs = path.join(sourceDir, relative)
    const frontmatter = parseFrontmatter(readText(abs))
    return { relative, fm: frontmatter.data, body: frontmatter.body }
  })

  return {
    siteDir,
    publicDir,
    goldenAvailable: fs.existsSync(publicDir),
    config,
    themeConfig,
    configDegraded: hexo.degraded || theme.degraded,
    sourceDir,
    posts,
    pages,
  }
}

/** 源站生成器/插件开关（用于给缺失产物归属） */
function pluginFacts(facts) {
  const config = facts.config || {}
  const theme = facts.themeConfig || {}
  const feed = config.feed || {}
  const feedPaths = normalizePathList(feed.path).length > 0
    ? normalizePathList(feed.path)
    : normalizePathList(feed.type).map((type) => (type === 'atom' ? 'atom.xml' : `${type}.xml`))
  const envelope = config.envelope_comment || {}
  const bangumi = config.bangumi || {}
  const safeGo = config.hexo_safego || {}
  const search = config.search || {}
  const sitemap = config.sitemap || {}
  const baidusitemap = config.baidusitemap || {}
  const baiduUrls = config.baidu_url_submit || {}
  const base = String(safeGo.general?.enable_base64_encode ?? '')
  // 源站 _config.yml 里 baidusitemap: 后面紧跟的 path: 是顶格写的（缩进丢了），
  // yaml 会把它解析成顶层 path 键，这里做一次兼容回退。
  const topLevelPath = typeof config.path === 'string' ? config.path : null
  const baidusitemapPath = baidusitemap.path || (topLevelPath?.endsWith('.xml') ? topLevelPath : null)
  return {
    feed: { paths: feedPaths.length ? feedPaths : ['atom.xml', 'rss2.xml'], type: feed.type ?? null },
    sitemapPath: sitemap.path || null,
    baidusitemapPath,
    searchPath: search.path || null,
    baiduUrlsPath: baiduUrls.path || null,
    pluginPages: [
      {
        url: `/${String(envelope.path || 'comments').replace(/^\/+|\/+$/g, '')}/`,
        owner: 'hexo-butterfly-envelope（envelope_comment.enable）',
        enabled: envelope.enable === true || envelope.enable === 'true',
        configKey: 'envelope_comment.enable',
      },
      {
        url: `/${String(bangumi.path || 'bangumis').replace(/^\/+|\/+$/g, '')}/`,
        owner: 'hexo-bangumi（bangumi.enable）',
        enabled: bangumi.enable === true || bangumi.enable === 'true',
        configKey: 'bangumi.enable',
      },
      {
        url: `/${String(safeGo.security?.html_file_name || 'go.html').replace(/^\/+/, '')}`,
        owner: `hexo-safego（hexo_safego.general.enable；base64=${base || '?'}）`,
        enabled: safeGo.general?.enable === true || safeGo.general?.enable === 'true',
        configKey: 'hexo_safego.general.enable',
      },
    ],
    theme: {
      friendsVueEnable:
        theme.friends_vue?.enable === true || theme.friends_vue?.enable === 'true' || null,
      friendsLitePresent: theme.friends_lite !== undefined,
    },
  }
}

function normalizePathList(value) {
  if (value == null) return []
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  return [String(value).trim()].filter(Boolean)
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 · 独立重算期望路由
// ═══════════════════════════════════════════════════════════════════════════

function pad2(value) {
  return String(value).padStart(2, '0')
}

function parseFrontmatterDate(value) {
  if (!value) return null
  // 支持 "2025-07-14 16:57:18" / "2025-07-14T16:57:18+08:00" / Date 对象字符串
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(value))
  if (!match) return null
  return {
    year: match[1],
    month: pad2(match[2]),
    day: pad2(match[3]),
    hour: match[4] ?? '00',
    minute: match[5] ?? '00',
    second: match[6] ?? '00',
  }
}

function normalizeRoute(route) {
  let value = String(route || '/').trim()
  if (!value.startsWith('/')) value = `/${value}`
  value = value.replace(/\/{2,}/g, '/')
  return value
}

function routeToTarget(route) {
  const normalized = normalizeRoute(route)
  if (normalized.endsWith('/')) return `${normalized}index.html`.replace(/^\/+/, '')
  return normalized.replace(/^\/+/, '')
}

/** 静态站 HTML 相对路径 → 站点 URL：index.html 归一到目录，go.html 这类保留 .html */
function htmlPathToRoute(htmlPath) {
  if (/^index\.html$/i.test(htmlPath)) return '/'
  if (/\/index\.html$/i.test(htmlPath)) return `/${htmlPath.replace(/index\.html$/i, '')}`
  return `/${htmlPath}`
}

/** 按 Hexo permalink 模板渲染单篇文章的 URL */
function renderPostRoute(post, permalinkTemplate) {
  const fm = post.fm
  if (typeof fm.permalink === 'string' && fm.permalink.trim() && fm.permalink.trim() !== 'false') {
    return { route: normalizeRoute(fm.permalink), source: 'frontmatter.permalink' }
  }
  const template = String(permalinkTemplate || ':year/:month/:day/:title/')
  const date = parseFrontmatterDate(fm.date)
  const abbrlink = fm.abbrlink == null ? '' : String(fm.abbrlink)
  let route = template
    .replace(/:abbrlink/g, abbrlink)
    .replace(/:year/g, date?.year ?? '')
    .replace(/:month/g, date?.month ?? '')
    .replace(/:day/g, date?.day ?? '')
    .replace(/:i_month/g, String(Number(date?.month ?? '0')))
    .replace(/:i_day/g, String(Number(date?.day ?? '0')))
    .replace(/:hour/g, date?.hour ?? '')
    .replace(/:minute/g, date?.minute ?? '')
    .replace(/:second/g, date?.second ?? '')
    .replace(/:title/g, post.slug)
  const unresolved = route.match(/:[a-z_]+/gi)
  return {
    route: normalizeRoute(route),
    source: 'config.permalink',
    unresolved: unresolved ? unresolved.join(',') : null,
  }
}

/** 源站页面（source 下 *.md 的 page）的 URL */
function renderPageRoute(page) {
  const fm = page.fm
  if (typeof fm.permalink === 'string' && fm.permalink.trim() && fm.permalink.trim() !== 'false') {
    return { route: normalizeRoute(fm.permalink), source: 'frontmatter.permalink' }
  }
  const relative = page.relative
  if (path.posix.basename(relative) === 'index.md') {
    const dir = path.posix.dirname(relative)
    return { route: dir === '.' ? '/' : `/${dir}/`, source: 'source path/index.md' }
  }
  const withoutExt = relative.replace(/\.md$/i, '')
  return { route: `/${withoutExt}.html`, source: 'source path/*.md（pretty_urls.trailing_html）' }
}

/**
 * routes 检查 ①：不读 migration-report.json，直接从源站配置 + frontmatter 重算
 * 每一篇文章 / 每一个独立页面的期望 URL，逐条断言 dist 有对应文件。
 */
function checkIndependentRoutes(facts, distIndex) {
  const permalinkTemplate = facts.config?.permalink || ':year/:month/:day/:title/'
  const expected = []
  for (const post of facts.posts) {
    const rendered = renderPostRoute(post, permalinkTemplate)
    expected.push({
      kind: 'post',
      source: post.relative,
      route: rendered.route,
      routeFrom: rendered.source,
      unresolved: rendered.unresolved,
      target: routeToTarget(rendered.route),
    })
  }
  for (const page of facts.pages) {
    const rendered = renderPageRoute(page)
    const isIndex = path.posix.basename(page.relative) === 'index.md'
    expected.push({
      kind: 'page',
      source: page.relative,
      route: rendered.route,
      routeFrom: rendered.source,
      pageType: page.fm.type || (isIndex ? 'default' : null),
      target: routeToTarget(rendered.route),
    })
  }
  const present = []
  const missing = []
  for (const item of expected) {
    if (distIndex.files.has(item.target)) present.push(item)
    else missing.push(item)
  }
  return { permalinkTemplate, expected, present, missing }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6 · HTML 站内引用扫描
// ═══════════════════════════════════════════════════════════════════════════

const ATTR_RE = /(?:^|[\s"'/])(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
const PJSX_RE = /pjax\.loadUrl\(\s*(?:"|'|&quot;|&#34;)(.*?)(?:"|'|&quot;|&#34;)\s*\)/gi
const SCRIPT_BODY_RE = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi
const STYLE_BODY_RE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi

/**
 * 去掉 <script>/<style> 的**内联正文**但保留开标签：
 *   - 保留开标签 → 仍能扫到 <script src="/js/main.js">；
 *   - 去掉正文 → 不会把前端模板字符串（如 href="${array[i].url}"）当成站内链接。
 */
function stripInlineScriptBodies(html) {
  return html
    .replace(SCRIPT_BODY_RE, (_match, open, _body, close) => `${open}${close}`)
    .replace(STYLE_BODY_RE, (_match, open, _body, close) => `${open}${close}`)
}

/**
 * 找出代码块 / 行内代码在 HTML 里的字符区间。
 * 代码块里的 `src="..."` / `href="..."` 是**被示例出来的文本**（highlight.js 只转义
 * 了 < >，引号仍是字面量），不能当真实链接扫描，否则 94 页会冒出一堆
 * /posts/pXXXX/<span class="variable">$url</span> 这类噪声。
 */
function collectCodeRanges(html) {
  const ranges = []
  const patterns = [
    /<figure\b[^>]*class="[^"]*highlight[^"]*"[\s\S]*?<\/figure>/gi,
    /<code\b[^>]*>[\s\S]*?<\/code>/gi,
    /<pre\b[^>]*>[\s\S]*?<\/pre>/gi,
  ]
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(html))) {
      ranges.push([match.index, match.index + match[0].length])
    }
  }
  return ranges
}
function isInsideRanges(ranges, index) {
  for (const [start, end] of ranges) {
    if (index >= start && index <= end) return true
  }
  return false
}

/**
 * 扫描一个静态站目录下所有 HTML 的站内引用。
 * 返回 refs: Map<normalizedUrl, { pages, kinds, rawValues, rawAbsDoubleQuoted, firstPage, firstContext }>
 *   kinds: 'attr-abs' | 'attr-rel' | 'js-nav'
 *   rawAbsDoubleQuoted 用来复算 Lead 一次性探针的口径（双引号 + 绝对路径）。
 * 另外返回 ignoredCodeSamples：代码块里被示例出来的 href/src（只计数，不算缺口）。
 */
function scanInternalRefs(root) {
  const htmlFiles = walkFiles(root, (name) => name.toLowerCase().endsWith('.html'))
  const refs = new Map()
  const ignoredCodeSamples = []
  const add = (url, page, kind, rawValue, context, rawAbsDoubleQuoted) => {
    let bucket = refs.get(url)
    if (!bucket) {
      bucket = {
        pages: new Set(),
        kinds: new Set(),
        rawValues: new Set(),
        rawAbsDoubleQuoted: new Set(),
        firstPage: page,
        firstContext: context || null,
      }
      refs.set(url, bucket)
    }
    bucket.pages.add(page)
    bucket.kinds.add(kind)
    bucket.rawValues.add(rawValue)
    if (rawAbsDoubleQuoted) bucket.rawAbsDoubleQuoted.add(rawAbsDoubleQuoted)
  }
  for (const page of htmlFiles) {
    const rawHtml = readText(path.join(root, page))
    const html = stripInlineScriptBodies(rawHtml)
    const codeRanges = collectCodeRanges(html)
    const pageDir = `/${path.posix.dirname(page) === '.' ? '' : `${path.posix.dirname(page)}/`}`
    const baseDir = pageDir === '/' ? '/' : pageDir
    ATTR_RE.lastIndex = 0
    let match
    while ((match = ATTR_RE.exec(html))) {
      const isDoubleQuoted = match[2] !== undefined
      const rawValue = decodeEntities(isDoubleQuoted ? match[2] : match[3])
      const inCode = isInsideRanges(codeRanges, match.index)
      if (inCode) {
        ignoredCodeSamples.push({ page, rawValue, kind: 'code-sample' })
        continue
      }
      const url = normalizeUrl(rawValue, baseDir)
      if (!url) continue
      const kind = rawValue.startsWith('/') ? 'attr-abs' : 'attr-rel'
      // Lead 口径：双引号 + 以 / 开头 + 去掉 #fragment，原样 URL（不 decode）
      const leadRaw = rawValue.startsWith('/') && isDoubleQuoted ? rawValue.split('#')[0] : null
      add(url, page, kind, rawValue, contextSnippet(html, match.index), leadRaw)
    }
    PJSX_RE.lastIndex = 0
    while ((match = PJSX_RE.exec(html))) {
      const rawValue = decodeEntities(match[1])
      if (isInsideRanges(codeRanges, match.index)) {
        ignoredCodeSamples.push({ page, rawValue, kind: 'code-sample' })
        continue
      }
      const url = normalizeUrl(rawValue, baseDir)
      if (!url) continue
      add(url, page, 'js-nav', rawValue, contextSnippet(html, match.index), null)
    }
  }
  return { root, htmlFiles, refs, ignoredCodeSamples }
}

function contextSnippet(html, index) {
  const start = Math.max(0, index - 90)
  const end = Math.min(html.length, index + 90)
  return html
    .slice(start, end)
    .replace(/\s+/g, ' ')
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .trim()
}

// ═══════════════════════════════════════════════════════════════════════════
// 7 · 缺口分类 / 豁免 / 归属
// ═══════════════════════════════════════════════════════════════════════════

/**
 * URL 分类器。输入为 normalizeUrl 之后的站内路径（已 decode）。
 * 分类与 O-* 归属说明：
 *   theme-asset      主题包/站点的 js、css、img 等静态资源缺失
 *   page-missing     Hexo 插件生成的页面（/comments/ /bangumis/ /go.html）
 *   taxonomy-slug    分类/标签页 slug 不一致（如 "Arch Linux" vs "Arch-Linux"）
 *   old-permalink    旧 permalink 形态（/2025/07/14/…/），当前配置是 posts/p:abbrlink/
 *   placeholder      占位 CSS（/css/index.css：Hexo 把主题 stylus 编译成这个路径）
 *   feed             atom.xml / rss2.xml
 *   sitemap          sitemap.xml / baidusitemap.xml / baidu_urls.txt
 *   search-index     search.xml（本地搜索索引）
 *   pseudo-scheme    伪协议被拼成站内路径（/mailto: /javascript: /tel:）
 *   other            兜底
 */
function classifyUrl(url) {
  const decoded = url
  if (/^\/(?:javascript|mailto|tel|data):/i.test(decoded)) return 'pseudo-scheme'
  if (/^\/atom\.xml$/i.test(decoded) || /^\/rss2?\.xml$/i.test(decoded) || /^\/feed\//i.test(decoded)) return 'feed'
  if (/^\/(?:sitemap|baidusitemap)\.xml$/i.test(decoded) || /^\/baidu_urls\.txt$/i.test(decoded)) return 'sitemap'
  if (/^\/search\.xml$/i.test(decoded)) return 'search-index'
  if (/^\/css\/index\.css$/i.test(decoded)) return 'placeholder'
  if (/^\/(?:js|css|img|fonts|anzhiyu|assets)\//i.test(decoded)) return 'theme-asset'
  if (/^\/(?:categories|tags)\//i.test(decoded)) return 'taxonomy-slug'
  if (/^\/\d{4}\/\d{1,2}\/\d{1,2}\//.test(decoded)) return 'old-permalink'
  if (/^\/(?:comments|bangumis|go\.html)\/?$/i.test(decoded)) return 'page-missing'
  return 'other'
}

/** 分类 → 归属任务标签（报告里给人看的） */
const CLASS_OWNER = {
  'theme-asset': '主题静态资源迁移（复制/打包主题 source/js、css、img）',
  'page-missing': 'Hexo 插件生成页（envelope / bangumi / safego）→ Astro 侧补生成器',
  'taxonomy-slug': '主题分类/标签链接生成（slugize + 完整分类路径）',
  'old-permalink': '主题 URL 归一化（当前 permalink 是 posts/p:abbrlink/，组件仍产出旧形态）',
  placeholder: '占位 CSS 引用（/css/index.css）：删除引用或补等价产物',
  feed: 'feed 生成（hexo-generator-feed 等价物）',
  sitemap: 'sitemap / 百度提交产物生成',
  'search-index': '本地搜索索引生成（search.xml）',
  'pseudo-scheme': '主题 URL 归一化（mailto:/javascript: 被拼成站内路径）',
  other: '人工复核',
  'route-missing': '迁移脚本/主题路由（源站有、迁移未产出）',
  'route-extra': '迁移新增页面（golden 没有）：确认是否预期',
  'page-type': '主题页面模板 / 页面配置迁移',
  identity: '主题 Head/SEO 与路由一致性',
}

/** 豁免匹配：返回命中的 whitelist 项或 null */
function matchWhitelist(url) {
  for (const entry of WHITELIST) {
    if (entry.kind === 'exact' && url === entry.pattern) return entry
    if (entry.kind === 'prefix' && url.startsWith(entry.pattern)) return entry
    if (entry.kind === 'regex' && new RegExp(entry.pattern).test(url)) return entry
  }
  return null
}

/**
 * 把一条缺失引用归到三栏之一：
 *   - inherited：golden 也缺、且 golden 自己也引用了（源站既有死链，最硬的证据，优先）
 *   - whitelisted：命中豁免表
 *   - migration-gap：其余
 */
function attributeMissing(url, goldenMissing) {
  if (goldenMissing.has(url)) return { status: 'inherited', reason: 'golden（源站 public）同样缺失且引用' }
  const whitelist = matchWhitelist(url)
  if (whitelist) return { status: 'whitelisted', whitelistId: whitelist.id, reason: whitelist.reason }
  return { status: 'migration-gap', reason: 'golden 有该产物，或迁移新造了该 URL' }
}

// ═══════════════════════════════════════════════════════════════════════════
// 8 · 各项检查
// ═══════════════════════════════════════════════════════════════════════════

function makeCheck(id, title) {
  return { id, title, status: 'PASS', counts: {}, gaps: [], samples: [], evidence: {} }
}

/** 依据 gaps 状态汇总一个 check 的 status/counts */
function finalizeCheck(check, { passNote } = {}) {
  const migration = check.gaps.filter((gap) => gap.status === 'migration-gap')
  const inherited = check.gaps.filter((gap) => gap.status === 'inherited')
  const whitelisted = check.gaps.filter((gap) => gap.status === 'whitelisted')
  check.counts.gapTotal = migration.length
  check.counts.inherited = inherited.length
  check.counts.whitelisted = whitelisted.length
  check.status = migration.length === 0 ? 'PASS' : 'FAIL'
  if (check.status === 'PASS' && passNote) check.note = passNote
  return check
}

/** build 检查：用 build 阶段证据 + dist 页数/根级产物 */
function checkBuild(buildPhase, distDir) {
  const check = makeCheck('build', '构建：exit=0 + dist HTML 页数 + 根级产物')
  const htmlFiles = walkFiles(distDir, (name) => name.toLowerCase().endsWith('.html'))
  const rootFiles = fs.readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
  const buildStdout = buildPhase.stdoutTail || []
  check.counts = {
    exitCode: buildPhase.exitCode ?? null,
    durationMs: buildPhase.durationMs ?? null,
    htmlFiles: htmlFiles.length,
    rootFiles: rootFiles.length,
  }
  check.evidence = {
    buildCommand: buildPhase.command ?? null,
    buildCwd: buildPhase.cwd ?? null,
    phaseStatus: buildPhase.status ?? null,
    stdoutTail: buildStdout.slice(-12),
    rootFiles,
    pageCountLine: buildStdout.find((line) => /page\(s\) built|pages? built/i.test(line)) ?? null,
  }
  if (!buildPhase.ok) {
    check.gaps.push({
      status: 'migration-gap',
      classification: 'other',
      title: '构建失败',
      detail: `build 退出码 ${buildPhase.exitCode}${buildPhase.timedOut ? '（超时）' : ''}`,
      owner: CLASS_OWNER.other,
    })
  }
  check.status = buildPhase.ok && htmlFiles.length > 0 ? 'PASS' : 'FAIL'
  return check
}

/** routes 检查 */
function checkRoutes(facts, plugins, distDir, distIndex, goldenDir, goldenHtml) {
  const check = makeCheck('routes', '路由：独立重算期望 URL + golden 清单差集')
  const independent = checkIndependentRoutes(facts, distIndex)

  // ① 独立重算（posts + pages）
  for (const item of independent.missing) {
    check.gaps.push({
      status: 'migration-gap',
      classification: 'route-missing',
      url: item.route,
      target: item.target,
      source: item.source,
      kind: item.kind,
      routeFrom: item.routeFrom,
      owner: CLASS_OWNER['route-missing'],
    })
  }
  // ② golden 97 HTML vs dist 94 HTML
  const goldenAvailable = (goldenHtml || []).length > 0
  const goldenEntries = goldenAvailable ? goldenHtml : []
  const distEntries = walkFiles(distDir, (name) => name.toLowerCase().endsWith('.html'))
  const distSet = new Set(distEntries)
  const goldenSet = new Set(goldenEntries)
  const missing = goldenEntries.filter((entry) => !distSet.has(entry))
  const extra = distEntries.filter((entry) => !goldenSet.has(entry))
  const pluginRoutes = new Map(plugins.pluginPages.map((item) => [item.url, item]))
  if (goldenAvailable) {
    for (const htmlPath of missing) {
      const route = htmlPathToRoute(htmlPath)
      const plugin = pluginRoutes.get(route)
      check.gaps.push({
        status: 'migration-gap',
        classification: plugin ? 'page-missing' : 'route-missing',
        url: route,
        goldenFile: htmlPath,
        plugin: plugin ? plugin.owner : null,
        pluginEnabled: plugin ? plugin.enabled : null,
        owner: plugin ? CLASS_OWNER['page-missing'] : CLASS_OWNER['route-missing'],
      })
    }
    for (const htmlPath of extra) {
      check.gaps.push({
        status: 'migration-gap',
        classification: 'route-extra',
        url: htmlPathToRoute(htmlPath),
        goldenFile: null,
        detail: '迁移产物多出的页面（golden 没有）',
        owner: CLASS_OWNER['route-extra'],
      })
    }
  }
  check.counts = {
    permalinkTemplate: independent.permalinkTemplate,
    postsExpected: facts.posts.length,
    pagesExpected: facts.pages.length,
    routesExpected: independent.expected.length,
    routesPresent: independent.present.length,
    independentMissing: independent.missing.length,
    goldenHtml: goldenEntries.length,
    distHtml: distEntries.length,
    goldenMissing: missing.length,
    distExtra: extra.length,
    matched: goldenEntries.length - missing.length,
  }
  check.evidence = {
    goldenDir: relDisplay(goldenDir),
    goldenAvailable,
    goldenMissingPageAttribution: missing.map((htmlPath) => {
      const plugin = pluginRoutes.get(htmlPathToRoute(htmlPath))
      return {
        goldenFile: htmlPath,
        plugin: plugin ? plugin.owner : null,
        pluginConfigKey: plugin ? plugin.configKey : null,
        pluginEnabled: plugin ? plugin.enabled : null,
      }
    }),
    extraPages: extra,
    independentSamples: independent.expected.slice(0, 6).map((item) => ({
      kind: item.kind,
      source: item.source,
      route: item.route,
      routeFrom: item.routeFrom,
      exists: !independent.missing.includes(item),
    })),
    pageCountDelta: goldenEntries.length - distEntries.length,
  }
  // 94 vs 97 的差异归属（写进报告）
  check.note = goldenAvailable
    ? `golden ${goldenEntries.length} 页 vs dist ${distEntries.length} 页，差 ${goldenEntries.length - distEntries.length} 页：` +
      (missing.length
        ? missing
            .map((htmlPath) => {
              const plugin = pluginRoutes.get(htmlPathToRoute(htmlPath))
              return plugin ? `${htmlPath}（${plugin.owner}，配置 ${plugin.configKey}=${plugin.enabled}）` : htmlPath
            })
            .join('；')
        : '无')
    : 'golden public/ 不存在，跳过 golden 清单差集'
  return finalizeCheck(check)
}

/** links 检查：核心缺口清单 */
function checkLinks(scan, distIndex, goldenDir, goldenScan, goldenIndex) {
  const check = makeCheck('links', '链接：dist 全部站内 href/src → 文件系统目标')
  const goldenMissing = new Set()
  for (const url of goldenScan.refs.keys()) {
    if (!resolveTarget(goldenIndex, url).exists) goldenMissing.add(url)
  }
  const missing = []
  // Lead 一次性探针口径：双引号 + 以 / 开头 + 去 fragment，按**原始 URL 字符串**去重
  //（所以 %E6%95%99%E7%A8%8B/... 与 教程/... 会被算成两个目标，这是它 70 的来源之一）。
  const leadStyleMissing = new Set()
  for (const [url, bucket] of scan.refs) {
    if (resolveTarget(distIndex, url).exists) continue
    for (const raw of bucket.rawAbsDoubleQuoted) leadStyleMissing.add(raw)
    const classification = classifyUrl(url)
    const attribute = attributeMissing(url, goldenMissing)
    const gap = {
      url,
      classification,
      status: attribute.status,
      pages: bucket.pages.size,
      kinds: [...bucket.kinds].sort(),
      // 404.html 会引用全站资源，作为「来源页」没信息量；优先报首页
      samplePage: bucket.pages.has('index.html') ? 'index.html' : bucket.firstPage,
      sampleContext: bucket.firstContext,
      owner: CLASS_OWNER[classification] || CLASS_OWNER.other,
    }
    if (attribute.whitelistId) gap.whitelistId = attribute.whitelistId
    if (attribute.status === 'inherited') {
      gap.note = '源站 golden 同样缺失且引用；登记为源站既有问题（inherited），不算迁移缺陷'
    }
    if (classification === 'taxonomy-slug') {
      gap.suggestion = suggestTaxonomyUrl(url, goldenDir)
    }
    if (classification === 'old-permalink') {
      gap.suggestion = '改用当前 permalink 模板 posts/p:abbrlink/ 生成链接；源站 vercel.json/netlify.toml 无 redirect 规则'
    }
    missing.push(gap)
  }
  const byClassification = groupCount(missing, (gap) => gap.classification)
  const byStatus = groupCount(missing, (gap) => gap.status)
  check.gaps = missing
  check.counts = {
    htmlFiles: scan.htmlFiles.length,
    distinctInternalTargets: scan.refs.size,
    distinctJSNavTargets: [...scan.refs.values()].filter((bucket) => bucket.kinds.has('js-nav')).length,
    missingDistinct: missing.length,
    missingReferences: missing.reduce((total, gap) => total + gap.pages, 0),
    ignoredCodeSamples: (scan.ignoredCodeSamples || []).length,
    leadStyleAbsoluteAttrMissing: leadStyleMissing.size,
    leadReference: LEAD_REFERENCE.absoluteAttrMissingTargets,
    leadReconciled: leadStyleMissing.size === LEAD_REFERENCE.absoluteAttrMissingTargets,
    byClassification,
    byStatus,
  }
  check.evidence = {
    goldenAvailable: goldenScan.htmlFiles.length > 0,
    goldenMissingDistinct: goldenMissing.size,
    goldenMissingList: [...goldenMissing].sort(),
    leadStyleMissingList: [...leadStyleMissing].sort(),
    ignoredCodeSampleSamples: (scan.ignoredCodeSamples || []).slice(0, 10).map((item) => ({
      page: item.page,
      rawValue: item.rawValue,
    })),
    reconciliation:
      `Lead 一次性探针（双引号 + 绝对路径口径）= ${LEAD_REFERENCE.absoluteAttrMissingTargets} 个缺失目标；` +
      `本脚本按同一口径复算 = ${leadStyleMissing.size}（${leadStyleMissing.size === LEAD_REFERENCE.absoluteAttrMissingTargets ? '一致' : '有差异，见 leadStyleMissingList'}）；` +
      `本脚本额外解析相对路径与 pjax.loadUrl、并按 decode 后 URL 归并后 missingDistinct = ${missing.length}；` +
      `代码块内被示例出来的 href/src 共 ${(scan.ignoredCodeSamples || []).length} 处已排除`,
  }
  check.samples = missing.slice(0, 12).map((gap) => ({
    url: gap.url,
    classification: gap.classification,
    status: gap.status,
    pages: gap.pages,
    samplePage: gap.samplePage,
  }))
  return finalizeCheck(check)
}

function suggestTaxonomyUrl(url, goldenDir) {
  // /categories/教程/Arch Linux/ → golden 里真实目录是 /categories/教程/Arch-Linux/
  const parts = url.split('/').filter(Boolean)
  const slugged = parts.map((part) => part.replace(/\s+/g, '-'))
  const guess = `/${slugged.join('/')}/`
  const lastSlug = slugged[slugged.length - 1]
  try {
    const categoriesRoot = path.join(goldenDir, 'categories')
    if (exists(categoriesRoot)) {
      const candidates = walkFiles(categoriesRoot, (file) => /\/index\.html$/i.test(file))
        .map((file) => `/${path.posix.dirname(file)}/`)
        .filter((candidate) => {
          const segments = candidate.split('/').filter(Boolean)
          return segments[segments.length - 1] === lastSlug
        })
      if (candidates.length === 1) return `golden 真实分类页：${candidates[0]}（当前链接缺父级或 slug 不一致）`
      if (candidates.length > 1) {
        return `golden 里有多个同名末级分类：${candidates.slice(0, 3).join(' / ')}（需按完整分类路径生成）`
      }
    }
  } catch {
    /* ignore */
  }
  return `${guess}（按空格→"-" slugize 推断，需与主题 taxonomy 生成逻辑对齐）`
}

/** assets 检查：静态资源 404 + golden 静态资源清单对比 */
function checkAssets(linksCheck, distIndex, goldenDir) {
  const check = makeCheck('assets', '资源：静态资源后缀 404 清单 + golden 目录清单')
  const assetGaps = linksCheck.gaps.filter((gap) => isStaticTarget(gap.url))
  check.gaps = assetGaps.map((gap) => ({ ...gap }))
  const inventory = []
  for (const dir of ASSET_DIRS) {
    const goldenRoot = path.join(goldenDir, dir)
    const distRoot = path.join(distIndex.root, dir)
    const goldenFiles = exists(goldenRoot) ? walkFiles(goldenRoot) : []
    const distFiles = exists(distRoot) ? walkFiles(distRoot) : []
    const distSet = new Set(distFiles)
    const missingFiles = goldenFiles.filter((file) => !distSet.has(file))
    inventory.push({
      dir,
      goldenFiles: goldenFiles.length,
      distFiles: distFiles.length,
      missingFiles: missingFiles.length,
      missingSample: missingFiles.slice(0, 8),
    })
  }
  const byClass = groupCount(assetGaps, (gap) => gap.classification)
  const byStatus = groupCount(assetGaps, (gap) => gap.status)
  check.counts = {
    assetDirectionsChecked: ASSET_DIRS.length,
    assetGaps: assetGaps.length,
    byClassification: byClass,
    byStatus,
  }
  check.evidence = { inventory }
  check.samples = assetGaps.slice(0, 12).map((gap) => ({
    url: gap.url,
    classification: gap.classification,
    status: gap.status,
    pages: gap.pages,
    samplePage: gap.samplePage,
  }))
  return finalizeCheck(check)
}

function isStaticTarget(url) {
  const clean = url.split('?')[0].split('#')[0]
  const ext = path.posix.extname(clean).toLowerCase()
  return STATIC_EXT.has(ext)
}

/** identity 检查 */
function checkIdentity({ migratedDir, distDir, siteIdentity, facts, distIndex, goldenDir }) {
  const check = makeCheck('identity', '身份：title / html lang / canonical / og:url / og:type')
  const siteUrl = ensureTrailingSlash(String(siteIdentity.url || facts.config.url || ''))
  const siteTitle = String(siteIdentity.title || facts.config.title || '')
  const subtitle = String(siteIdentity.subtitle || facts.config.subtitle || '')
  const language = String(siteIdentity.language || facts.config.language || '')
  const permalink = facts.config.permalink || ':year/:month/:day/:title/'
  const samplePost = [...facts.posts]
    .map((post) => ({ post, rendered: renderPostRoute(post, permalink) }))
    .sort((a, b) => a.rendered.route.localeCompare(b.rendered.route))[0]
  const aboutPage = facts.pages.find((page) => page.relative === 'about/index.md')
  const cases = []

  cases.push({
    title: '首页',
    file: 'index.html',
    expected: {
      lang: language,
      title: `${siteTitle} - ${subtitle}`,
      canonical: siteUrl,
      ogUrl: `${siteUrl}index.html`,
      ogType: 'website',
    },
  })
  if (samplePost) {
    const routeTarget = routeToTarget(samplePost.rendered.route)
    const expectedCanonical = `${siteUrl}${samplePost.rendered.route.replace(/^\/+/, '')}`
    cases.push({
      title: `文章页 /${samplePost.rendered.route.replace(/^\/+|\/+$/g, '')}/`,
      file: routeTarget,
      postSource: samplePost.post.relative,
      expected: {
        lang: language,
        title: `${String(samplePost.post.fm.title || '')} | ${siteTitle}`,
        canonical: expectedCanonical,
        ogUrl: `${expectedCanonical.replace(/\/$/, '')}/index.html`,
        ogType: 'article',
      },
    })
  }
  if (aboutPage) {
    const route = renderPageRoute(aboutPage).route
    const expectedCanonical = `${siteUrl}${route.replace(/^\/+/, '')}`
    cases.push({
      title: '关于页 /about/',
      file: routeToTarget(route),
      expected: {
        lang: language,
        title: `${String(aboutPage.fm.title || '关于')} | ${siteTitle}`,
        canonical: expectedCanonical,
        ogUrl: `${expectedCanonical.replace(/\/$/, '')}/index.html`,
        ogType: 'website',
      },
    })
  }

  const results = []
  for (const testCase of cases) {
    const abs = path.join(distDir, testCase.file)
    if (!isFile(abs)) {
      check.gaps.push({
        status: 'migration-gap',
        classification: 'identity',
        url: `/${testCase.file}`,
        detail: '页面文件不存在，无法校验身份字段',
        owner: CLASS_OWNER.identity,
      })
      continue
    }
    const html = readText(abs)
    const actual = {
      lang: getHtmlLang(html),
      title: getTitle(html),
      canonical: getLinkHref(html, 'canonical'),
      ogUrl: getMetaContent(html, 'og:url'),
      ogType: getMetaContent(html, 'og:type'),
    }
    const goldenAbs = path.join(goldenDir, testCase.file)
    const goldenActual = isFile(goldenAbs)
      ? {
          lang: getHtmlLang(readText(goldenAbs)),
          title: getTitle(readText(goldenAbs)),
          canonical: getLinkHref(readText(goldenAbs), 'canonical'),
          ogUrl: getMetaContent(readText(goldenAbs), 'og:url'),
          ogType: getMetaContent(readText(goldenAbs), 'og:type'),
        }
      : null
    const fields = []
    for (const field of Object.keys(testCase.expected)) {
      const expected = testCase.expected[field]
      const value = actual[field]
      const ok = normalizeIdentityValue(value) === normalizeIdentityValue(expected)
      fields.push({ field, expected, actual: value, ok, golden: goldenActual ? goldenActual[field] : null })
      if (!ok) {
        check.gaps.push({
          status: 'migration-gap',
          classification: 'identity',
          url: `/${testCase.file}`,
          page: testCase.title,
          field,
          expected,
          actual: value,
          golden: goldenActual ? goldenActual[field] : null,
          owner: CLASS_OWNER.identity,
        })
      }
    }
    results.push({ page: testCase.title, file: testCase.file, fields })
  }

  check.counts = {
    siteIdentity: { title: siteTitle, language, url: siteUrl, source: 'site.config.ts（migrate-hexo 由 _config.yml 生成）' },
    pagesChecked: results.length,
    assertions: results.reduce((total, item) => total + item.fields.length, 0),
    failed: results.reduce((total, item) => total + item.fields.filter((field) => !field.ok).length, 0),
    cases: results.map((item) => ({ page: item.page, file: item.file })),
  }
  check.evidence = {
    siteConfigFile: relDisplay(path.join(migratedDir, 'site.config.ts')),
    fieldResults: results,
  }
  check.samples = results.slice(0, 3).map((item) => ({
    page: item.page,
    fields: item.fields.map((field) => `${field.field}: ${field.ok ? 'OK' : `期望 ${field.expected} / 实际 ${field.actual}`}`),
  }))
  return finalizeCheck(check)
}

/** identity 值归一化：'https://x/' vs 'https://x' 视为相同，' | ' 空白差异不放过 */
function normalizeIdentityValue(value) {
  if (value == null) return null
  return String(value).trim().replace(/(?<=[^:])\/{2,}/g, '/')
}
function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`
}
function getHtmlLang(html) {
  const match = /<html\b([^>]*)>/i.exec(html)
  if (!match) return null
  const lang = /\blang\s*=\s*"([^"]*)"/i.exec(match[1])
  return lang ? decodeEntities(lang[1]) : null
}
function getTitle(html) {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(html)
  return match ? decodeEntities(match[1]).trim() : null
}
function getLinkHref(html, rel) {
  const re = new RegExp(`<link\\b[^>]*\\brel\\s*=\\s*"${rel}"[^>]*>`, 'i')
  const tag = re.exec(html)?.[0]
  if (!tag) return null
  const href = /\bhref\s*=\s*"([^"]*)"/i.exec(tag)
  return href ? decodeEntities(href[1]).trim() : null
}
function getMetaContent(html, property) {
  const re = new RegExp(`<meta\\b[^>]*\\bproperty\\s*=\\s*"${property}"[^>]*>`, 'i')
  const tag = re.exec(html)?.[0]
  if (!tag) return null
  const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag)
  return content ? decodeEntities(content[1]).trim() : null
}

/** page-types 检查 */
function checkPageTypes({ facts, distIndex, migratedDir, plugins }) {
  const check = makeCheck('page-types', '页面类型：17 个独立页面根选择器')
  const permalink = facts.config.permalink || ':year/:month/:day/:title/'
  const rows = []
  const pageEntries = facts.pages
    .map((page) => {
      const route = renderPageRoute(page)
      const isIndex = path.posix.basename(page.relative) === 'index.md'
      const declaredType = page.fm.type || (isIndex ? 'default' : null)
      return { page, route: route.route, isIndex, declaredType }
    })
    .filter((entry) => entry.isIndex) // 17 个 index.md 独立页面
  let migratedConfigText = ''
  try {
    migratedConfigText = readText(path.join(migratedDir, 'anzhiyu.config.yml'))
  } catch {
    migratedConfigText = ''
  }
  for (const entry of pageEntries) {
    const target = routeToTarget(entry.route)
    const selectorSpec = PAGE_TYPE_SELECTORS[entry.declaredType] ?? PAGE_TYPE_SELECTORS.__default__
    const row = {
      route: entry.route,
      source: entry.page.relative,
      declaredType: entry.declaredType,
      file: target,
      exists: distIndex.files.has(target),
      expectedType: selectorSpec.type,
      selectors: selectorSpec.selectors.map((item) => item.test),
      passed: false,
    }
    if (!row.exists) {
      row.reason = 'dist 中无该页面文件'
      check.gaps.push({
        status: 'migration-gap',
        classification: 'page-type',
        url: entry.route,
        detail: row.reason,
        owner: CLASS_OWNER['page-type'],
      })
      rows.push(row)
      continue
    }
    const html = readText(path.join(distIndex.root, target))
    const failures = selectorSpec.selectors
      .map((selector) => {
        const found = html.includes(selector.test)
        if (!found) return `缺少选择器 ${selector.test}`
        if (selector.requireText) {
          const text = innerText(html, selector.test)
          if (text.length < 8) return `选择器 ${selector.test} 命中但正文为空（${text.length} 字符）`
        }
        return null
      })
      .filter(Boolean)
    row.passed = failures.length === 0
    if (failures.length > 0) {
      row.reason = failures.join('；')
      const evidence = []
      if (entry.declaredType === 'fcircle') {
        evidence.push(
          `迁移产物 anzhiyu.config.yml 里 friends_vue.enable=${readConfigScalar(migratedConfigText, 'friends_vue', 'enable') ?? '（缺）'}`,
        )
        evidence.push(`源站 _config.anzhiyu.yml 里有 friends_lite 键：${plugins.theme.friendsLitePresent}`)
      }
      if (entry.declaredType === 'todolist') {
        evidence.push(
          `主题包是否有 TodolistPage.astro：${isFile(path.join(REPO_ROOT, 'src', 'components', 'page', 'TodolistPage.astro'))}`,
        )
      }
      check.gaps.push({
        status: 'migration-gap',
        classification: 'page-type',
        url: entry.route,
        declaredType: entry.declaredType,
        detail: failures.join('；'),
        evidence,
        owner: CLASS_OWNER['page-type'],
      })
    }
    rows.push(row)
  }
  check.counts = {
    pagesChecked: rows.length,
    passed: rows.filter((row) => row.passed).length,
    failed: rows.filter((row) => !row.passed).length,
    byDeclaredType: groupCount(rows, (row) => row.declaredType || 'default'),
  }
  check.evidence = { rows }
  check.samples = rows.map((row) => ({
    route: row.route,
    declaredType: row.declaredType,
    status: row.passed ? 'PASS' : `FAIL: ${row.reason}`,
  }))
  return finalizeCheck(check)
}

/** 抓选择器命中片段后的一小段文本（用于判断 default 页正文是否渲染） */
function innerText(html, selector) {
  const index = html.indexOf(selector)
  if (index < 0) return ''
  // 从选择器命中的开标签往后取 8000 字符，去掉标签与脚本内容后看纯文本长度。
  // 空容器（如未迁移模板的 todolist 页）会得到 0 字符。
  const window = html.slice(index, index + 8000)
  const withoutScripts = window
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  return decodeEntities(withoutScripts.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function readConfigScalar(configText, parentKey, childKey) {
  const blockRe = new RegExp(`^${parentKey}:\\s*\\n((?:[ \\t]+.*\\n?)*)`, 'm')
  const block = blockRe.exec(configText)?.[1]
  if (!block) return null
  const lineRe = new RegExp(`^\\s+${childKey}:\\s*(.+)$`, 'm')
  return lineRe.exec(block)?.[1]?.trim() ?? null
}

/** tag-residue 检查 */
function checkTagResidue(distDir) {
  const check = makeCheck('tag-residue', '残留：Hexo tag / EJS 标记 / undefined·NaN 标题')
  const htmlFiles = walkFiles(distDir, (name) => name.toLowerCase().endsWith('.html'))
  const hits = []
  const ignoredCodeSamples = []
  let ignoredCodeSampleCount = 0
  for (const file of htmlFiles) {
    const html = readText(path.join(distDir, file))
    // pre/code 里的 `{% … %}` / `<% … %}` 是**被示例出来的语法文本**（uitest 这类
    // 渲染测试页的代码块示例），与 links 检查的 ignoredCodeSamples 同一语义：
    // golden（源站 Hexo 权威产物）同样在代码块里保留这些字面量（实测 golden uitest
    // 466 处 vs dist 446 处，均 100% 位于 pre/code 内），上游行为就是不渲染它们。
    // 因此只判 pre/code **外**的真实残留；代码块内命中单独计数列样本，不掩盖。
    const codeMasked = html
      .replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, (m) => '\u0000'.repeat(m.length))
      .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, (m) => '\u0000'.repeat(m.length))
    for (const pattern of TAG_RESIDUE) {
      pattern.re.lastIndex = 0
      let match
      while ((match = pattern.re.exec(html))) {
        const inCode = codeMasked[match.index] === '\u0000'
        const item = {
          file,
          marker: pattern.id,
          label: pattern.label,
          context: contextSnippet(html, match.index),
        }
        if (inCode) {
          ignoredCodeSampleCount += 1
          if (ignoredCodeSamples.length < 200) ignoredCodeSamples.push(item)
        } else {
          hits.push(item)
        }
      }
    }
  }
  for (const hit of hits) {
    check.gaps.push({
      status: 'migration-gap',
      classification: 'other',
      url: `/${hit.file}`,
      detail: `${hit.label}：${hit.context}`,
      owner: CLASS_OWNER.other,
    })
  }
  check.counts = {
    htmlFiles: htmlFiles.length,
    hits: hits.length,
    ignoredCodeSamples: ignoredCodeSampleCount,
    markersChecked: TAG_RESIDUE.length,
  }
  check.samples = hits.slice(0, 8)
  check.ignoredCodeSampleSamples = ignoredCodeSamples.slice(0, 8)
  return finalizeCheck(check)
}

/** search 检查（D3：以源站 facts.config.search 为前提——源站启用才断言，
 *  源站启用而产物缺 localSearch / 索引计 migration-gap；SKIP 只留「源站未启用」，
 *  产物缺配置不再能靠 SKIP 假绿） */
function checkSearch({ distDir, config, goldenDir }) {
  const check = makeCheck('search', '搜索：GLOBAL_CONFIG.localSearch 索引文件存在性')
  // 源站启用 = 源站 _config.yml 配了 search.path（hexo-generator-search 的产物开关）
  const expectedPath = config?.search?.path || null
  const sourceSearchEnabled = Boolean(expectedPath)
  const indexFile = path.join(distDir, 'index.html')
  if (!isFile(indexFile)) {
    check.status = 'SKIP'
    check.note = 'dist/index.html 不存在，跳过'
    return check
  }
  const html = readText(indexFile)
  const localSearch = extractJsObject(html, 'localSearch')
  const goldenSearch = path.join(goldenDir, String(expectedPath || 'search.xml'))
  check.counts = {
    sourceSearchEnabled,
    localSearchEnabled: Boolean(localSearch),
    localSearchPath: localSearch?.path ?? null,
    configSearchPath: expectedPath,
    goldenSearchXmlBytes: isFile(goldenSearch) ? fs.statSync(goldenSearch).size : null,
  }
  check.evidence = {
    globalConfigExcerpt: localSearch ? JSON.stringify(localSearch) : null,
    sourceConfig: 'search.path（_config.yml）+ hexo-generator-search 产物',
  }
  if (!sourceSearchEnabled) {
    check.note = '源站 _config.yml 未启用本地搜索（无 search.path），跳过断言'
    check.status = 'SKIP'
    return check
  }
  if (!localSearch) {
    const expectedIndex = normalizeRoute(`/${String(expectedPath).replace(/^\/+/, '')}`)
    check.gaps.push({
      status: 'migration-gap',
      classification: 'search-index',
      url: expectedIndex,
      expectedPath,
      goldenHasFile: isFile(goldenSearch),
      detail: `源站启用本地搜索（search.path=${expectedPath}）但产物首页没有 GLOBAL_CONFIG.localSearch，配置未迁移`,
      owner: CLASS_OWNER['search-index'],
    })
    check.counts.indexFile = expectedIndex.replace(/^\/+/, '')
    check.counts.indexExists = false
    check.counts.indexBytes = 0
    return finalizeCheck(check)
  }
  const indexPath = normalizeRoute(`/${String(localSearch.path || '').replace(/^\/+/, '')}`)
  const target = indexPath.replace(/^\/+/, '')
  const found = distIndexHas(distDir, target)
  if (!found.exists) {
    check.gaps.push({
      status: 'migration-gap',
      classification: 'search-index',
      url: indexPath,
      expectedPath,
      goldenHasFile: isFile(goldenSearch),
      detail: `localSearch.path=${indexPath} 指向的索引文件不存在`,
      owner: CLASS_OWNER['search-index'],
    })
  }
  check.counts.indexFile = target
  check.counts.indexExists = found.exists
  check.counts.indexBytes = found.exists ? fs.statSync(path.join(distDir, target)).size : 0
  return finalizeCheck(check)
}

function distIndexHas(distDir, target) {
  const index = buildIndex(distDir)
  return resolveTarget(index, `/${target}`)
}

/** feed / sitemap / 根级产物检查 */
function checkFeedSitemap({ distDir, config, plugins, goldenDir }) {
  const check = makeCheck('feed', 'feed / sitemap / 根级产物：存在性 + 非空 + 条目数')
  const expected = []
  for (const feedPath of plugins.feed.paths) {
    expected.push({ path: feedPath, classification: 'feed', kind: 'feed', itemRe: /<(?:entry|item)[\s>]/gi })
  }
  if (plugins.sitemapPath) expected.push({ path: plugins.sitemapPath, classification: 'sitemap', kind: 'sitemap', itemRe: /<url[\s>]/gi })
  if (plugins.baidusitemapPath) expected.push({ path: plugins.baidusitemapPath, classification: 'sitemap', kind: 'baidusitemap', itemRe: /<url[\s>]/gi })
  if (plugins.baiduUrlsPath) expected.push({ path: plugins.baiduUrlsPath, classification: 'sitemap', kind: 'baidu_urls', itemRe: /\S+/g })
  const rows = []
  for (const item of expected) {
    const relative = String(item.path).replace(/^\/+/, '')
    const abs = path.join(distDir, relative)
    const goldenAbs = path.join(goldenDir, relative)
    const row = {
      path: `/${relative}`,
      classification: item.classification,
      exists: isFile(abs),
      bytes: isFile(abs) ? fs.statSync(abs).size : 0,
      items: 0,
      goldenExists: isFile(goldenAbs),
      goldenBytes: isFile(goldenAbs) ? fs.statSync(goldenAbs).size : 0,
      goldenItems: 0,
    }
    if (row.exists) {
      const text = readText(abs)
      item.itemRe.lastIndex = 0
      row.items = (text.match(item.itemRe) || []).length
    }
    if (row.goldenExists) {
      const text = readText(goldenAbs)
      item.itemRe.lastIndex = 0
      row.goldenItems = (text.match(item.itemRe) || []).length
    }
    rows.push(row)
    // D4：条目数与 golden 不一致也算缺口（golden = 源站最后一次构建参照，迁移前后
    // feed/sitemap 条目数应一致）；golden 无文件时不比（没有参照，避免误报）。
    const itemMismatch = row.goldenExists && row.items !== row.goldenItems
    const emptyItems = item.kind !== 'baidu_urls' && row.items === 0
    if (!row.exists || row.bytes === 0 || emptyItems || itemMismatch) {
      const detail = !row.exists
        ? `产物不存在（golden ${row.goldenExists ? `有，${row.goldenItems} 条目` : '也没有'}）`
        : row.bytes === 0
          ? '产物为空文件'
          : emptyItems
            ? '产物存在但条目数为 0'
            : `条目数与 golden 不一致（产物 ${row.items} / golden ${row.goldenItems}）`
      check.gaps.push({
        status: 'migration-gap',
        classification: item.classification,
        url: row.path,
        goldenExists: row.goldenExists,
        goldenItems: row.goldenItems,
        items: row.items,
        detail,
        owner: CLASS_OWNER[item.classification],
      })
    }
  }
  // golden 根级文件 vs dist 根级文件（补充归属：go.html 在 routes 里单独算）
  const goldenRoot = goldenHtmlRootFiles(goldenDir)
  const distRoot = fs.readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
  check.counts = {
    expectations: rows.length,
    present: rows.filter((row) => row.exists).length,
    missing: rows.filter((row) => !row.exists).length,
    goldenRootFiles: goldenRoot.length,
    distRootFiles: distRoot.length,
    goldenRootOnly: goldenRoot.filter((name) => !distRoot.includes(name)),
  }
  check.evidence = { rows, sourceConfig: { feed: plugins.feed, sitemap: plugins.sitemapPath, baidusitemap: plugins.baidusitemapPath, baiduUrls: plugins.baiduUrlsPath } }
  check.samples = rows.map((row) => ({
    path: row.path,
    status: row.exists ? 'EXISTS' : 'MISSING',
    items: row.items,
    goldenItems: row.goldenItems,
  }))
  return finalizeCheck(check)
}

function goldenHtmlRootFiles(goldenDir) {
  if (!exists(goldenDir)) return []
  return fs.readdirSync(goldenDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
}

/** structure 检查（INFO）：抽样复用 diff-html.mjs 单页模式 */
function checkStructure({ goldenDir, distDir }) {
  const check = makeCheck('structure', '结构抽样：diff-html.mjs 单页 diffCount（INFO，不判罚）')
  check.status = 'INFO'
  const samples = [
    { name: '首页', golden: 'index.html', dist: 'index.html' },
    { name: '文章页', golden: 'posts/p3eeb/index.html', dist: 'posts/p3eeb/index.html' },
    { name: '归档页', golden: 'archives/index.html', dist: 'archives/index.html' },
    { name: '关于页', golden: 'about/index.html', dist: 'about/index.html' },
    { name: '分类索引', golden: 'categories/index.html', dist: 'categories/index.html' },
    { name: '标签索引', golden: 'tags/index.html', dist: 'tags/index.html' },
  ]
  const results = []
  for (const sample of samples) {
    const goldenFile = path.join(goldenDir, sample.golden)
    const distFile = path.join(distDir, sample.dist)
    if (!isFile(goldenFile) || !isFile(distFile)) {
      results.push({ ...sample, skipped: true, reason: '缺 golden 或 dist 文件' })
      continue
    }
    const run = runProcess(process.execPath, [DIFF_SCRIPT, goldenFile, distFile, '--json'], {
      timeout: 120000,
      name: 'structure-diff',
    })
    let parsed = null
    try {
      parsed = JSON.parse(run.stdout)
    } catch {
      /* diff-html 没有输出合法 JSON：保留 null */
    }
    const page = parsed?.page ?? null
    results.push({
      name: sample.name,
      golden: sample.golden,
      dist: sample.dist,
      exitCode: run.entry.exitCode,
      diffCount: page?.diffCount ?? null,
      missingNodes: page?.missingNodes ?? null,
      unexpectedNodes: page?.unexpectedNodes ?? null,
      categories: page?.counts ?? null,
    })
  }
  check.counts = {
    samples: results.length,
    sampled: results.filter((row) => !row.skipped).length,
    totalDiffs: results.reduce((total, row) => total + (row.diffCount ?? 0), 0),
  }
  check.evidence = { results, tool: 'scripts/diff-html.mjs <baseline> <dist> --json' }
  check.samples = results.map((row) =>
    row.skipped ? `${row.name}: SKIP（${row.reason}）` : `${row.name}: diffCount=${row.diffCount}（缺 ${row.missingNodes} / 多 ${row.unexpectedNodes} 节点）`,
  )
  check.note = 'INFO：结构 diff 只提供真实数字，不参与 PASS/FAIL；逐类差异见各页 diff'
  return check
}

// ═══════════════════════════════════════════════════════════════════════════
// 9 · 报告汇总 / Markdown 渲染
// ═══════════════════════════════════════════════════════════════════════════

function groupCount(items, keyFn) {
  const map = new Map()
  for (const item of items) {
    const key = keyFn(item) || 'other'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))))
}

function summarizeChecks(checks) {
  const byStatus = { PASS: 0, FAIL: 0, INFO: 0, SKIP: 0, BLOCKED: 0 }
  const gapByClass = new Map()
  // links / assets 两个检查对同一 URL 会各报一次（口径要求如此），
  // 全局计数按 (classification + url + field) 去重，避免 gapTotal 虚高。
  const seenByStatus = { 'migration-gap': new Set(), inherited: new Set(), whitelisted: new Set() }
  const statusCounts = { 'migration-gap': 0, inherited: 0, whitelisted: 0 }
  let migrationGapEntries = 0
  const gapKey = (gap) => gap.classification + '\u0000' + (gap.url || gap.detail || '') + '\u0000' + (gap.field || '')
  for (const check of checks) {
    byStatus[check.status] = (byStatus[check.status] ?? 0) + 1
    for (const gap of check.gaps) {
      const status = gap.status
      if (statusCounts[status] === undefined) statusCounts[status] = 0
      if (!seenByStatus[status]) seenByStatus[status] = new Set()
      const key = gapKey(gap)
      if (seenByStatus[status].has(key)) continue
      seenByStatus[status].add(key)
      statusCounts[status] += 1
      if (status !== 'migration-gap') continue
      migrationGapEntries += 1
      const classKey = gap.classification || 'other'
      gapByClass.set(classKey, (gapByClass.get(classKey) ?? 0) + 1)
    }
  }
  const gapBreakdown = Object.fromEntries(
    [...gapByClass.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => [key, { count, owner: CLASS_OWNER[key] || CLASS_OWNER.other }]),
  )
  const uniqueGapTotal = [...gapByClass.values()].reduce((total, count) => total + count, 0)
  const rawGapEntries = checks.reduce(
    (total, check) => total + check.gaps.filter((gap) => gap.status === 'migration-gap').length,
    0,
  )
  return {
    checksByStatus: byStatus,
    gapByStatus: statusCounts,
    gapTotal: uniqueGapTotal,
    gapEntriesRaw: rawGapEntries,
    gapDuplicateEntries: rawGapEntries - uniqueGapTotal,
    inheritedTotal: statusCounts.inherited ?? 0,
    whitelistedTotal: statusCounts.whitelisted ?? 0,
    gapBreakdown,
  }
}

function renderMarkdown(report) {
  const lines = []
  const push = (line = '') => lines.push(line)
  const { meta, phases, checks, whitelist } = report
  const summary = report.summary || {
    checksByStatus: {},
    gapByStatus: {},
    gapTotal: 0,
    inheritedTotal: 0,
    whitelistedTotal: 0,
    gapBreakdown: {},
  }
  push(`# 真实站迁移验收报告（${meta.siteName}）`)
  push()
  push(`- 生成时间：${report.generatedAt}`)
  push(`- 仓库快照：git HEAD \`${meta.gitHead ?? 'unknown'}\`（工作区可能有并行任务未提交改动，见 §15 局限）`)
  push(`- 源站（只读）：\`${meta.siteDir}\``)
  push(`- golden 参考（源站 Hexo 构建产物）：\`${relDisplay(meta.goldenDir)}\`${meta.goldenAvailable ? '' : '（缺失）'}`)
  push(`- 验收工作目录：\`${relDisplay(meta.workDir)}\``)
  push(`- 迁移产物 dist：\`${relDisplay(meta.distDir)}\``)
  push(`- 退出码语义：0=全部 PASS（inherited/whitelisted 不计） / 1=有迁移缺口 / 2=环境·构建失败`)
  push(`- 本次退出码（预计）：**${report.exitCode}** ${report.exitCode === 0 ? '✅ 全部 PASS' : report.exitCode === 1 ? '❌ 存在迁移缺口' : '⛔ 环境/构建失败'}`)
  push()
  push('## 1. 阶段')
  push()
  push('| 阶段 | 状态 | exit | 耗时 | 命令 |')
  push('| --- | --- | ---: | ---: | --- |')
  for (const phase of phases) {
    const status = phase.status ?? (phase.ok ? 'PASS' : 'FAIL')
    push(`| ${phase.name} | ${status} | ${phase.exitCode ?? '-'} | ${phase.durationMs != null ? `${(phase.durationMs / 1000).toFixed(1)}s` : '-'} | \`${phase.command ?? '-'}\` |`)
  }
  if (report.blocked) {
    push()
    push(`> ⛔ blocked：${report.blocked.phase} 阶段失败 —— ${report.blocked.reason}`)
  }
  push()
  push('## 2. 检查总览')
  push()
  push('| # | 检查 | 状态 | 关键计数 |')
  push('| --- | --- | --- | --- |')
  checks.forEach((check, index) => {
    push(`| ${index + 1} | ${check.id} — ${check.title} | ${statusBadge(check.status)} | ${compactCounts(check)} |`)
  })
  push()
  push('## 3. 缺口分类计数表（migration gap）')
  push()
  if (summary.gapTotal === 0) {
    push('无迁移缺口。')
  } else {
    push('| 分类 | 计数 | 归属 |')
    push('| --- | ---: | --- |')
    for (const [key, value] of Object.entries(summary.gapBreakdown)) {
      push(`| \`${key}\` | ${value.count} | ${value.owner} |`)
    }
    push(`| **合计** | **${summary.gapTotal}** | |`)
  }
  push()
  push(`三栏归属总计：migration-gap **${summary.gapTotal}** / inherited **${summary.inheritedTotal}** / whitelisted **${summary.whitelistedTotal}**`)
  if ((summary.gapDuplicateEntries ?? 0) > 0) {
    push()
    push(
      `> 去重说明：links 与 assets 检查按各自口径会重复报告同一 URL，明细共 ${summary.gapEntriesRaw} 条；` +
        `上表按 (分类 + URL) 去重，得到真实缺口目标 ${summary.gapTotal} 个（去掉重复 ${summary.gapDuplicateEntries} 条）。`,
    )
  }
  push()
  push('## 4. 页数差：源站 golden vs 迁移 dist')
  push()
  const routes = checks.find((check) => check.id === 'routes')
  if (routes) {
    push(`- golden HTML 页数：**${routes.counts.goldenHtml}**；迁移 dist HTML 页数：**${routes.counts.distHtml}**；差 **${routes.counts.goldenHtml - routes.counts.distHtml}** 页`)
    push(`- 独立重算：posts ${routes.counts.postsExpected} 篇 + pages ${routes.counts.pagesExpected} 个 = ${routes.counts.routesExpected} 条期望路由，dist 命中 ${routes.counts.routesPresent} 条，缺失 ${routes.counts.independentMissing} 条`)
    push(`- ${routes.note}`)
    const missingPages = routes.gaps.filter((gap) => gap.url)
    if (missingPages.length) {
      push()
      push('| 缺失页面 | 分类 | 归属（源站插件/生成器） |')
      push('| --- | --- | --- |')
      for (const gap of missingPages) {
        push(`| \`${gap.url}\` | ${gap.classification} | ${gap.plugin ?? gap.owner ?? '-'}${gap.pluginEnabled === false ? '（源配置已关闭）' : ''} |`)
      }
    }
  }
  push()
  push('## 5. 链接缺口明细（按分类）')
  push()
  const links = checks.find((check) => check.id === 'links')
  if (links) {
    push(`扫描 ${links.counts.htmlFiles} 个 HTML，站内目标 ${links.counts.distinctInternalTargets} 个，缺失 ${links.counts.missingDistinct} 个（引用 ${links.counts.missingReferences} 次），另有 ${links.counts.ignoredCodeSamples} 处代码块内示例 href/src 已按语义排除。`)
    push()
    const leadDelta = links.counts.leadReference - links.counts.leadStyleAbsoluteAttrMissing
    const leadDeltaText = links.counts.leadReconciled
      ? '一致'
      : `差 ${Math.abs(leadDelta)} 条：差值来自代码块里被示例出来的 src=/href=（本脚本按语义排除；逐条见 JSON evidence.leadStyleMissingList 与 Lead 原始输出对比）`
    push(`口径对账：Lead 一次性探针（绝对值 + 双引号）${links.counts.leadReference} 个 → 本脚本同口径复算 **${links.counts.leadStyleAbsoluteAttrMissing}** 个（${leadDeltaText}）；相对 URL / pjax.loadUrl 归一后 ${links.counts.missingDistinct} 个。`)
    push()
    push(`三栏归属（links 检查口径）：migration-gap ${links.counts.byStatus['migration-gap'] ?? 0} / inherited ${links.counts.byStatus.inherited ?? 0} / whitelisted ${links.counts.byStatus.whitelisted ?? 0}。`)
    push()
    const grouped = new Map()
    for (const gap of links.gaps) {
      const list = grouped.get(gap.classification) ?? []
      list.push(gap)
      grouped.set(gap.classification, list)
    }
    for (const [classification, gaps] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
      push(`### ${classification}（${gaps.length}）`)
      push()
      push('| URL | 状态 | 页面数 | 来源页 | 归属/建议 |')
      push('| --- | --- | ---: | --- | --- |')
      for (const gap of gaps.slice(0, 40)) {
        const tail = gap.status === 'whitelisted' ? `whitelist ${gap.whitelistId}` : gap.status === 'inherited' ? 'inherited（源站既有）' : gap.suggestion ?? gap.owner ?? '-'
        push(`| \`${gap.url}\` | ${gap.status} | ${gap.pages} | \`${gap.samplePage}\` | ${tail} |`)
      }
      if (gaps.length > 40) push(`| …（其余 ${gaps.length - 40} 条见 acceptance-report.json） | | | | |`)
      push()
    }
  }
  push('## 6. 静态资源 404')
  push()
  const assets = checks.find((check) => check.id === 'assets')
  if (assets) {
    push(`静态资源缺失目标 ${assets.counts.assetGaps} 个（按分类：${JSON.stringify(assets.counts.byClassification)}）。`)
    push()
    push('| 资源 | 状态 | 页面数 | 来源页 |')
    push('| --- | --- | ---: | --- |')
    for (const gap of assets.gaps.slice(0, 30)) {
      push(`| \`${gap.url}\` | ${gap.status} | ${gap.pages} | \`${gap.samplePage}\` |`)
    }
    push()
    push('golden 静态资源目录对比：')
    push()
    push('| 目录 | golden 文件数 | dist 文件数 | 未复制 |')
    push('| --- | ---: | ---: | ---: |')
    for (const row of assets.evidence.inventory) {
      push(`| \`${row.dir}/\` | ${row.goldenFiles} | ${row.distFiles} | ${row.missingFiles} |`)
    }
  }
  push()
  push('## 7. 身份字段（title / lang / canonical / og:url / og:type）')
  push()
  const identity = checks.find((check) => check.id === 'identity')
  if (identity) {
    push(`站点身份（迁移产物 site.config.ts）：title=\`${identity.counts.siteIdentity.title}\`，language=\`${identity.counts.siteIdentity.language}\`，url=\`${identity.counts.siteIdentity.url}\``)
    push()
    push(`断言 ${identity.counts.assertions} 条，失败 ${identity.counts.failed} 条。`)
    push()
    for (const page of identity.evidence.fieldResults) {
      push(`### ${page.page}（\`${page.file}\`）`)
      push()
      push('| 字段 | 期望 | 实际 | golden | 结果 |')
      push('| --- | --- | --- | --- | --- |')
      for (const field of page.fields) {
        push(`| ${field.field} | \`${mdCell(field.expected)}\` | \`${mdCell(field.actual)}\` | \`${mdCell(field.golden ?? '-')}\` | ${field.ok ? '✅' : '❌'} |`)
      }
      push()
    }
  }
  push('## 8. 页面类型（17 个独立页面）')
  push()
  const pageTypes = checks.find((check) => check.id === 'page-types')
  if (pageTypes) {
    push(`检查 ${pageTypes.counts.pagesChecked} 页，PASS ${pageTypes.counts.passed}，FAIL ${pageTypes.counts.failed}。`)
    push()
    push('| 路由 | 源文件 | page.type | 选择器 | 结果 |')
    push('| --- | --- | --- | --- | --- |')
    for (const row of pageTypes.evidence.rows) {
      push(`| \`${row.route}\` | \`${row.source}\` | ${row.declaredType ?? 'default'} | ${row.selectors.map((selector) => `\`${selector}\``).join(' / ')} | ${row.passed ? '✅' : `❌ ${row.reason}`} |`)
    }
  }
  push()
  push('## 9. 搜索 / feed / sitemap')
  push()
  const search = checks.find((check) => check.id === 'search')
  if (search) {
    push(`- 搜索：localSearch.enabled=${search.counts.localSearchEnabled}，path=\`${search.counts.localSearchPath ?? '-'}\`，产物存在=${search.counts.indexExists ?? '-'}${search.counts.goldenSearchXmlBytes != null ? `，golden search.xml ${search.counts.goldenSearchXmlBytes} 字节` : ''}`)
  }
  const feed = checks.find((check) => check.id === 'feed')
  if (feed) {
    push(`- feed/sitemap：期望 ${feed.counts.expectations} 个产物，存在 ${feed.counts.present} 个，缺 ${feed.counts.missing} 个`)
    push()
    push('| 产物 | 存在 | 条目 | golden 条目 |')
    push('| --- | --- | ---: | ---: |')
    for (const row of feed.evidence.rows) {
      push(`| \`${row.path}\` | ${row.exists ? '✅' : '❌'} | ${row.items} | ${row.goldenItems} |`)
    }
    if (feed.counts.goldenRootOnly.length) {
      push()
      push(`golden 根级文件在 dist 中缺失：${feed.counts.goldenRootOnly.map((name) => `\`${name}\``).join('、')}`)
    }
  }
  push()
  push('## 10. 残留标记')
  push()
  const residue = checks.find((check) => check.id === 'tag-residue')
  if (residue) {
    push(`扫描 ${residue.counts.htmlFiles} 个 HTML、${residue.counts.markersChecked} 类标记，pre/code 外命中 ${residue.counts.hits} 处。（0 = 干净）`)
    if (residue.counts.ignoredCodeSamples) {
      push(`代码块内被示例出来的 tag/EJS 语法文本共 ${residue.counts.ignoredCodeSamples} 处已按语义排除（golden 同样保留这些字面量）。`)
    }
  }
  push()
  push('## 11. 结构抽样（INFO）')
  push()
  const structure = checks.find((check) => check.id === 'structure')
  if (structure) {
    push('| 页面 | 对应 golden | diffCount | 缺节点 | 多节点 | 差异分类 |')
    push('| --- | --- | ---: | ---: | ---: | --- |')
    for (const row of structure.evidence.results) {
      if (row.skipped) {
        push(`| ${row.name} | - | - | - | - | SKIP：${row.reason} |`)
        continue
      }
      push(`| ${row.name} | \`${row.golden}\` | ${row.diffCount} | ${row.missingNodes} | ${row.unexpectedNodes} | ${row.categories ? Object.entries(row.categories).map(([key, count]) => `${key} ${count}`).join(' / ') : '-'} |`)
    }
    push()
    push('> 说明：结构 diff 复用 `scripts/diff-html.mjs`，归一化后仍保留属性值差异（如 CDN 版本号），所以 diffCount 不为 0 属预期；本项不参与判罚。')
  }
  push()
  push('## 12. 已知豁免（whitelist）')
  push()
  // 同一 URL 可能在 links / assets 两个检查里各出现一次，这里按 URL 去重展示。
  const uniqueGaps = (predicate) => {
    const seen = new Set()
    const out = []
    for (const gap of checks.flatMap((check) => check.gaps)) {
      if (!predicate(gap)) continue
      const key = `${gap.status}:${gap.url ?? gap.detail ?? ''}:${gap.field ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(gap)
    }
    return out
  }
  if (whitelist.length === 0) push('（无）')
  else {
    push('| id | 匹配 | 理由 | 归属 | 命中 |')
    push('| --- | --- | --- | --- | ---: |')
    for (const entry of whitelist) {
      const hits = uniqueGaps((gap) => gap.whitelistId === entry.id)
      push(`| ${entry.id} | \`${entry.kind}:${entry.pattern}\` | ${entry.reason} | ${entry.owner} | ${hits.length} |`)
    }
    const hits = uniqueGaps((gap) => gap.whitelistId)
    if (hits.length) {
      push()
      push('| 被豁免 URL | 页面数 | 来源页 |')
      push('| --- | ---: | --- |')
      for (const gap of hits.slice(0, 20)) push(`| \`${gap.url}\` | ${gap.pages ?? '-'} | \`${gap.samplePage ?? '-'}\` |`)
    }
  }
  push()
  push('## 13. inherited（源站既有问题，不算迁移缺陷）')
  push()
  const inherited = uniqueGaps((gap) => gap.status === 'inherited')
  if (inherited.length === 0) push('（无）')
  else {
    push('| URL | 分类 | 页面数 | 来源页 |')
    push('| --- | --- | ---: | --- |')
    for (const gap of inherited) push(`| \`${gap.url}\` | ${gap.classification} | ${gap.pages ?? '-'} | \`${gap.samplePage ?? '-'}\` |`)
    push()
    push('> 这些目标在源站 golden 里同样不存在，且 golden 自己的 HTML 也引用了它们（如主题 demo 文章正文里的占位链接、旧正文链接），属于迁移前就存在的问题；源站 vercel.json / netlify.toml 中没有对应 redirect。')
  }
  push()
  push('## 14. 修复建议（按归属）')
  push()
  const suggestions = new Map()
  const seenSuggestion = new Set()
  for (const check of checks) {
    for (const gap of check.gaps) {
      if (gap.status !== 'migration-gap') continue
      const dedupeKey = `${gap.classification}\u0000${gap.url ?? gap.detail ?? ''}\u0000${gap.field ?? ''}`
      if (seenSuggestion.has(dedupeKey)) continue
      seenSuggestion.add(dedupeKey)
      const key = gap.classification
      const bucket = suggestions.get(key) ?? { count: 0, owner: CLASS_OWNER[key] || CLASS_OWNER.other, examples: [] }
      bucket.count += 1
      const example = gap.url ?? gap.detail
      if (bucket.examples.length < 3 && example && !bucket.examples.includes(example)) bucket.examples.push(example)
      suggestions.set(key, bucket)
    }
  }
  if (suggestions.size === 0) push('无迁移缺口。')
  else {
    const ordered = [...suggestions.entries()].sort((a, b) => b[1].count - a[1].count)
    push('| 分类 | 条数 | 归属 / 修复方向 | 例子 |')
    push('| --- | ---: | --- | --- |')
    for (const [key, value] of ordered) {
      push(`| \`${key}\` | ${value.count} | ${mdCell(value.owner)} | ${value.examples.map((example) => `\`${mdCell(example)}\``).join('、')} |`)
    }
  }
  push()
  push('## 15. 复跑与局限')
  push()
  push('```powershell')
  push('# 全量：migrate → install → build → 检查')
  push('node scripts/accept-migration.mjs')
  push('# 复用上次工作目录，只重建 + 重查')
  push('node scripts/accept-migration.mjs --out .migration-out/accept-latest --reuse')
  push('# 不构建，直接对现有 dist 做检查')
  push('node scripts/accept-migration.mjs --out .migration-out/accept-latest --reuse --skip-build')
  push('```')
  push()
  push('- 检查范围：HTML 里的 `href` / `src` 属性 + 内联 `pjax.loadUrl(...)`；**未**扫描 `data-lazy-src`、CSS 内 `url()`、`srcset`，这些若缺资源不会计入 gap（可作为后续扩展）。')
  push('- 相对 URL 按页面所在目录解析；伪协议 `/mailto:` `/javascript:` 保留并归为 pseudo-scheme。')
  push('- 代码块（`figure.highlight` / `pre` / `code`）里被示例出来的 `src=`、`href=` 不算真实链接，单独计数为 ignoredCodeSamples。')
  push('- golden 是源站**上一次** Hexo 构建快照；若源站源码在上次构建后又改过，正文差异会体现为 inherited/migration-gap 的链接明细，按 URL 可人工复核。')
  push('- 本仓库可能有并行任务在改 `packages/**`（例如主题静态资源管线）。报告是 **某一次 git HEAD + 工作区状态**的快照（见报告头部 `git HEAD`）：同一命令在 HEAD 变化后复跑，主题资源/模板缺口数量会变（本次 fresh build 与更早的 `.migration-out/xcAnzhiyu` 产物就不同，后者的 `/js/main.js`、`/css/index.css` 等缺口已被主题包资产管线补齐）。')
  push('- 结构抽样（diff-html）为 INFO，不参与退出码；它归一化 DOM 结构但保留属性值（CDN 版本号等）。')
  push('- migrate-hexo 的 migration-report.json 只作参考，本脚本的路由断言独立于它重算。')
  push()
  push('## 16. 建议的 package.json 脚本')
  push()
  push('```json')
  push('"accept:migration": "node scripts/accept-migration.mjs"')
  push('```')
  push()
  return lines.join('\n')
}

function statusBadge(status) {
  if (status === 'PASS') return '✅ PASS'
  if (status === 'FAIL') return '❌ FAIL'
  if (status === 'INFO') return 'ℹ️ INFO'
  if (status === 'SKIP') return '⏭️ SKIP'
  if (status === 'BLOCKED') return '⛔ BLOCKED'
  return status
}

/** Markdown 表格单元格转义：标题里的 "|" 会把列拆坏 */
function mdCell(value) {
  return String(value ?? '-')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
}

function compactCounts(check) {
  const parts = []
  const counts = check.counts || {}
  for (const key of Object.keys(counts)) {
    const value = counts[key]
    if (value == null) continue
    if (typeof value === 'object') continue
    parts.push(`${key}=${value}`)
    if (parts.length >= 4) break
  }
  return parts.join('，') || '-'
}

// ═══════════════════════════════════════════════════════════════════════════
// 10 · 主流程
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const options = parseArgs(process.argv.slice(2))
  JSON_MODE = options.json
  if (options.help) {
    console.log(USAGE)
    return 0
  }

  const startedAt = new Date()
  const workDir = options.out
  const migratedDir = path.join(workDir, 'migrated')
  const distDir = path.join(migratedDir, 'dist')
  const goldenDir = path.join(options.site, 'public')
  say(`[accept-migration] 源站：${options.site}`)
  say(`[accept-migration] 工作目录：${relDisplay(workDir)}`)

  const report = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: startedAt.toISOString(),
    tool: 'scripts/accept-migration.mjs',
    mode: 'real-site-acceptance',
    meta: {
      siteDir: options.site,
      siteName: path.basename(options.site),
      goldenDir,
      goldenAvailable: fs.existsSync(goldenDir),
      workDir,
      migratedDir,
      distDir,
      reuse: options.reuse,
      skipBuild: options.skipBuild,
      gitHead: readGitHead(),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    },
    options: { site: options.site, out: workDir, reuse: options.reuse, skipBuild: options.skipBuild, json: options.json },
    phases: [],
    checks: [],
    whitelist: WHITELIST.map((entry) => ({ ...entry })),
    blocked: null,
    exitCode: 0,
  }

  fs.mkdirSync(workDir, { recursive: true })
  LOG_DIR = path.join(workDir, 'logs')
  fs.mkdirSync(LOG_DIR, { recursive: true })

  // 源站校验失败也要落一份带 blocked 原因的报告（退出码 2）
  if (!fs.existsSync(options.site)) {
    report.blocked = { phase: 'prepare', reason: `--site 目录不存在：${options.site}` }
    report.phases.push({ name: 'prepare', status: 'BLOCKED', reason: report.blocked.reason, command: null, exitCode: null, durationMs: 0, ok: false })
    report.exitCode = 2
    return finish(report, options)
  }
  if (!isFile(path.join(options.site, '_config.yml'))) {
    report.blocked = { phase: 'prepare', reason: `--site 不是 Hexo 站点（缺 _config.yml）：${options.site}` }
    report.phases.push({ name: 'prepare', status: 'BLOCKED', reason: report.blocked.reason, command: null, exitCode: null, durationMs: 0, ok: false })
    report.exitCode = 2
    return finish(report, options)
  }

  // ── 阶段 1：migrate ────────────────────────────────────────────────
  const migrateExists = exists(migratedDir)
  if (migrateExists && options.reuse) {
    report.phases.push({ name: 'migrate', status: 'SKIP', reason: 'migrated/ 已存在且 --reuse', command: null, exitCode: null, durationMs: 0, ok: true })
    say('[1/5] migrate：复用已有 migrated/')
  } else if (migrateExists) {
    report.phases.push({
      name: 'migrate',
      status: 'BLOCKED',
      reason: 'migrated/ 已存在但未加 --reuse（避免覆盖）',
      command: null,
      exitCode: null,
      durationMs: 0,
      ok: false,
    })
    report.blocked = { phase: 'migrate', reason: 'migrated/ 已存在但未加 --reuse；换 --out 或加 --reuse' }
    report.exitCode = 2
    return finish(report, options)
  } else {
    say('\n[1/5] migrate：node scripts/migrate-hexo.mjs')
    const run = runProcess(
      process.execPath,
      [MIGRATE_SCRIPT, '--site', options.site, '--out', migratedDir],
      { timeout: 5 * 60 * 1000, name: 'migrate' },
    )
    const phase = run.entry
    phase.name = 'migrate'
    phase.status = phase.ok ? 'PASS' : 'BLOCKED'
    report.phases.push(phase)
    if (!phase.ok) {
      report.blocked = { phase: 'migrate', reason: phase.error || `exit=${phase.exitCode}` }
      report.exitCode = 2
      return finish(report, options)
    }
  }
  if (!exists(path.join(migratedDir, 'package.json'))) {
    report.blocked = { phase: 'migrate', reason: 'migrate 之后仍缺 migrated/package.json' }
    report.exitCode = 2
    return finish(report, options)
  }

  // ── 阶段 2：install ────────────────────────────────────────────────
  const nodeModules = path.join(migratedDir, 'node_modules')
  if (exists(nodeModules)) {
    report.phases.push({ name: 'install', status: 'SKIP', reason: 'node_modules/ 已存在', command: null, exitCode: null, durationMs: 0, ok: true })
    say('[2/5] install：复用已有 node_modules/')
  } else if (options.skipBuild) {
    report.phases.push({ name: 'install', status: 'SKIP', reason: '--skip-build 且无 node_modules/', command: null, exitCode: null, durationMs: 0, ok: true })
    say('[2/5] install：--skip-build，跳过')
  } else {
    say('\n[2/5] install：pnpm install --ignore-workspace')
    const run = runProcess('pnpm', ['install', '--ignore-workspace'], {
      cwd: migratedDir,
      timeout: 15 * 60 * 1000,
      shell: process.platform === 'win32',
      name: 'pnpm-install',
    })
    const phase = run.entry
    phase.name = 'install'
    phase.status = phase.ok ? 'PASS' : 'BLOCKED'
    report.phases.push(phase)
    if (!phase.ok) {
      report.blocked = { phase: 'install', reason: phase.error || `exit=${phase.exitCode}` }
      report.exitCode = 2
      return finish(report, options)
    }
  }

  // ── 阶段 3：build ─────────────────────────────────────────────────
  if (options.skipBuild) {
    report.phases.push({ name: 'build', status: 'SKIP', reason: '--skip-build', command: null, exitCode: null, durationMs: 0, ok: true })
    say('[3/5] build：--skip-build，跳过')
    if (!exists(distDir)) {
      report.blocked = { phase: 'build', reason: `--skip-build 但 dist 不存在：${distDir}` }
      report.exitCode = 2
      return finish(report, options)
    }
  } else {
    say('\n[3/5] build：pnpm build（astro build + normalize-html-output，CODEBUDDY_SAFE_DELETE_ENABLED=0）')
    const run = runProcess('pnpm', ['build'], {
      cwd: migratedDir,
      timeout: 15 * 60 * 1000,
      shell: process.platform === 'win32',
      env: { CODEBUDDY_SAFE_DELETE_ENABLED: '0' },
      name: 'pnpm-build',
    })
    const phase = run.entry
    phase.name = 'build'
    phase.status = phase.ok ? 'PASS' : 'BLOCKED'
    report.phases.push(phase)
    if (!phase.ok) {
      report.blocked = { phase: 'build', reason: phase.error || `exit=${phase.exitCode}` }
      report.exitCode = 2
      return finish(report, options)
    }
  }

  const buildPhase = report.phases.find((phase) => phase.name === 'build')

  // ── 阶段 4：检查 ─────────────────────────────────────────────────
  say('\n[4/5] 检查：build / routes / links / assets / identity / page-types / tag-residue / search / feed / structure')
  const facts = await collectSourceFacts(options.site)
  if (facts.configDegraded) warn('[accept-migration] 警告：yaml 包不可用，配置只用正则降级提取')
  const plugins = pluginFacts(facts)
  const distIndex = buildIndex(distDir)
  const goldenAvailable = facts.goldenAvailable
  const goldenIndex = goldenAvailable ? buildIndex(goldenDir) : null
  const distScan = scanInternalRefs(distDir)
  const goldenScan = goldenAvailable ? scanInternalRefs(goldenDir) : { refs: new Map(), htmlFiles: [] }
  const goldenHtml = goldenAvailable ? walkFiles(goldenDir, (name) => name.toLowerCase().endsWith('.html')) : []

  const checks = []
  checks.push(checkBuild(buildPhase, distDir))
  checks.push(checkRoutes(facts, plugins, distDir, distIndex, goldenDir, goldenHtml))
  const linksCheck = checkLinks(distScan, distIndex, goldenDir, goldenScan, goldenIndex)
  checks.push(linksCheck)
  checks.push(checkAssets(linksCheck, distIndex, goldenDir))
  let siteIdentity = null
  try {
    siteIdentity = loadSiteIdentity(migratedDir)
  } catch (error) {
    siteIdentity = null
    warn(`[accept-migration] 无法解析 site.config.ts：${error.message}`)
  }
  checks.push(
    checkIdentity({
      migratedDir,
      distDir,
      siteIdentity: siteIdentity || facts.config,
      facts,
      distIndex,
      goldenDir,
    }),
  )
  checks.push(checkPageTypes({ facts, distIndex, migratedDir, plugins }))
  checks.push(checkTagResidue(distDir))
  checks.push(checkSearch({ distDir, config: facts.config, goldenDir }))
  checks.push(checkFeedSitemap({ distDir, config: facts.config, plugins, goldenDir }))
  if (goldenAvailable) {
    checks.push(checkStructure({ goldenDir, distDir }))
  } else {
    const structure = makeCheck('structure', '结构抽样')
    structure.status = 'SKIP'
    structure.note = 'golden public/ 不存在，跳过'
    checks.push(structure)
  }
  report.checks = checks
  report.summary = summarizeChecks(checks)
  report.siteIdentity = siteIdentity
  report.plugins = plugins
  report.config = {
    permalink: facts.config.permalink,
    feed: plugins.feed,
    sitemap: plugins.sitemapPath,
    baidusitemap: plugins.baidusitemapPath,
    search: plugins.searchPath,
    baiduUrls: plugins.baiduUrlsPath,
    pluginPages: plugins.pluginPages,
  }
  report.exitCode = report.summary.gapTotal > 0 ? 1 : 0
  return finish(report, options)
}

/** 从迁移产物的 site.config.ts 里读回 site 身份对象（migrate-hexo 生成的是 JSON 字面量） */
function loadSiteIdentity(migratedDir) {
  const file = path.join(migratedDir, 'site.config.ts')
  if (!isFile(file)) throw new Error('site.config.ts 不存在')
  const text = readText(file)
  const match = /export const site\s*=\s*(\{[\s\S]*?\n\})/.exec(text)
  if (!match) throw new Error('未找到 export const site = {...}')
  return JSON.parse(match[1])
}

/** 从 index.html 里提出某个 JS 对象字面量（GLOBAL_CONFIG.localSearch 等） */
function extractJsObject(html, key) {
  const keyIndex = html.indexOf(`${key}:`)
  if (keyIndex < 0) return null
  const start = html.indexOf('{', keyIndex)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let quote = ''
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (inString) {
      if (char === '\\') {
        index += 1
        continue
      }
      if (char === quote) inString = false
      continue
    }
    if (char === '"' || char === "'") {
      inString = true
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        const literal = html.slice(start, index + 1)
        try {
          return JSON.parse(literal)
        } catch {
          return { raw: literal }
        }
      }
    }
  }
  return null
}

/** 写报告 + 退出码 */
function finish(report, options) {
  fs.mkdirSync(report.meta.workDir, { recursive: true })
  const jsonPath = path.join(report.meta.workDir, 'acceptance-report.json')
  const mdPath = path.join(report.meta.workDir, 'acceptance-report.md')
  const markdown = renderMarkdown(report)
  report.reports = { json: relDisplay(jsonPath), markdown: relDisplay(mdPath) }
  report.recommendedScript = { 'accept:migration': 'node scripts/accept-migration.mjs' }
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  fs.writeFileSync(mdPath, `${markdown}\n`, 'utf8')
  const exitCode = report.exitCode ?? 0
  if (JSON_MODE) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    printSummary(report)
  }
  process.exitCode = exitCode
  return exitCode
}

function printSummary(report) {
  const { summary, checks } = report
  say('\n' + '='.repeat(78))
  say('验收结果')
  say('='.repeat(78))
  for (const check of checks) {
    const mark = check.status === 'PASS' ? 'PASS' : check.status === 'FAIL' ? 'FAIL' : check.status
    say(`  ${mark.padEnd(5)} ${check.id.padEnd(12)} ${compactCounts(check)}`)
  }
  say('-'.repeat(78))
  if (report.summary) {
    say(`  迁移缺口（migration gap）：${summary.gapTotal}${summary.gapDuplicateEntries ? `（明细 ${summary.gapEntriesRaw} 条，去重 ${summary.gapDuplicateEntries} 条）` : ''}`)
    say(`  源站既有（inherited）   ：${summary.inheritedTotal}`)
    say(`  已知豁免（whitelisted） ：${summary.whitelistedTotal}`)
    if (summary.gapTotal > 0) {
      say('  缺口分类：')
      for (const [key, value] of Object.entries(summary.gapBreakdown)) {
        say(`    - ${key.padEnd(16)} ${String(value.count).padStart(3)}  ${value.owner}`)
      }
    }
  }
  if (report.blocked) say(`  blocked：${report.blocked.phase} — ${report.blocked.reason}`)
  say('-'.repeat(78))
  say(`  退出码：${report.exitCode}（0=全部 PASS / 1=有迁移缺口 / 2=环境·构建失败）`)
  if (report.reports) {
    say(`  报告：${report.reports.markdown}`)
    say(`        ${report.reports.json}`)
  }
  say('='.repeat(78))
}

main().catch((error) => {
  warn(`\n[accept-migration] 未捕获异常：${error.stack || error.message}`)
  process.exitCode = 2
})
