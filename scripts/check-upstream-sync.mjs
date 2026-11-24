#!/usr/bin/env node
/**
 * P7-5：上游同步检查（季度 diff 的可复跑入口）。
 *
 * 迁移基线锁在 hexo-theme-anzhiyu 1.7.1 / commit 72439d93（见 docs/PLAN.md §2.1、
 * docs/upstream-delta.md §5 锚点）。这个脚本回答一个问题：
 *
 *   「基线之后，上游到底多了什么？哪些必须跟进？」
 *
 * 只读 `_research/anzhiyu-upstream` 的 git 数据（唯一写操作是 fetch 更新
 * remote-tracking ref 与对象库，工作树不动），不构建、不联网写、不改本仓库。
 *
 * ## 数据源与「是否最新」
 *
 * 1. 默认网络模式：`git -C <upstream> fetch origin --quiet` 之后比对 `origin/main`。
 *    - 本副本 remote.origin.fetch 是单分支 refspec（只覆盖 main），所以比对
 *      `origin/dev` 这类非默认分支时，脚本会再加一次显式 refspec fetch
 *      （`+refs/heads/dev:refs/remotes/origin/dev`），否则本地 tracking ref 可能是旧的。
 *    - fetch 失败（断网/沙箱/凭据）→ 自动回退到本地已有 refs，并把
 *      `dataSource.latest` 标成 false、说明原因；此时若「没有必须跟进变更」，
 *      退出码是 2（不能拿旧的本地 ref 断言「上游没变」）。
 * 2. `--offline`：完全不动网络，只用本地 refs。输出里明确写「是否最新: 否」。
 * 3. `--ref <本地 commit-ish>`（例如 `--ref 1.7.1`）：既不是 tracking ref 也不联网，
 *    当作纯本地区间比较（分类器自检用），`latest` 记为 null（无意义）。
 *
 * ## 分类规则（路径优先，宁可多报）
 *
 * 三档：必须跟进（must）/ 可选（optional）/ 无关（ignored）。规则见 RULES 表：
 *
 * - 必须跟进：`layout/`、`source/css/`、`source/js/`、`scripts/`、`_config.yml`、
 *   `plugins.yml`、`languages/zh-CN.yml`（站点默认语言，缺键会直接掉文案）；
 * - 可选：其他语言包、`package.json`、`sw-rules.js`（上游 PWA 插件用，本仓库未接入）、
 *   文档、示例；
 * - 无关：`.github/`（CI / issue 模板）、`README*`、`LICENSE*`、仓库点文件、图片/字体、
 *   锁文件；
 * - **未分类路径默认按「必须跟进」处理**（fail-safe：新目录/新资源类型先让人看一眼）。
 *
 * 路径规则只看「改了哪个文件」，不看「改得多大」。历史区间 1.7.0..1.7.1 的自检
 * （docs/notes/P7-5-upstream-sync.md）里 26 个文件全部落到了预期档位；dev 分支
 * 上那次只改注释的 `_config.yml` 也会被判必须跟进 —— 这是故意的：宁可多报一次
 * 人工 triage，也不要静默漏掉配置语义变化。
 *
 * ## 退出码
 *
 * - 0：无变更，或只有可选/无关变更（可以不管）；
 * - 1：存在必须跟进的变更（需要人工 triage，见 docs/upstream-delta.md §8 处置流程）；
 * - 2：无法判定（基线解析失败 / 基线不是目标 ref 的祖先 / 网络模式下 fetch 失败
 *      且没有必须跟进变更 / git 不可用等）。2 不是「上游没变」，是「这次没验完」。
 *
 * ## 用法
 *
 *   node scripts/check-upstream-sync.mjs                 # 默认 origin/main
 *   node scripts/check-upstream-sync.mjs --json          # 机器可读
 *   node scripts/check-upstream-sync.mjs --ref origin/dev # 看上游 dev 分支（本轮真有内容）
 *   node scripts/check-upstream-sync.mjs --offline       # 断网场景
 *   node scripts/check-upstream-sync.mjs --baseline 1.7.0 --ref origin/main  # 历史区间自检
 *   node scripts/check-upstream-sync.mjs --help
 *
 * 建议的根 package.json script（由 Lead 统一加，本任务不动 package.json）：
 *   "check:upstream-sync": "node scripts/check-upstream-sync.mjs"
 */

import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DELTA_DOC = path.join(REPO_ROOT, 'docs', 'upstream-delta.md')

const DEFAULT_UPSTREAM = 'D:/Git-project/_research/anzhiyu-upstream'
const DEFAULT_BASELINE = '72439d93'
const DEFAULT_REF = 'origin/main'
const DEFAULT_REMOTE = 'origin'
const FETCH_TIMEOUT_MS = 120_000
const GIT_TIMEOUT_MS = 60_000

const EXIT_OK = 0
const EXIT_MUST_FOLLOW = 1
const EXIT_UNDETERMINED = 2

const TIERS = ['must', 'optional', 'ignored']
const TIER_LABEL = { must: '必须跟进', optional: '可选', ignored: '无关' }
const TIER_RANK = { must: 0, optional: 1, ignored: 2 }

/** 本地时区的 ISO 时间（带 +08:00 这类偏移，人看报告直接可用）。 */
function localIso(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

// —— 分类规则表：顺序即优先级，第一条命中生效 ——
//
// 顺序要求：必须跟进 → 无关（具体项，如 .github/README/LICENSE）→ 可选（宽泛项，
// 如「任意 .md」）→ 兜底。README 必须排在「文档」之前，否则会被判成可选。

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|woff2?|ttf|otf|eot)$/i
const LOCKFILE_RE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/i

const RULES = [
  // ——— 必须跟进：迁移要逐字节/逐行为复刻的东西 ———
  { tier: 'must', test: (p) => p === '_config.yml', reason: '主题配置 _config.yml' },
  { tier: 'must', test: (p) => p === 'plugins.yml', reason: '插件清单 plugins.yml' },
  { tier: 'must', test: (p) => p.startsWith('layout/'), reason: '布局模板 layout/' },
  {
    tier: 'must',
    test: (p) => p.startsWith('source/css/') || /^source\/.*\.styl$/i.test(p),
    reason: '样式 source/css/（或 .styl）',
  },
  { tier: 'must', test: (p) => p.startsWith('source/js/'), reason: '前端脚本 source/js/' },
  { tier: 'must', test: (p) => p.startsWith('scripts/'), reason: 'Hexo 主题脚本 scripts/' },
  {
    tier: 'must',
    test: (p) => p === 'languages/zh-CN.yml',
    reason: '默认语言包 languages/zh-CN.yml',
  },

  // ——— 无关：仓库维护面、二进制资源 ———
  { tier: 'ignored', test: (p) => p.startsWith('.github/'), reason: 'CI / issue 模板' },
  { tier: 'ignored', test: (p) => /^README[^/]*\.md$/i.test(p), reason: 'README' },
  { tier: 'ignored', test: (p) => /^LICEN[CS]E/i.test(p), reason: '许可证' },
  { tier: 'ignored', test: (p) => p.startsWith('.'), reason: '仓库元数据（点文件）' },
  { tier: 'ignored', test: (p) => IMAGE_EXT_RE.test(p), reason: '图片/字体等静态资源' },
  { tier: 'ignored', test: (p) => LOCKFILE_RE.test(p), reason: '锁文件' },

  // ——— 可选：看了有好处，但不阻塞迁移 ———
  { tier: 'optional', test: (p) => p.startsWith('languages/'), reason: '其他语言包 languages/' },
  {
    tier: 'optional',
    test: (p) => p === 'package.json',
    reason: '主题包元数据（版本号/上游依赖，不直接影响本项目 Astro 产物）',
  },
  {
    tier: 'optional',
    test: (p) => p === 'sw-rules.js',
    reason: 'ServiceWorker 规则（上游 PWA 插件用，本仓库未接入）',
  },
  { tier: 'optional', test: (p) => p.startsWith('docs/'), reason: '上游文档' },
  { tier: 'optional', test: (p) => /^(examples?|demos?)\//.test(p), reason: '示例' },
  { tier: 'optional', test: (p) => /\.(md|mdx)$/i.test(p), reason: '文档（Markdown）' },
]

// —— CLI ——

function parseArgs(argv) {
  const options = {
    upstream: DEFAULT_UPSTREAM,
    baseline: DEFAULT_BASELINE,
    ref: DEFAULT_REF,
    remote: DEFAULT_REMOTE,
    offline: false,
    json: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const takeValue = (name) => {
      const eq = arg.indexOf('=')
      if (eq !== -1) return arg.slice(eq + 1)
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${name} 需要一个值`)
      }
      i += 1
      return value
    }
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--offline') options.offline = true
    else if (arg === '--json') options.json = true
    else if (arg === '--upstream' || arg.startsWith('--upstream=')) options.upstream = takeValue('--upstream')
    else if (arg === '--baseline' || arg.startsWith('--baseline=')) options.baseline = takeValue('--baseline')
    else if (arg === '--ref' || arg.startsWith('--ref=')) options.ref = takeValue('--ref')
    else if (arg === '--remote' || arg.startsWith('--remote=')) options.remote = takeValue('--remote')
    else throw new Error(`未知参数：${arg}（--help 看用法）`)
  }
  return options
}

const HELP = `用法: node scripts/check-upstream-sync.mjs [options]

  --upstream <dir>    上游只读副本路径（默认 ${DEFAULT_UPSTREAM}）
  --baseline <rev>    基线 commit（默认 ${DEFAULT_BASELINE}，前缀命中即可）
  --ref <ref>         要比较的上游 ref（默认 ${DEFAULT_REF}；可用 origin/dev）
  --remote <name>     remote 名（默认 ${DEFAULT_REMOTE}）
  --offline           不联网，只用本地已有 refs（输出会标注「是否最新: 否」）
  --json              输出机器可读 JSON（stdout 只有 JSON）
  -h, --help          显示本帮助

退出码: 0=无必须跟进变更 / 1=有必须跟进变更 / 2=无法判定（网络、基线、shallow 等）
文档: docs/upstream-delta.md §8（季度流程）、docs/notes/P7-5-upstream-sync.md（本轮记录）`

// —— 进程内收集结果 ——

const result = {
  tool: 'check-upstream-sync',
  version: '1.0.0',
  generatedAt: localIso(),
  options: null,
  upstream: null,
  dataSource: null,
  history: null,
  files: null,
  summary: null,
  verdict: null,
  warnings: [],
  limitations: [],
  gitCommands: [],
}
let options = null
let jsonMode = false
const humanLines = []

const human = (line = '') => humanLines.push(line)
const warn = (message) => {
  result.warnings.push(message)
}

function finishJson() {
  const payload = { ...result, options }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

// —— git 封装 ——
//
// 捕获方式：把 git 的 stdout/stderr 重定向到临时文件再读，不用 pipe。
// 原因：本仓库的默认运行环境（Windows + DSH 文件沙箱 workspace-write）会拒绝
// 子进程通过命名管道捕获输出（spawn 的 stdio:'pipe' 直接 EPERM），而文件描述符
// 重定向不受限制；普通环境（CI/本地终端）同样工作，且没有管道缓冲区大小问题。
// 临时目录在进程退出时（含 process.exit）统一清理。

let tmpRoot = null
let tmpCounter = 0

function ensureTmpRoot() {
  if (!tmpRoot) tmpRoot = mkdtempSync(path.join(tmpdir(), 'dsh-upstream-sync-'))
  return tmpRoot
}

function cleanupTmpRoot() {
  if (!tmpRoot) return
  try {
    rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // 清理失败不影响结果，临时目录在系统 tmp 下
  }
  tmpRoot = null
}
process.on('exit', cleanupTmpRoot)

function safeRead(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function displayCmd(args) {
  const quote = (value) => (/[\s"'\\]/.test(value) ? `"${value}"` : value)
  return ['git', '-C', quote(options.upstream), ...args.map(quote)].join(' ')
}

function runGit(args, { timeout = GIT_TIMEOUT_MS } = {}) {
  const startedAt = Date.now()
  const dir = ensureTmpRoot()
  tmpCounter += 1
  const outPath = path.join(dir, `out-${tmpCounter}.txt`)
  const errPath = path.join(dir, `err-${tmpCounter}.txt`)
  const outFd = openSync(outPath, 'w')
  const errFd = openSync(errPath, 'w')
  let proc
  try {
    proc = spawnSync('git', ['-C', options.upstream, ...args], {
      stdio: ['ignore', outFd, errFd],
      timeout,
      windowsHide: true,
      env: {
        ...process.env,
        // 断网/无凭据时不要让 git 卡在交互式输入上
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
        GIT_PAGER: 'cat',
        LC_ALL: 'C',
      },
    })
  } finally {
    closeSync(outFd)
    closeSync(errFd)
  }
  const stdout = safeRead(outPath).trim()
  const stderr = safeRead(errPath).trim()
  const timedOut = Boolean(proc.error && proc.error.code === 'ETIMEDOUT')
  const record = {
    cmd: displayCmd(args),
    ok: proc.status === 0,
    code: proc.status,
    timedOut,
    durationMs: Date.now() - startedAt,
    stderr,
    stdout,
  }
  result.gitCommands.push({
    cmd: record.cmd,
    ok: record.ok,
    code: record.code,
    timedOut,
    durationMs: record.durationMs,
  })
  if (proc.error && !timedOut) {
    record.error = proc.error.message
  }
  return record
}

function fatal(message, details = []) {
  result.verdict = { level: 'undetermined', exitCode: EXIT_UNDETERMINED, message }
  result.error = message
  if (details.length) result.errorDetails = details
  if (jsonMode) {
    finishJson()
  } else {
    for (const line of details) console.error(`[check-upstream-sync]   ${line}`)
    console.error(`[check-upstream-sync] 无法判定：${message}`)
    console.error('[check-upstream-sync] 退出码: 2')
  }
  process.exit(EXIT_UNDETERMINED)
}

// —— 分类 ——

function classifyPath(filePath) {
  for (const rule of RULES) {
    if (rule.test(filePath)) return { tier: rule.tier, reason: rule.reason }
  }
  return {
    tier: 'must',
    reason: '未分类路径（默认按必须跟进处理，请人工确认）',
    unclassified: true,
  }
}

function moreSevereTier(a, b) {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b
}

function bucketOf(filePath) {
  const segments = filePath.split('/')
  if (segments.length === 1) return filePath
  return `${segments[0]}/`
}

// —— 主流程 ——

function main() {
  options = parseArgs(process.argv.slice(2))
  jsonMode = options.json
  result.options = options
  result.limitations = [
    '分类是路径规则驱动，不看 diff 语义：注释级改动命中核心文件时也会判「必须跟进」（宁多报不漏报，triage 由人做）。',
    '文件清单是基线..ref 的净 diff：期间「新增后又删除」的文件不会出现，需要逐 commit 细节时手工看 git log --name-status。',
    '只比对所选 ref（默认 origin/main）。上游 dev 等分支需要 --ref origin/dev 单独跑（本轮就有 dev-only 提交）。',
    'fetch 只更新 remote-tracking ref 与对象库，不 checkout、不动上游工作树；脚本不写本仓库任何文件。',
    '路径分类按 `/` 分目录；含制表符等极端文件名可能解析不准（上游当前无此类路径）。',
  ]

  if (options.help) {
    if (jsonMode) {
      result.verdict = { level: 'help', exitCode: EXIT_OK, message: 'help' }
      finishJson()
    } else {
      console.log(HELP)
    }
    process.exit(EXIT_OK)
  }

  const upstreamDir = path.resolve(options.upstream)
  if (!existsSync(upstreamDir)) {
    fatal(`上游副本不存在：${upstreamDir}`, [
      '先按 docs/PLAN.md §2.1 准备只读副本，或用 --upstream 指定路径。',
    ])
  }
  if (!existsSync(path.join(upstreamDir, '.git'))) {
    fatal(`不是 git 仓库：${upstreamDir}`, ['需要含 .git 的上游副本才能比对提交历史。'])
  }

  // ——— 1. HEAD 确认（spec 要求：先看 HEAD 是否命中基线）———
  const headRes = runGit(['rev-parse', 'HEAD'])
  if (!headRes.ok) {
    fatal('无法读取上游副本 HEAD', [headRes.stderr || headRes.error || 'git rev-parse HEAD 失败'])
  }
  const head = headRes.stdout

  const shallowRes = runGit(['rev-parse', '--is-shallow-repository'])
  const shallow = shallowRes.ok && shallowRes.stdout === 'true'
  if (shallow) {
    warn('上游副本是 shallow clone：历史不完整，跨基线比对可能缺提交（必要时 git fetch --unshallow）')
  }

  // ——— 2. 基线与登记表锚点 ———
  const baselineRes = runGit(['rev-parse', '--verify', `${options.baseline}^{commit}`])
  if (!baselineRes.ok) {
    fatal(`无法解析基线 ${options.baseline}`, [
      baselineRes.stderr || baselineRes.error || '该 commit 不在上游副本里（shallow？先 fetch）',
    ])
  }
  const baselineFull = baselineRes.stdout
  const documented = readDocumentedBaseline()
  const headMatchesBaseline = matchesBaselinePrefix(head, options.baseline)

  result.upstream = {
    path: upstreamDir,
    head,
    shallow,
    baseline: {
      input: options.baseline,
      full: baselineFull,
      short: baselineFull.slice(0, 8),
      headMatches: headMatchesBaseline,
      documentedCommit: documented ? documented.commit : null,
      documentedVersion: documented ? documented.version : null,
      documentedMatches: documented ? documented.commit === baselineFull : null,
    },
  }
  if (!headMatchesBaseline) {
    warn(`上游副本 HEAD(${head.slice(0, 8)}) 与基线 ${options.baseline} 不一致；比对仍按基线做，但副本可能被 checkout 到别处`)
  }
  if (documented && documented.commit !== baselineFull) {
    warn(
      `基线 ${baselineFull.slice(0, 8)} 与 docs/upstream-delta.md 锚点 ` +
        `${String(documented.commit).slice(0, 8)} 不一致（登记表 §5 需要同步）`,
    )
  }

  // ——— 3. 取远端 ref（网络 / 离线 / 本地区间）———
  const refSpec = parseRef(options.ref, options.remote)
  const dataSource = {
    mode: null,
    remote: refSpec.remote,
    ref: options.ref,
    branch: refSpec.branch,
    tracking: refSpec.tracking,
    tip: null,
    tipShort: null,
    latest: null,
    latestReason: null,
    fetchedAt: null,
    fetchCommands: [],
  }

  if (refSpec.tracking && !options.offline) {
    fetchTrackingRef(refSpec, dataSource)
  } else if (refSpec.tracking && options.offline) {
    dataSource.mode = 'offline'
    dataSource.latest = false
    dataSource.latestReason = '--offline：未联网，只用本地已有的 remote-tracking ref'
  } else {
    dataSource.mode = 'local-ref'
    dataSource.latest = null
    dataSource.latestReason = '本地 commit-ish 区间比较，不涉及远端，最新性无意义'
  }

  const tipRes = runGit(['rev-parse', '--verify', `${options.ref}^{commit}`])
  if (!tipRes.ok) {
    fatal(`无法解析比较目标 ref：${options.ref}`, [
      tipRes.stderr || tipRes.error || '本地不存在该 ref；联网跑一次或先 git fetch 对应分支',
    ])
  }
  const tip = tipRes.stdout
  const tipDateRes = runGit(['log', '-1', '--format=%ad', '--date=iso-strict', tip])
  dataSource.tip = tip
  dataSource.tipShort = tip.slice(0, 8)
  dataSource.tipDate = tipDateRes.ok ? tipDateRes.stdout : null
  result.dataSource = dataSource

  // ——— 4. 历史连通性（shallow / 分支不相关时会断）———
  const connected = isAncestor(baselineFull, tip)
  if (!connected) {
    if (shallow && dataSource.mode === 'network') {
      deepenUntilConnected(refSpec, baselineFull, dataSource)
    }
    if (!isAncestor(baselineFull, tip)) {
      fatal(`基线 ${baselineFull.slice(0, 8)} 不是 ${options.ref}(${tip.slice(0, 8)}) 的祖先`, [
        '两边历史不连通（常见原因：shallow clone、或该分支不是从基线分出来的）。',
        shallow
          ? `先执行 git -C "${upstreamDir}" fetch --unshallow 再跑本脚本。`
          : '请确认 --baseline / --ref 是否配对（例如 --baseline <旧 tag> --ref origin/main）。',
      ])
    }
  }

  // ——— 5. 新提交 ———
  const range = `${baselineFull}..${tip}`
  const logRes = runGit([
    'log',
    '--format=%H%x1f%ad%x1f%an%x1f%s',
    '--date=iso-strict',
    range,
  ])
  if (!logRes.ok) {
    fatal('读取新提交失败', [logRes.stderr || logRes.error || `git log ${range} 失败`])
  }
  const commits = logRes.stdout
    ? logRes.stdout.split('\n').map((line) => {
        const [hash, date, author, subject] = line.split('\x1f')
        return { hash, short: hash.slice(0, 8), date, author, subject }
      })
    : []

  // ——— 6. 变更文件（净 diff，含重命名）———
  const diffRes = runGit(['-c', 'core.quotePath=false', 'diff', '--name-status', '-M', range])
  if (!diffRes.ok) {
    fatal('读取变更文件失败', [diffRes.stderr || diffRes.error || `git diff ${range} 失败`])
  }
  const fileEntries = parseNameStatus(diffRes.stdout)
  const shortstatRes = runGit(['-c', 'core.quotePath=false', 'diff', '--shortstat', '-M', range])
  const stats = parseShortstat(shortstatRes.ok ? shortstatRes.stdout : '')

  const classified = fileEntries.map((entry) => {
    const primary = classifyPath(entry.path)
    let tier = primary.tier
    let reason = primary.reason
    let unclassified = Boolean(primary.unclassified)
    if (entry.from) {
      const previous = classifyPath(entry.from)
      const merged = moreSevereTier(primary.tier, previous.tier)
      if (merged !== primary.tier) {
        tier = merged
        reason = `${primary.reason}；旧路径属「${TIER_LABEL[previous.tier]}」（取更严格档）`
      }
      if (previous.unclassified) unclassified = true
    }
    return { ...entry, tier, reason, unclassified, bucket: bucketOf(entry.path) }
  })

  const byTier = { must: [], optional: [], ignored: [] }
  for (const entry of classified) byTier[entry.tier].push(entry)

  const byBucket = summarizeBuckets(classified)
  const unclassifiedCount = classified.filter((entry) => entry.unclassified).length

  result.history = {
    baseline: baselineFull,
    baselineShort: baselineFull.slice(0, 8),
    tip,
    tipShort: tip.slice(0, 8),
    connected: true,
    range,
    commitCount: commits.length,
    commits,
  }
  result.files = {
    count: classified.length,
    insertions: stats.insertions,
    deletions: stats.deletions,
    shortstat: stats.raw,
    byTier,
    byBucket,
  }
  result.summary = {
    commits: commits.length,
    files: classified.length,
    mustFollow: byTier.must.length,
    optional: byTier.optional.length,
    ignored: byTier.ignored.length,
    unclassified: unclassifiedCount,
  }

  // ——— 7. 结论与退出码 ———
  const verdict = decideVerdict({ dataSource, summary: result.summary })
  result.verdict = verdict

  if (jsonMode) {
    finishJson()
  } else {
    printHuman(documented)
  }
  process.exit(verdict.exitCode)
}

// —— 输入解析辅助 ——

function matchesBaselinePrefix(headSha, input) {
  const normalized = String(input).trim().toLowerCase()
  const headLower = String(headSha).toLowerCase()
  if (/^[0-9a-f]{40}$/.test(normalized)) return headLower === normalized
  if (/^[0-9a-f]{4,39}$/.test(normalized)) return headLower.startsWith(normalized)
  return false
}

function parseRef(ref, remote) {
  const match = new RegExp(`^${remote}/(.+)$`).exec(ref)
  if (match) return { tracking: true, remote, branch: match[1] }
  return { tracking: false, remote: null, branch: null }
}

/** remote.<name>.fetch 是否覆盖该分支（wildcard 或精确分支）。 */
function refspecCovers(remote, branch) {
  const configRes = runGit(['config', '--get-all', `remote.${remote}.fetch`])
  if (!configRes.ok || !configRes.stdout) return false
  return configRes.stdout.split('\n').some((line) => {
    const spec = line.trim().replace(/^\+/, '')
    const [src, dst = ''] = spec.split(':')
    if (!src.startsWith('refs/heads/')) return false
    const srcBranch = src.slice('refs/heads/'.length)
    if (srcBranch === '*') return Boolean(dst)
    return srcBranch === branch
  })
}

function fetchTrackingRef(refSpec, dataSource) {
  const { remote, branch } = refSpec
  const commands = []
  const plain = runGit(['fetch', remote, '--quiet'], { timeout: FETCH_TIMEOUT_MS })
  commands.push({
    cmd: plain.cmd,
    ok: plain.ok,
    code: plain.code,
    stderr: plain.stderr,
    timeoutMs: FETCH_TIMEOUT_MS,
  })

  // 单分支 refspec 的副本里，非默认分支必须显式 refspec fetch 才会刷新。
  const covers = plain.ok && refspecCovers(remote, branch)
  if (!covers) {
    const explicit = runGit(
      ['fetch', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`, '--quiet'],
      { timeout: FETCH_TIMEOUT_MS },
    )
    commands.push({
      cmd: explicit.cmd,
      ok: explicit.ok,
      code: explicit.code,
      stderr: explicit.stderr,
      timeoutMs: FETCH_TIMEOUT_MS,
      note: covers ? null : 'remote.<name>.fetch 未覆盖该分支，显式 refspec fetch',
    })
  }

  dataSource.fetchCommands = commands
  const allOk = commands.every((entry) => entry.ok)
  if (allOk) {
    dataSource.mode = 'network'
    dataSource.latest = true
    dataSource.latestReason = 'fetch 成功，已与远端核对（fetch 时刻）'
    dataSource.fetchedAt = localIso()
  } else {
    dataSource.mode = 'offline-fallback'
    dataSource.latest = false
    dataSource.latestReason = 'fetch 失败，已回退到本地 refs；无法断言远端是否最新'
    warn(
      `fetch 失败（${commands
        .filter((entry) => !entry.ok)
        .map((entry) => `${entry.cmd} → exit ${entry.code}`)
        .join('；')}），回退到本地 refs`,
    )
  }
}

function isAncestor(ancestor, descendant) {
  const res = runGit(['merge-base', '--is-ancestor', ancestor, descendant])
  if (res.code === 0) return true
  if (res.code === 1) return false
  fatal('无法判断历史连通性（git merge-base 失败）', [res.stderr || res.error || ''])
}

function deepenUntilConnected(refSpec, baselineFull, dataSource) {
  for (const depth of [100, 1000]) {
    const deepen = runGit(['fetch', `--deepen=${depth}`, refSpec.remote, '--quiet'], {
      timeout: FETCH_TIMEOUT_MS,
    })
    dataSource.fetchCommands.push({
      cmd: deepen.cmd,
      ok: deepen.ok,
      code: deepen.code,
      stderr: deepen.stderr,
      note: `shallow 历史不足以连接基线，尝试加深（depth ${depth}）`,
    })
    if (!deepen.ok) return
    if (isAncestor(baselineFull, dataSource.tip)) return
  }
}

function parseNameStatus(text) {
  if (!text) return []
  const entries = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line) continue
    const fields = line.split('\t')
    const status = fields[0]
    if (status.startsWith('R') || status.startsWith('C')) {
      const [, from, to] = fields
      if (!to) continue
      entries.push({ status, path: to, from })
      continue
    }
    const filePath = fields.slice(1).join('\t')
    if (!filePath) continue
    entries.push({ status, path: filePath })
  }
  return entries
}

function parseShortstat(text) {
  const raw = String(text || '').trim()
  const files = /(\d+) files? changed/.exec(raw)
  const insertions = /(\d+) insertions?\(\+\)/.exec(raw)
  const deletions = /(\d+) deletions?\(-\)/.exec(raw)
  return {
    raw: raw || '',
    files: files ? Number(files[1]) : 0,
    insertions: insertions ? Number(insertions[1]) : 0,
    deletions: deletions ? Number(deletions[1]) : 0,
  }
}

function summarizeBuckets(classified) {
  const buckets = new Map()
  for (const entry of classified) {
    if (!buckets.has(entry.bucket)) {
      buckets.set(entry.bucket, { bucket: entry.bucket, must: 0, optional: 0, ignored: 0 })
    }
    buckets.get(entry.bucket)[entry.tier] += 1
  }
  return [...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket))
}

function readDocumentedBaseline() {
  if (!existsSync(DELTA_DOC)) {
    warn('docs/upstream-delta.md 不存在，跳过登记表基线一致性检查')
    return null
  }
  const text = readFileSync(DELTA_DOC, 'utf8')
  const match =
    /<!--\s*upstream-delta:begin\s*-->\s*```json\s*([\s\S]*?)```\s*<!--\s*upstream-delta:end\s*-->/m.exec(text)
  if (!match) {
    warn('docs/upstream-delta.md 缺少 upstream-delta:begin/end 锚点，跳过登记表基线一致性检查')
    return null
  }
  try {
    const anchor = JSON.parse(match[1])
    return { commit: anchor.upstreamCommit ?? null, version: anchor.upstreamVersion ?? null }
  } catch (error) {
    warn(`docs/upstream-delta.md 锚点 JSON 解析失败：${error.message}`)
    return null
  }
}

function decideVerdict({ dataSource, summary }) {
  if (summary.mustFollow > 0) {
    const staleNote =
      dataSource.latest === false ? '（注意：数据源不是最新，需联网复跑确认）' : ''
    return {
      level: 'must-follow',
      exitCode: EXIT_MUST_FOLLOW,
      message: `发现 ${summary.mustFollow} 个必须跟进变更，需要人工处理${staleNote}`,
    }
  }
  if (dataSource.latest === false && dataSource.mode === 'offline-fallback') {
    return {
      level: 'undetermined',
      exitCode: EXIT_UNDETERMINED,
      message: '数据源不是最新（fetch 失败且回退本地 refs），无法断言上游没有必须跟进变更',
    }
  }
  if (summary.commits === 0 && summary.files === 0) {
    const offlineNote =
      dataSource.mode === 'offline' ? '（离线判定：只用本地 refs，未与远端核对）' : ''
    return {
      level: 'clean',
      exitCode: EXIT_OK,
      message: `基线之后上游没有新提交${offlineNote}`,
    }
  }
  const offlineNote =
    dataSource.mode === 'offline' ? '（离线判定：只用本地 refs，未与远端核对）' : ''
  return {
    level: 'clean',
    exitCode: EXIT_OK,
    message: `基线之后有 ${summary.commits} 个新提交 / ${summary.files} 个变更文件，均属可选或无关${offlineNote}`,
  }
}

// —— 人类可读输出 ——

function printHuman(documented) {
  const { upstream: up, dataSource: source, history, files, summary, verdict } = result
  human(`上游副本: ${up.path}`)
  human(`HEAD: ${up.head}${up.baseline.headMatches ? `（命中基线 ${up.baseline.input}）` : ''}`)

  if (source.mode === 'network') {
    human(
      `数据来源: 网络 fetch（remote=${source.remote}, branch=${source.branch}）→ ${source.ref} @ ` +
        `${source.tipShort}；fetch 时间 ${source.fetchedAt}；是否最新: 是（已与远端核对）`,
    )
  } else if (source.mode === 'offline') {
    human(
      `数据来源: --offline（只用本地 refs，未联网）→ ${source.ref} @ ${source.tipShort}；` +
        `是否最新: 否（本地 ref 最新提交日期 ${source.tipDate ?? '未知'}，需要联网复跑才能断言）`,
    )
  } else if (source.mode === 'offline-fallback') {
    human(
      `数据来源: fetch 失败，回退本地 refs → ${source.ref} @ ${source.tipShort}；` +
        `是否最新: 否（需要联网复跑才能断言）`,
    )
  } else {
    human(`数据来源: 本地 ref（不联网）→ ${source.ref} @ ${source.tipShort}；是否最新: 不适用（本地区间比较）`)
  }
  human(
    `基线: ${history.baselineShort} → ${history.baseline}` +
      `；登记表锚点: ${documented ? `${String(documented.commit).slice(0, 8)}（${documented.version}）` : '未读到'}` +
      `${up.baseline.headMatches ? '' : '；HEAD 与基线不一致'}`,
  )
  human(`新提交: ${history.commitCount} 个`)
  for (const commit of history.commits) {
    human(`  - ${commit.short}  ${commit.date}  ${commit.author}  ${commit.subject}`)
  }
  const tierCounts =
    `必须跟进 ${summary.mustFollow} / 可选 ${summary.optional} / 无关 ${summary.ignored}` +
    (summary.unclassified > 0 ? `（其中未分类 ${summary.unclassified}）` : '')
  const statLine =
    files.count > 0 ? `（+${files.insertions} / −${files.deletions} 行）` : ''
  human(`变更文件: ${summary.files} 个${statLine}；${tierCounts}`)

  if (files.count > 0) {
    human('分类明细:')
    for (const tier of TIERS) {
      const group = files.byTier[tier]
      if (!group || group.length === 0) continue
      human(`  ${TIER_LABEL[tier]}（${group.length}）`)
      for (const entry of group) {
        const pathLabel = entry.from ? `${entry.from} → ${entry.path}` : entry.path
        human(`    ${entry.status.padEnd(4)} ${pathLabel.padEnd(52)} ${entry.reason}`)
      }
    }
    const bucketLine = files.byBucket
      .map((bucket) => `${bucket.bucket} ${bucket.must}/${bucket.optional}/${bucket.ignored}`)
      .join(' | ')
    human(`按目录（必须/可选/无关）: ${bucketLine}`)
  }

  for (const message of result.warnings) human(`警告: ${message}`)
  for (const message of result.limitations) human(`限制: ${message}`)
  human(`结论: ${verdict.message}`)
  human(`退出码: ${verdict.exitCode}`)

  for (const line of humanLines) console.log(`[check-upstream-sync] ${line}`)
}

try {
  main()
} catch (error) {
  if (options === null) {
    // 参数解析阶段就失败（options 还没建立）
    console.error(`[check-upstream-sync] 参数错误：${error.message}`)
    console.error(HELP)
    process.exit(EXIT_UNDETERMINED)
  }
  if (jsonMode) {
    result.verdict = { level: 'undetermined', exitCode: EXIT_UNDETERMINED, message: error.message }
    result.error = error.message
    finishJson()
  } else {
    console.error(`[check-upstream-sync] 异常：${error.message}`)
  }
  process.exit(EXIT_UNDETERMINED)
}
