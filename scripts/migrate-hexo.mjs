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
 *   模板 src/ 全量拷贝进输出站（自包含，无跨仓引用）。
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
// 模板根 = 仓库根（单包模板仓，src/ 全量随输出站拷贝，不再跨仓引用）。
const TEMPLATE = REPO_ROOT
const DEFAULTS_TS = path.join(REPO_ROOT, 'src', 'config', 'defaults.ts')

/** [...path].astro 实际分发的 page.type；default 是无 type 时的兜底。 */
const STANDARD_PAGE_TYPES = new Set([
  'tags', 'categories', 'link', 'essay', 'room', 'about', 'album',
  'album_detail', 'music', 'equipment', 'fcircle', 'todolist', 'default',
])

/**
 * 1.6.14 有、1.7.1 上游默认配置里没有，但**主题包保留为兼容键**的顶层配置。
 *
 * 与 `--upstream` 对比时它们不算「缺失键」，配置原样写进 `anzhiyu.config.yml`：
 *   - `friends_lite`：1.6.14 的 Lite 朋友圈；主题包 schema 标 deprecated 并保留了
 *     `FcirclePage.astro` 的 lite 分支，真实站迁移后 `/fcircle/` 不丢内容（P7-4）。
 */
const LEGACY_THEME_KEYS = new Set(['friends_lite'])

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
                          不传时用本仓库 src/config/defaults.ts
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

/**
 * 用 Intl 求 IANA 时区相对 UTC 在指定时刻的偏移（分钟）；无法解析返回 null。
 *
 * 与旧行为的两处差异（C1）：
 * - 裸 `GMT`（无 ± 数字，如 UTC / GMT / Etc/*，某些 ICU 版本对 UTC 只给 `GMT`）记 0，
 *   不再因正则不匹配而回落 +08:00 把 UTC 站日期平移 8 小时。
 * - 采样时刻由 `at` 指定（DST 时区按文章日期现场换算），不再固定采 2024-06-01。
 *
 * @param {string} tz IANA 时区名
 * @param {Date|string|number} at 采样时刻；缺省 2024-06-01（仅作单常量兜底/非 DST 站用）
 * @returns {number|null} 相对 UTC 的分钟偏移，无法解析返回 null
 */
function timezoneOffsetMinutes(tz, at = new Date('2024-06-01T00:00:00Z')) {
  if (!tz || typeof tz !== 'string') return null
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date(at))
    const label = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    // 兼容 `GMT+8` / `GMT+5:30` / 裸 `GMT`（= 0）：偏移段整体可选，缺省即 UTC。
    const match = /GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?/.exec(label)
    if (!match) return null
    if (!match[1]) return 0 // 裸 GMT / GMT+0 → 0（不再回落 +08:00）
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
/* Hexo 插件产物（generator 等价实现）                                  */
/* ------------------------------------------------------------------ */
/*
 * 上游 Hexo 主题靠**插件**在 `hexo generate` 阶段注入额外产物，Astro 没有插件
 * 机制。这里在迁移期按插件源码逐份移植「产物生成」，产物写进目标站：
 *
 *   hexo-butterfly-envelope   → <envelope_comment.path>/index.html（信笺留言板）
 *   hexo-bilibili-bangumi     → <bangumi.path>/index.html（想看/在看/已看 三 tab）
 *   hexo-safego               → <hexo_safego.security.html_file_name>（安全跳转页）
 *   主题 scripts/helpers/random.js generator → <random.path>（随机文章 / 页脚随机友链）
 *
 * 原则：
 *   1. 内容全部由源站 `_config.yml` 的插件配置与 `source/_data/*` 数据驱动，
 *      不写死源站身份：author / title / avatar / url / root 都从 site.config.ts
 *      或插件配置段取；
 *   2. 配置缺失或 enable=false / 数据文件不存在 → 打印「跳过」日志、不产出文件，
 *      对没有这些插件的站点安全；
 *   3. 服务端渲染部分完全静态化。bangumi 的 tab 切换/分页用插件原逻辑的移植版，
 *      但不再在浏览器里用 axios+pug 二次拉 `bangumis.json` 渲染剩余条目
 *      （迁移期把数据一次性渲染进 HTML，见 docs/notes/phases/P7-4-fix-plugin-pages.md）；
 *   4. /comments/ 与 /bangumis/ 走主题 BaseLayout 外壳（#body-wrap / Header /
 *      Footer / aside），与其它独立页面一致；/go.html 是独立单页（无主题外壳，
 *      与源站 hexo-safego 产物一致）。
 */

/** hexo-safego index.js 的默认配置（插件 `Object.assign(defaults, userConfig)` 的 defaults）。 */
const SAFEGO_DEFAULTS = {
  general: { enable: false, enable_base64_encode: true, enable_target_blank: true },
  security: { url_param_name: 'u', html_file_name: 'go.html', ignore_attrs: ['data-fancybox'] },
  scope: { apply_containers: [], apply_pages: [], exclude_pages: [] },
  whitelist: { domain_whitelist: [] },
  appearance: {
    avatar: 'https://cdn.jsdelivr.net/npm/hexo-safego/lib/avatar.png',
    title: '请填写网站名称',
    subtitle: '请填写网站副标题',
    darkmode: false,
    countdowntime: -1,
  },
  debug: { enable: false },
}

/** hexo-bilibili-bangumi lib/util.js 的 i18n 词典（逐字移植）。 */
const BANGUMI_I18N = {
  en: {
    wantWatch: 'Wish', watched: 'Watched', watching: 'Watching', prev: 'Prev', next: 'Next',
    top: 'Top', end: 'End', wantPlay: 'Wish', playing: 'Playing', played: 'Played',
    type: 'Type', tag: 'Tags', score: 'Score', follow: 'Follow', summary: 'Summary',
    comment: 'My Comment', noSummary: 'No Summary', unknown: 'Unknown', view: 'Views',
    coin: 'Coins', danmaku: 'Danmaku', myScore: 'My Score', area: 'Area', year: 'Year',
  },
  'zh-TW': {
    wantWatch: '想看', watched: '看過', watching: '在看', prev: '上一頁', next: '下一頁',
    top: '首頁', end: '尾頁', wantPlay: '想玩', playing: '在玩', played: '玩過',
    type: '類型', tag: '標籤', score: '評分', follow: '關注', summary: '簡介',
    comment: '我的評價', noSummary: '暫無簡介', unknown: '未知', view: '總播放',
    coin: '硬幣', danmaku: '彈幕', myScore: '我的評分', area: '地區', year: '年份',
  },
  'zh-Hans': {
    wantWatch: '想看', watched: '看过', watching: '在看', prev: '上一页', next: '下一页',
    top: '首页', end: '尾页', wantPlay: '想玩', playing: '在玩', played: '玩过',
    type: '类型', tag: '标签', score: '评分', follow: '关注', summary: '简介',
    comment: '我的评价', noSummary: '暂无简介', unknown: '未知', view: '总播放',
    coin: '硬币', danmaku: '弹幕', myScore: '我的评分', area: '地区', year: '年份',
  },
  'zh-CN': {
    wantWatch: '想看', watched: '已看', watching: '在看', prev: '上一页', next: '下一页',
    top: '首页', end: '尾页', wantPlay: '想玩', playing: '在玩', played: '玩过',
    type: '类型', tag: '标签', score: '评分', follow: '关注', summary: '简介',
    comment: '我的评价', noSummary: '暂无简介', unknown: '未知', view: '总播放',
    coin: '硬币', danmaku: '弹幕', myScore: '我的评分', area: '地区', year: '年份',
  },
}

/** hexo-bilibili-bangumi 的页面内 CSS（lib/templates/index.css，逐字节移植；golden 同源）。 */
const BANGUMI_INDEX_CSS = String.raw`.bangumi-tabs{margin-bottom:15px;margin-top:15px}.bangumi-tab{padding:5px}a.bangumi-tab{text-decoration:none}.bangumi-active{background:#657b83;color:#fff}.bangumi-item{position:relative;clear:both;padding:10px 0;border-bottom:1px solid #ddd;min-height:180px}@media screen and (max-width:600px){.bangumi-item{width:100%}}.bangumi-picture{position:absolute;left:0;top:10px;width:110px}.bangumi-picture img{margin:10px 0}.bangumi-info{padding-left:120px;margin-top:10px;min-height:160px}.bangumi-meta{font-size:12px;padding-right:10px;height:45px}.bangumi-summary{font-size:12px;margin-top:10px}.bangumi-summary>p{word-break:break-all;text-overflow:ellipsis;overflow:hidden;height:72px;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-clamp:3}.bangumi-summary>p.has-bangumi-progress{height:48px;-webkit-line-clamp:2;line-clamp:2}.bangumi-comments{font-size:12px}.bangumi-pagination{margin-top:15px;text-align:center;margin-bottom:10px}.bangumi-button{padding:5px}.bangumi-button:hover{background:#657b83;color:#fff}.bangumi-hide{display:none}.bangumi-show{display:block}.bangumi-title{font-size:18px;font-weight:700}.bangumi-title a{line-height:1;text-decoration:none}.bangumi-info-items{font-size:12px;color:#2fd8d8;padding-top:10px;line-height:1;float:left;width:100%;height:45px}.bangumi-info-item{display:inline-block;width:13%;border-right:1px solid #2fd8d8;text-align:center;height:34px}.bangumi-info-label{display:block;line-height:12px}.bangumi-info-item em{display:block;padding-top:6px;line-height:17px;font-style:normal;font-weight:700}.bangumi-info-total{padding-top:11px;display:block;line-height:12px;font-weight:700}.bangumi-info-item-score{border-right:1px solid #0000;width:50px}.bangumi-info-label-em{color:transparent;opacity:0;visibility:hidden;line-height:6px!important;padding:0!important}@media (max-width:650px){.bangumi-coin,.bangumi-type{display:none}.bangumi-info-item{width:16%}}@media (max-width:590px){.bangumi-danmaku,.bangumi-wish{display:none}.bangumi-info-item{width:19%}}@media (max-width:520px){.bangumi-doing,.bangumi-play{display:none}.bangumi-info-item{width:24%}}@media (max-width:480px){.bangumi-collect,.bangumi-follow,.bangumi-info-item-follow{display:none}.bangumi-info-item{width:30%}}@media (max-width:400px){.bangumi-area,.bangumi-tag{display:none}.bangumi-info-item{width:45%}}@media (max-width:270px){.bangumi-info-item-score{display:none}.bangumi-info-item{width:100%;border-right:none}}.bangumi-my-comments{border:1px dashed #8f8f8f;padding:3px;border-radius:5px}.bangumi-starstop{background:url(https://cdn.jsdelivr.net/npm/hexo-bilibili-bangumi@1.7.9/lib/img/rate_star_2x.png) 100% 100%/10px 19.5px repeat-x;height:10px;width:50px;display:inline-block;float:none}.bangumi-starlight{background:url(https://cdn.jsdelivr.net/npm/hexo-bilibili-bangumi@1.7.9/lib/img/rate_star_2x.png) 0 0/10px 19.5px repeat-x;height:10px;display:block;width:100%}.bangumi-starlight.stars1{width:5px}.bangumi-starlight.stars2{width:10px}.bangumi-starlight.stars3{width:15px}.bangumi-starlight.stars4{width:20px}.bangumi-starlight.stars5{width:25px}.bangumi-starlight.stars6{width:30px}.bangumi-starlight.stars7{width:35px}.bangumi-starlight.stars8{width:40px}.bangumi-starlight.stars9{width:45px}.bangumi-starlight.stars10{width:50px}.bangumi-info .bangumi-progress{width:100%;height:24px;background-color:#f2f2f2;border-radius:5px;overflow:hidden;font-size:16px;text-align:center;position:relative}.bangumi-info .bangumi-progress-text{z-index:100;position:relative;color:#3c4858;line-height:24px}.bangumi-info .bangumi-progress .progress-bar{z-index:50;height:100%;background-color:#007bffad;border-radius:5px;position:absolute;top:0}`

/** hexo-safego 的 go.html 模板（插件自带 Nunjucks 模板，逐字节移植）。 */
const SAFEGO_TEMPLATE = String.raw`<!DOCTYPE html><html lang="zh"><head><meta http-equiv="X-UA-Compatible"content="IE=edge"><meta name="viewport"content="width=device-width,initial-scale=1,user-scalable=no"><!--添加一个网站图标--><link rel="icon"href="{{avatar}}"type="image/x-icon"><meta http-equiv="Content-Type"content="text/html; charset=UTF-8"><meta name="robots"content="noindex, nofollow"/><title>😃页面加载中，请稍候...</title><style type="text/css">body{overflow:hidden;height:100vh;width:100vw;margin:0;padding:0}.container{display:flex;align-items:center;justify-content:center;height:100%;width:100%;margin:0;flex-direction:column}.avatar-placeholder,.avatar{width:100px;height:100px;border-radius:50%;margin-bottom:15px;display:block}.avatar{display:none}.description{font-size:20px;font-weight:600}.subtitle{font-size:15px;margin-bottom:20px;color:#C4C4C4}.loading{text-align:center;padding:30px;border-radius:25px;animation:fadein 2s;width:450px;max-width:80%;transition:all 0.3s ease-in-out}@keyframes fadein{from{opacity:0}to{opacity:1}}.content{margin-bottom:20px}.url-text{margin-bottom:10px;font-size:16px;letter-spacing:1px}.jump-url{position:relative;font-size:20px;display:block;margin-top:5px;margin-bottom:25px;padding:15px;border-radius:18px;height:25px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.copy-btn-container{position:absolute;display:flex;align-items:center;right:10px;top:50%;transform:translateY(-50%);height:100%;width:63px;flex-direction:row-reverse}.copy-btn{width:40px;height:40px;border-radius:12px;border:1px solid#a4a4a4;transition:all 0.3s ease-in-out}.copy-btn-container svg{width:25px;height:25px;fill:#888}.countdown-text{margin-top:12px;font-size:12px}.button-container{display:flex;justify-content:center;gap:20%;margin-top:20px}.button{padding:10px 20px;border-radius:16px;border:none;cursor:pointer;font-size:16px;width:120px;height:40px}.cancel-button{color:black}.confirm-button{color:white}.progress-bar{width:100%;border-radius:5px;overflow:hidden;height:10px;margin-top:20px}.progress{width:100%;height:100%;transition:width 1s}{%if darkmode==true%}body{background:linear-gradient(135deg,#364f6b,#222831)}.loading{border:1px solid#777;background:#393e46;color:#EFEFEF;box-shadow:0 16px 32px rgba(100,100,100,0.1)}.loading:hover{box-shadow:0 16px 32px rgba(100,100,100,0.2)}.description{color:#F3F3F3}.url-text,.countdown-text{color:#EFEFEF}.jump-url{border:1px solid#777;background-color:#333;color:#EFEFEF}.copy-btn-container{background:linear-gradient(to left,#333 75%,transparent 100%)}.copy-btn{background-color:#222831}.copy-btn:hover{box-shadow:0 16px 32px rgba(100,100,100,0.2)}.cancel-button{background-color:#872C2C;color:#FFF}.confirm-button{background-color:#28566F;color:#FFF}.progress-bar{background-color:#444}.progress{background-color:#888}{%elif darkmode==false%}body{background:linear-gradient(135deg,#E9E9E9,#FFFFFF)}.loading{border:1px solid#ccc;background:rgba(255,255,255,0.7);box-shadow:0 16px 32px rgba(0,0,0,0.1)}.loading:hover{box-shadow:0 16px 32px rgba(0,0,0,0.2)}.url-text{color:#333}.jump-url{border:1px solid#ccc;background-color:#F7F9FE;color:#333}.copy-btn-container{background:linear-gradient(to left,#F7F9FE 75%,transparent 100%)}.copy-btn{background-color:#F7F9FE}.copy-btn:hover{box-shadow:0 16px 32px rgba(100,100,100,0.2)}.countdown-text{color:#515151}.cancel-button{background-color:#a6e3e9}.confirm-button{background-color:#3fc1c9}.progress{background-color:#abedd8}{%elif darkmode=="auto"%}@media(prefers-color-scheme:dark){body{background:linear-gradient(135deg,#364f6b,#222831)}.loading{border:1px solid#777;background:#393e46;color:#EFEFEF;box-shadow:0 16px 32px rgba(100,100,100,0.1)}.loading:hover{box-shadow:0 16px 32px rgba(100,100,100,0.2)}.description{color:#F3F3F3}.url-text,.countdown-text{color:#EFEFEF}.jump-url{border:1px solid#777;background-color:#333;color:#EFEFEF}.copy-btn-container{background:linear-gradient(to left,#333 75%,transparent 100%)}.copy-btn{background-color:#222831}.copy-btn:hover{box-shadow:0 16px 32px rgba(100,100,100,0.2)}.cancel-button{background-color:#872C2C;color:#FFF}.confirm-button{background-color:#28566F;color:#FFF}.progress-bar{background-color:#444}.progress{background-color:#888}}@media(prefers-color-scheme:light){body{background:linear-gradient(135deg,#E9E9E9,#FFFFFF)}.loading{border:1px solid#ccc;background:rgba(255,255,255,0.7);box-shadow:0 16px 32px rgba(0,0,0,0.1)}.loading:hover{box-shadow:0 16px 32px rgba(0,0,0,0.2)}.url-text{color:#333}.jump-url{border:1px solid#ccc;background-color:#F7F9FE;color:#333}.copy-btn-container{background:linear-gradient(to left,#F7F9FE 75%,transparent 100%)}.copy-btn{background-color:#F7F9FE}.copy-btn:hover{box-shadow:0 16px 32px rgba(100,100,100,0.2)}.countdown-text{color:#515151}.cancel-button{background-color:#a6e3e9}.confirm-button{background-color:#3fc1c9}.progress{background-color:#abedd8}}{%endif%}</style><script type="text/javascript">const host=window.location.host;function GetQueryString(name){var reg=new RegExp("(^|&)"+name+"=([^&]*)(&|$)","i");var r=window.location.search.substr(1).match(reg);return r?decodeURI(r[2]):null}function decodeSafeUrlParam(paramStr){const base64=paramStr.replace(/-/g,'+').replace(/_/g,'/');const decoded=decodeURIComponent(atob(base64).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));return decoded}let countdown={{countdown}};let jump_url=GetQueryString('{{url_param_name}}');{%if enable_base64_encode%}jump_url=decodeSafeUrlParam(jump_url);{%endif%}const UrlReg='^((http|https|thunder|qqdl|ed2k|Flashget|qbrowser|ftp|rtsp|mms)://)';if(!jump_url||!jump_url.match(UrlReg)){document.title='参数错误，正在返回首页...';jump_url=location.origin}let progressElement;let countdownElement;let countdownTextElement;let jumpUrlElement;function updateCountdown(){if(countdown<0){countdownTextElement.textContent="💡自行点击跳转，请注意您的账号和财产安全";return}countdownElement.textContent=countdown;progressElement.style.width=(countdown/{{countdown}}*100)+'%';if(countdown===0){jump()}else{countdown--;setTimeout(updateCountdown,1000)}}function jump(){location.href=jump_url}function closeWindow(){function isWeChat(){return/MicroMessenger/i.test(navigator.userAgent)}function isQQ(){return/QQ/i.test(navigator.userAgent)&&!/MicroMessenger/i.test(navigator.userAgent)}if(isWeChat()){if(typeof WeixinJSBridge!=="undefined"){WeixinJSBridge.call('closeWindow')}else{document.addEventListener('WeixinJSBridgeReady',function(){WeixinJSBridge.call('closeWindow')},false)}}else if(isQQ()){if(typeof mqq!=="undefined"&&mqq.ui&&mqq.ui.closeWebView){mqq.ui.closeWebView()}else{window.history.back()}}else{window.opener=null;window.open('','_self');window.close()}}function copyToClipboard(){const urlText=document.getElementById('jump-url-text').textContent;const tempInput=document.createElement('input');tempInput.value=urlText;document.body.appendChild(tempInput);tempInput.select();document.execCommand('copy');document.body.removeChild(tempInput);alert('链接已复制到剪贴板！')}async function loadAvatar(){const avatarImg=document.querySelector('.avatar');const placeholder=document.querySelector('.avatar-placeholder');const img=new Image();img.src='{{avatar}}';img.onload=function(){avatarImg.src=img.src;avatarImg.style.display='block';placeholder.style.display='none'}}window.addEventListener('load',function(){loadAvatar();progressElement=document.getElementById('progress');countdownElement=document.getElementById('countdown');countdownTextElement=document.querySelector('.countdown-text');jumpUrlElement=document.getElementById('jump-url-text');jumpUrlElement.textContent=jump_url;updateCountdown()});</script></head><body><div class="container"><div class="avatar-placeholder"></div><img src=""alt="头像"class="avatar"><div class="description">{{title}}</div><div class="subtitle">{{subtitle}}</div><div class="loading"><div class="content"><div class="url-text">您即将离开本站，跳转到：</div><div class="jump-url"id="jump-url"><span id="jump-url-text"></span><div class="copy-btn-container"><button class="copy-btn"onclick="copyToClipboard()"><svg xmlns="http://www.w3.org/2000/svg"viewBox="0 0 448 512"><path d="M208 0L332.1 0c12.7 0 24.9 5.1 33.9 14.1l67.9 67.9c9 9 14.1 21.2 14.1 33.9L448 336c0 26.5-21.5 48-48 48l-192 0c-26.5 0-48-21.5-48-48l0-288c0-26.5 21.5-48 48-48zM48 128l80 0 0 64-64 0 0 256 192 0 0-32 64 0 0 48c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 176c0-26.5 21.5-48 48-48z"/></svg></button></div></div></div><div class="countdown-text">⚡将在<span id="countdown"></span>秒后跳转，请自行确认链接安全性</div>{%if countdown>0%}<div class="progress-bar"><div class="progress"id="progress"></div></div>{%endif%}<div class="button-container"><button class="button cancel-button"onclick="closeWindow()">取消跳转</button><button class="button confirm-button"onclick="jump()">立即跳转</button></div></div></div></body></html>`

/** 上游 `scripts/helpers/random.js` 的页脚随机友链块（逐字移植，randomFriends 由配置注入）。 */
function randomJsFriendBlock(linkList, randomFriends) {
  return `var friend_link_list=${JSON.stringify(linkList)};
    var refreshNum = 1;
    function friendChainRandomTransmission() {
      const randomIndex = Math.floor(Math.random() * friend_link_list.length);
      const { name, link } = friend_link_list.splice(randomIndex, 1)[0];
      Snackbar.show({
        text:
          "点击前往按钮进入随机一个友链，不保证跳转网站的安全性和可用性。本次随机到的是本站友链：「" + name + "」",
        duration: 8000,
        pos: "top-center",
        actionText: "前往",
        onActionClick: function (element) {
          element.style.opacity = 0;
          window.open(link, "_blank");
        },
      });
    }
    function addFriendLinksInFooter() {
      var footerRandomFriendsBtn = document.getElementById("footer-random-friends-btn");
      if(!footerRandomFriendsBtn) return;
      footerRandomFriendsBtn.style.opacity = "0.2";
      footerRandomFriendsBtn.style.transitionDuration = "0.3s";
      footerRandomFriendsBtn.style.transform = "rotate(" + 360 * refreshNum++ + "deg)";
      const finalLinkList = [];
  
      let count = 0;

      while (friend_link_list.length && count < ${randomFriends}) {
        const randomIndex = Math.floor(Math.random() * friend_link_list.length);
        const { name, link, avatar } = friend_link_list.splice(randomIndex, 1)[0];
  
        finalLinkList.push({
          name,
          link,
          avatar,
        });
        count++;
      }
  
      let html = finalLinkList
        .map(({ name, link }) => {
          const returnInfo = "<a class='footer-item' href='" + link + "' target='_blank' rel='noopener nofollow'>" + name + "</a>"
          return returnInfo;
        })
        .join("");
  
      html += "<a class='footer-item' href='/link/'>更多</a>";

      document.getElementById("friend-links-in-footer").innerHTML = html;

      setTimeout(()=>{
        footerRandomFriendsBtn.style.opacity = "1";
      }, 300)
    };`
}

/** 上游 `scripts/helpers/random.js`：`var posts=[…]; function toRandomPost(){}` + 可选友链块。 */
function renderRandomJs({ posts, links, pjaxEnabled, footerListEnabled, randomFriends }) {
  const linkList = []
  for (const group of links ?? []) {
    if (!group || !Array.isArray(group.link_list)) continue
    for (const item of group.link_list) linkList.push(item)
  }
  let result = `var posts=${JSON.stringify(posts)};function toRandomPost(){
    ${
      pjaxEnabled
        ? "pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);"
        : "window.location.href='/'+posts[Math.floor(Math.random() * posts.length)];"
    }
  };`
  if (footerListEnabled && randomFriends > 0) result += randomJsFriendBlock(linkList, randomFriends)
  return result
}

/** HTML 文本转义（pug `=` / `#{}` 的默认转义等价物）。 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** HTML 属性值转义（与 escapeHtml 同口径，单独命名以便阅读）。 */
function escapeAttr(value) {
  return escapeHtml(value)
}

/** Hexo `url_for()` 的最小等价实现（插件模板只用到「绝对 URL 原样 / 站内补 root」两种形态）。 */
function hexoUrlFor(value, root = '/') {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return text
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(text)) return text
  const base = !root || root === '/' ? '/' : `${String(root).replace(/\/+$/, '')}/`
  return `${base}${text.replace(/^\/+/, '')}`
}

/** JS 单引号字符串字面量内的转义（hexo-safego 模板里 url_param_name 的注入点）。 */
function jsSingleQuoteEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * 复刻 hexo-safego 的 URL-safe base64（插件 index.js `encodeSafeUrlParam`）：
 * `btoa(encodeURIComponent(str).replace(/%XX/g, char))` → `+`/`/` 换成 `-`/`_`、去尾 `=`。
 */
function encodeSafeUrlParam(value) {
  const percentEncoded = encodeURIComponent(String(value)).replace(/%([0-9A-F]{2})/g, (_match, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  )
  return Buffer.from(percentEncoded, 'binary')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** hexo-safego 判定的「可跳转协议」（插件 index.js 的 UrlReg）。 */
const SAFEGO_URL_RE = /^((http|https|thunder|qqdl|ed2k|Flashget|qbrowser|ftp|rtsp|mms):\/\/)/i

/**
 * 复刻 hexo-safego 的 after_render 外链改写规则（白名单 / data-fancybox 跳过逻辑）。
 * 迁移侧只对「插件产物里自己生成的链接」调用（bangumi 卡片标题），不重做全站 HTML 后处理。
 * 返回 null 表示「不改写」，否则返回 { href, rel, targetBlank }。
 */
function safeGoRewrite(href, safego, root = '/') {
  if (!safego || !safego.general || !safego.general.enable) return null
  if (typeof href !== 'string' || !href) return null
  if (!SAFEGO_URL_RE.test(href)) return null
  const whitelist = Array.isArray(safego.whitelist?.domain_whitelist) ? safego.whitelist.domain_whitelist : []
  let hostname = ''
  try {
    hostname = new URL(href).hostname
  } catch {
    return null
  }
  if (whitelist.some((domain) => domain && hostname.endsWith(String(domain)))) return null
  const encoded = safego.general.enable_base64_encode ? encodeSafeUrlParam(href) : href
  const base = !root || root === '/' ? '/' : `${String(root).replace(/\/+$/, '')}/`
  const file = String(safego.security?.html_file_name || 'go.html').replace(/^\/+/, '')
  const param = String(safego.security?.url_param_name || 'u')
  return {
    href: `${base}${file}?${param}=${encoded}`,
    rel: 'external nofollow noopener noreferrer',
    targetBlank: safego.general.enable_target_blank !== false,
  }
}

/** hexo-safego 配置归一化：与插件 `Object.assign(defaults, userConfig)` 同样按区块浅合并。 */
function normalizeSafeGoConfig(raw) {
  const merge = (key) => ({
    ...SAFEGO_DEFAULTS[key],
    ...(raw && typeof raw === 'object' && raw[key] && typeof raw[key] === 'object' ? raw[key] : {}),
  })
  return {
    general: merge('general'),
    security: merge('security'),
    scope: merge('scope'),
    whitelist: merge('whitelist'),
    appearance: merge('appearance'),
    debug: merge('debug'),
  }
}

/** Nunjucks 模板里 `{% if cond %}` 的最小求值器（只支持 go.html 用到的几种写法）。 */
function evaluateTemplateCondition(expression, variables) {
  const text = String(expression).trim()
  let match = /^([A-Za-z0-9_]+)\s*==\s*true$/.exec(text)
  if (match) return variables[match[1]] === true
  match = /^([A-Za-z0-9_]+)\s*==\s*false$/.exec(text)
  if (match) return variables[match[1]] === false
  match = /^([A-Za-z0-9_]+)\s*==\s*"([^"]*)"$/.exec(text)
  if (match) return String(variables[match[1]]) === match[2]
  match = /^([A-Za-z0-9_]+)\s*>\s*(-?\d+(?:\.\d+)?)$/.exec(text)
  if (match) return Number(variables[match[1]]) > Number(match[2])
  match = /^([A-Za-z0-9_]+)$/.exec(text)
  if (match) return Boolean(variables[match[1]])
  fail(`hexo-safego go.html 模板里出现暂不支持的 Nunjucks 条件：{% if ${text} %}（插件模板变更？）`)
  return false
}

/**
 * Nunjucks 子集渲染：`{%if%}/{%elif%}/{% endif %}`（互斥三分支 + 单分支）与 `{{var}}`。
 * 模板逐字节来自 hexo-safego，语义与插件 nunjucks.render 一致。
 */
function renderNunjucksSubset(template, variables) {
  // ③互斥分支（go.html 的 darkmode 三段）
  let out = template.replace(
    /{%\s*if\s+([^%]+?)\s*%}([\s\S]*?){%\s*elif\s+([^%]+?)\s*%}([\s\S]*?){%\s*elif\s+([^%]+?)\s*%}([\s\S]*?){%\s*endif\s*%}/g,
    (_match, cond1, body1, cond2, body2, cond3, body3) => {
      if (evaluateTemplateCondition(cond1, variables)) return body1
      if (evaluateTemplateCondition(cond2, variables)) return body2
      if (evaluateTemplateCondition(cond3, variables)) return body3
      return ''
    },
  )
  // ②单分支
  out = out.replace(/{%\s*if\s+([^%]+?)\s*%}([\s\S]*?){%\s*endif\s*%}/g, (_match, cond, body) =>
    evaluateTemplateCondition(cond, variables) ? body : '',
  )
  if (/{%|%}/.test(out)) {
    fail('hexo-safego go.html 模板里仍有未处理的 Nunjucks 标记（插件模板变更？）')
  }
  // ①变量
  out = out.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match,
  )
  if (/\{\{\s*[A-Za-z0-9_]+\s*\}\}/.test(out)) {
    fail('hexo-safego go.html 模板里有未提供的模板变量（插件模板变更？）')
  }
  return out
}

/**
 * 生成 hexo-safego 的 go.html（参数化：avatar/title/subtitle/countdown/darkmode/
 * url_param_name/base64 开关全部来自源站配置）。
 */
function renderSafeGoPageHtml(safego) {
  const appearance = safego.appearance
  const countdown = appearance.countdowntime || 5
  const variables = {
    // 条件变量保持原始类型
    enable_base64_encode: safego.general.enable_base64_encode !== false,
    darkmode: appearance.darkmode,
    countdown,
    // 展示变量做转义
    avatar: escapeAttr(appearance.avatar || SAFEGO_DEFAULTS.appearance.avatar),
    title: escapeHtml(appearance.title || SAFEGO_DEFAULTS.appearance.title),
    subtitle: escapeHtml(appearance.subtitle || SAFEGO_DEFAULTS.appearance.subtitle),
    url_param_name: jsSingleQuoteEscape(safego.security.url_param_name || 'u'),
  }
  return renderNunjucksSubset(SAFEGO_TEMPLATE, variables)
}

/** 上游 `_config.yml:bangumi.language` → hexo-i18n 的词典选择（精确 zh-CN / zh-Hans / zh-TW / en，其余回退简中）。 */
function createBangumiTranslator(language) {
  const raw = String(language || '').toLowerCase().replace('_', '-')
  const dictionary = raw.startsWith('zh-tw') || raw.startsWith('zh-hant')
    ? BANGUMI_I18N['zh-TW']
    : raw === 'zh-hans'
      ? BANGUMI_I18N['zh-Hans']
      : raw.startsWith('en')
        ? BANGUMI_I18N.en
        : BANGUMI_I18N['zh-CN']
  return (key) => dictionary[key] ?? BANGUMI_I18N['zh-CN'][key] ?? String(key)
}

/** 上游 `templates/bili-template.pug` 的单条卡片渲染（source=bili）。 */
function renderBangumiItem(item, options) {
  const { config, safego, root, translate } = options
  const type = options.type || 'bangumi'
  const lazyload = config.lazyload !== false
  const loading =
    typeof config.loading === 'string' && config.loading
      ? config.loading
      : 'https://cdn.jsdelivr.net/npm/hexo-bilibili-bangumi@1.2.0/lib/img/loading.gif'
  const srcValue = typeof config.srcValue === 'string' && config.srcValue ? config.srcValue : '__image__'
  const cover = typeof item.cover === 'string' ? item.cover : ''
  // 插件原文：`'https:' + item.cover.replace(/^https:/, '')`
  const imageUrl = `https:${cover.replace(/^https:/, '')}`
  const lazyloadAttrName = typeof config.lazyloadAttrName === 'string' ? config.lazyloadAttrName : ''
  let lazyloadExtra = ''
  if (lazyloadAttrName) {
    const [attrName, rawAttrValue] = lazyloadAttrName.split('=')
    const attrValue =
      rawAttrValue === '__loading__'
        ? loading
        : rawAttrValue === '__image__'
          ? imageUrl
          : rawAttrValue || ''
    lazyloadExtra = ` ${escapeAttr(attrName)}="${escapeAttr(attrValue)}"`
  }
  const imageAttrs = lazyload
    ? `src="${escapeAttr(loading)}" data-src="${escapeAttr(cover)}"`
    : srcValue === '__loading__'
      ? `src="${escapeAttr(loading)}"`
      : `src="${escapeAttr(imageUrl)}"`

  // 卡片标题链接：插件用 item.link，缺省回退 bilibili 番剧地址；safego 开启时按插件规则改写到 go.html。
  const rawHref =
    typeof item.link === 'string' && item.link
      ? item.link
      : `https://www.bilibili.com/bangumi/media/md${item.id}/`
  const rewrite = safeGoRewrite(rawHref, safego, root)
  const href = rewrite ? rewrite.href : rawHref
  const relAttr = rewrite ? ` rel="${rewrite.rel}"` : ''

  const meta = []
  if (item.totalCount) {
    meta.push(
      `<span class="bangumi-info-item"><span class="bangumi-info-total">${escapeHtml(item.totalCount)}</span><em class="bangumi-info-label-em">0</em></span>`,
    )
  }
  if (item.type) {
    meta.push(
      `<span class="bangumi-info-item bangumi-area"><span class="bangumi-info-label">${escapeHtml(item.type)}</span><em>${escapeHtml(item.area || '-')}</em></span>`,
    )
  }
  const metaItem = (className, label, value) =>
    `<span class="bangumi-info-item${className ? ` ${className}` : ''}"><span class="bangumi-info-label">${label}</span><em>${escapeHtml(value || '-')}</em></span>`
  meta.push(metaItem('bangumi-play', translate('view'), item.view))
  meta.push(metaItem('bangumi-follow', translate('follow'), item.follow))
  meta.push(metaItem('bangumi-coin', translate('coin'), item.coin))
  meta.push(metaItem('bangumi-danmaku', translate('danmaku'), item.danmaku))
  meta.push(metaItem('bangumi-info-item-score', translate('score'), item.score))
  const metaColor = typeof config.metaColor === 'string' && config.metaColor ? config.metaColor : ''
  const metaItemsHtml = `<span class="bangumi-info-items"${metaColor ? ` style="color: ${escapeAttr(metaColor)};"` : ''}>${meta.join('')}</span>`

  let progressHtml = ''
  if (item.progress !== false && config.progressBar !== false) {
    const progress = Number(item.progress) || 0
    const width = progress > 100 ? 100 : progress
    progressHtml =
      `<div class="bangumi-progress" style="margin-top: 5px;">` +
      `<div class="bangumi-progress-text">追${type === 'bangumi' ? '番' : '剧'}进度：${escapeHtml(item.ep_status)}/${escapeHtml(item.new_ep)}</div>` +
      `<div class="progress-bar" style="width: ${width}%;"></div></div>`
  }

  const color = typeof config.color === 'string' && config.color ? `color:${config.color};` : ''
  const commentsHtml = `<div class="bangumi-comments" style="margin-top: 10px;${color}"><p>${translate('summary')}：${escapeHtml(item.des || translate('noSummary'))}</p></div>`

  return (
    `<div class="bangumi-item${options.hidden ? ' bangumi-hide' : ''}">` +
    `<div class="bangumi-picture"><img ${imageAttrs} referrerpolicy="no-referrer" width="110" style="width:110px;margin:20px auto;"${lazyloadExtra}></div>` +
    `<div class="bangumi-info">` +
    `<div class="bangumi-title"><a target="_blank" href="${escapeAttr(href)}"${relAttr}>${escapeHtml(item.title || translate('unknown'))}</a></div>` +
    `<div class="bangumi-meta">${metaItemsHtml}</div>` +
    progressHtml +
    commentsHtml +
    `</div></div>`
  )
}

/** 上游 `templates/pagination.pug`（静态分页条，页码文本由 pagination.js 在浏览器里改写）。 */
function renderBangumiPagination(translate) {
  return (
    '<div class="bangumi-pagination">' +
    `<a class="bangumi-button bangumi-firstpage" href="javascript:;" target="_self" onclick="return false">${translate('top')}</a>` +
    `<a class="bangumi-button bangumi-previouspage" href="javascript:;" target="_self" onclick="return false">${translate('prev')}</a>` +
    '<span class="bangumi-pagenum">2 / 3</span>' +
    `<a class="bangumi-button bangumi-nextpage" href="javascript:;" target="_self" onclick="return false">${translate('next')}</a>` +
    `<a class="bangumi-button bangumi-lastpage" href="javascript:;" target="_self" onclick="return false">${translate('end')}</a>` +
    '</div>'
  )
}

/** 上游 index.js（tab 切换 + Element.siblings 补丁）的可读移植版。 */
const BANGUMI_INDEX_JS = `(function () {
  // 上游 hexo-bilibili-bangumi lib/templates/index.js：tab 点击 → 激活自身 + 显示对应 #bangumi-itemN。
  function switchTab() {
    this.classList.add('bangumi-active')
    var tabs = this.siblings()
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('bangumi-active')
    var itemId = this.id.replace('tab', 'item')
    var current = document.getElementById(itemId)
    current.classList.remove('bangumi-hide')
    current.classList.add('bangumi-show')
    var panels = document.getElementById(itemId).siblings()
    for (var j = 0; j < panels.length; j++) {
      panels[j].classList.remove('bangumi-show')
      panels[j].classList.add('bangumi-hide')
    }
  }
  if (!Element.prototype.siblings) {
    Element.prototype.siblings = function () {
      var result = []
      var children = this.parentNode.children
      for (var i = 0; i < children.length; i++) if (children[i] !== this) result.push(children[i])
      return result
    }
  }
  var tabs = document.getElementsByClassName('bangumi-tab')
  for (var i = 0; i < tabs.length; i++) tabs[i].onclick = switchTab
  var active = tabs[hexoBilibiliBangumiOptions.show]
  if (active) active.click()
})();`

/** 上游 pagination.js（每页 10 条，首页/上一页/下一页/尾页）的可读移植版。 */
const BANGUMI_PAGINATION_JS = `(function () {
  // 上游 hexo-bilibili-bangumi lib/templates/pagination.js：
  // 每页 10 条，切换 #bangumi-itemN 内部 .bangumi-hide；懒加载模式下同时补 img.src。
  var ceil = Math.ceil
  function pageLabel(index, items) {
    return (index + 1) + ' / ' + (ceil(items.length / 10) === 0 ? 1 : ceil(items.length / 10))
  }
  function showPage(items, pageIndex) {
    for (var i = 0; i < items.length; i++) {
      if (Math.floor(i / 10) === pageIndex) {
        items[i].classList.remove('bangumi-hide')
        var img = items[i].getElementsByTagName('img')[0]
        if (img && hexoBilibiliBangumiOptions.bangumiLazyload) {
          img.src = img.getAttribute('data-src')
        }
      } else {
        items[i].classList.add('bangumi-hide')
      }
    }
  }
  function firstPage() {
    var items = this.parentNode.siblings()
    showPage(items, 0)
    this.parentNode.getElementsByClassName('bangumi-pagenum')[0].innerText = pageLabel(0, items)
  }
  function previousPage() {
    var items = this.parentNode.siblings()
    var label = this.parentNode.getElementsByClassName('bangumi-pagenum')[0].innerText
    var page = parseInt(label.substr(0, label.indexOf('/') - 1), 10) - 1
    if (page > 0) page--
    showPage(items, page)
    this.parentNode.getElementsByClassName('bangumi-pagenum')[0].innerText = pageLabel(page, items)
  }
  function nextPage() {
    var items = this.parentNode.siblings()
    var label = this.parentNode.getElementsByClassName('bangumi-pagenum')[0].innerText
    var page = parseInt(label.substr(0, label.indexOf('/') - 1), 10) - 1
    if (page < ceil(items.length / 10) - 1) page++
    showPage(items, page)
    this.parentNode.getElementsByClassName('bangumi-pagenum')[0].innerText = pageLabel(page, items)
  }
  function lastPage() {
    var items = this.parentNode.siblings()
    var page = ceil(items.length / 10) - 1
    showPage(items, page)
    this.parentNode.getElementsByClassName('bangumi-pagenum')[0].innerText = pageLabel(page, items)
  }
  var firsts = document.getElementsByClassName('bangumi-firstpage')
  var prevs = document.getElementsByClassName('bangumi-previouspage')
  var nexts = document.getElementsByClassName('bangumi-nextpage')
  var lasts = document.getElementsByClassName('bangumi-lastpage')
  var pagenums = document.getElementsByClassName('bangumi-pagenum')
  for (var i = 0; i < firsts.length; i++) {
    firsts[i].onclick = firstPage
    prevs[i].onclick = previousPage
    nexts[i].onclick = nextPage
    lasts[i].onclick = lastPage
    var preload =
      typeof hexoBilibiliBangumiOptions.pagenumsPre === 'undefined'
        ? pagenums[i].parentNode.siblings().length
        : hexoBilibiliBangumiOptions.pagenumsPre[i] == null
          ? pagenums[i].parentNode.siblings().length
          : hexoBilibiliBangumiOptions.pagenumsPre[i]
    firsts[i].click()
    pagenums[i].innerText = '1 / ' + (ceil(preload / 10) === 0 ? 1 : ceil(preload / 10))
  }
})();`

/**
 * 生成追番页 `#article-container` 内的全部 HTML（上游 templates/bangumi.pug +
 * bili-template.pug + pagination.pug + index.js + pagination.js）。
 *
 * @param {object} options
 * @param {object} options.config     源站 `_config.yml:bangumi`
 * @param {object} options.siteConfig site.config.ts 的 site（language 决定 i18n 词典）
 * @param {object} options.data       `source/_data/bangumis.json`（wantWatch/watching/watched）
 * @param {object|null} options.safego 归一化后的 hexo_safego 配置（决定卡片链接是否走 go.html）
 * @param {string} options.root       源站 `_config.yml:root`
 */
function renderBangumiPageHtml({ config, siteConfig, data, safego, root = '/' }) {
  const translate = createBangumiTranslator(siteConfig?.language)
  const type = 'bangumi'
  const wantWatch = Array.isArray(data.wantWatch) ? data.wantWatch : []
  const watching = Array.isArray(data.watching) ? data.watching : []
  const watched = Array.isArray(data.watched) ? data.watched : []
  const order = typeof config.order === 'string' ? config.order : ''
  const sortByScore = (list) =>
    ['score', '-score'].includes(order)
      ? [...list].sort((a, b) => (order === 'score' ? a.score - b.score : b.score - a.score))
      : list
  const lazyload = config.lazyload !== false
  const pagination = config.pagination === true
  const show = config.show || 1

  // 每个 tab 的分页条固定在容器末尾（与上游 bangumi.pug 的 include 顺序一致）
  const renderTabItems = (items) =>
    sortByScore(items)
      .map((item, index) =>
        renderBangumiItem(item, {
          config,
          safego,
          root,
          translate,
          type,
          // pagination 模式：上游模板把第 2 页起的条目异步补进来并直接带 .bangumi-hide；
          // 迁移侧一次性渲染全部条目，用同一个 class 让 pagination.js 接管显隐。
          hidden: pagination && index >= 10,
        }),
      )
      .join('') + renderBangumiPagination(translate)

  const quote =
    typeof config.quote === 'string' && config.quote
      ? `<blockquote><p>${escapeHtml(config.quote)}</p></blockquote>`
      : ''
  const tabs =
    '<div class="bangumi-tabs">' +
    `<a class="bangumi-tab" id="bangumi-tab1" href="javascript:;" rel="external" target="_self" onclick="return false">${translate(type === 'game' ? 'wantPlay' : 'wantWatch')} (${wantWatch.length})</a>` +
    `<a class="bangumi-tab" id="bangumi-tab2" href="javascript:;" rel="external" target="_self" onclick="return false">${translate(type === 'game' ? 'playing' : 'watching')} (${watching.length})</a>` +
    `<a class="bangumi-tab" id="bangumi-tab3" href="javascript:;" rel="external" target="_self" onclick="return false">${translate(type === 'game' ? 'played' : 'watched')} (${watched.length})</a>` +
    '</div>'

  const item1 = `<div id="bangumi-item1">${renderTabItems(wantWatch)}</div>`
  const item2 = `<div id="bangumi-item2">${renderTabItems(watching)}</div>`
  const item3 = `<div id="bangumi-item3">${renderTabItems(watched)}</div>`

  // 选项脚本：tab 初始激活 + 懒加载开关（不再有 pugTemplate/axios 异步补渲染）；
  // pagination 模式额外带 pagenumsPre（上游同样字段，用来在分页条首次渲染前就知道总数）。
  const options = {
    bangumiLazyload: lazyload,
    show: Number.isFinite(show) ? show : 1,
  }
  if (pagination) options.pagenumsPre = [wantWatch.length, watching.length, watched.length]
  const optionsScript = `<script>window.hexoBilibiliBangumiOptions = ${JSON.stringify(options)}</script>`

  return (
    quote +
    `<style>${BANGUMI_INDEX_CSS}</style>` +
    tabs +
    `<div>${item1}${item2}${item3}</div>` +
    optionsScript +
    `<script>${BANGUMI_INDEX_JS}\n${BANGUMI_PAGINATION_JS}</script>`
  )
}

/** 上游 hexo-butterfly-envelope lib/html.pug 的静态 HTML 渲染（信笺留言板）。 */
function renderEnvelopePageHtml(config, siteConfig, root = '/') {
  const customPic = config.custom_pic && typeof config.custom_pic === 'object' ? config.custom_pic : {}
  const picture = (value, fallback) => hexoUrlFor(typeof value === 'string' && value ? value : fallback, root)
  const cover = picture(customPic.cover, 'https://unpkg.zhimg.com/hexo-butterfly-envelope/lib/violet.jpg')
  const line = picture(customPic.line, 'https://unpkg.zhimg.com/hexo-butterfly-envelope/lib/line.png')
  const beforeimg = picture(customPic.beforeimg, 'https://unpkg.zhimg.com/hexo-butterfly-envelope/lib/before.png')
  const afterimg = picture(customPic.afterimg, 'https://unpkg.zhimg.com/hexo-butterfly-envelope/lib/after.png')
  const author = escapeHtml(siteConfig?.author ?? '')
  const messages =
    Array.isArray(config.message) && config.message.length
      ? config.message
      : ['有什么想问的？', '有什么想说的？', '有什么想吐槽的？', '哪怕是有什么想吃的，都可以告诉我哦~']
  const bottom = escapeHtml(
    typeof config.bottom === 'string' && config.bottom ? config.bottom : '自动书记人偶竭诚为您服务',
  )
  const height =
    config.height === undefined || config.height === null || config.height === ''
      ? '1050px'
      : String(config.height)

  const style = `@media screen and (max-width: 600px) {
  #beforeimg,
  #afterimg {
    display: none !important;
  }
}
@media screen and (min-width: 600px) {
  #article-container img {
    margin: 0 auto 0rem;
  }
  #form-wrap {
    overflow: hidden;
    height: 447px;
    position: relative;
    top: 0px;
    transition: all 1s ease-in-out .3s;
    z-index: 0;
  }
  #form-wrap:hover {
    height: ${height};
    top: -200px;
  }
  #beforeimg {
    position: absolute;
    bottom: 126px;
    left: 0px;
    background-repeat: no-repeat;
    width: 530px;
    height: 317px;
    z-index: -100;
    pointer-events: none;
  }
  #afterimg {
    position: absolute;
    bottom: -2px;
    left: 0;
    background-repeat: no-repeat;
    width: 530px;
    height: 259px;
    z-index: 100;
    pointer-events: none;
  }
  #envelope {
    position: relative;
    overflow: visible;
    width: 500px;
    margin: 0px auto;
    transition: all 1s ease-in-out .3s;
    padding-top: 200px;
  }
  #maincontent {
    width: 530px;
    margin: 20px auto 0;
  }
  .formmain {
    background: white;
    width: 95%;
    max-width: 800px;
    margin: auto auto;
    border-radius: 5px;
    border: 1px solid;
    overflow: hidden;
    -webkit-box-shadow: 0px 0px 20px 0px #000000;
    box-shadow: 0px 0px 20px 0px #000000;
  }
}
[data-theme='dark'] .formmain {
  background: #323232;
}
[data-theme='dark'] .comments {
  background: #5a5a5a !important;
}`

  const messageHtml = messages
    .map((item) => `<div>${escapeHtml(item)}</div>`)
    .join('')

  return (
    `<style>${style}</style>` +
    '<div id="maincontent">' +
    '<div id="form-wrap">' +
    `<img class="no-lightbox" id="beforeimg" src="${escapeAttr(beforeimg)}">` +
    '<div id="envelope">' +
    '<form>' +
    '<div class="formmain" style="pointer-events: none;">' +
    `<img class="headerimg no-lightbox" src="${escapeAttr(cover)}" style="width: 100%;overflow: hidden;pointer-events: none;">` +
    '<div class="comments-main">' +
    `<h3 class="title3" style="text-decoration: none;color: $theme-color;text-align: center;">来自${author}的留言:</h3>` +
    '<div class="comments" style="text-align: center;border-bottom: #ddd 1px solid;border-left: #ddd 1px solid;padding-bottom: 20px;background-color: #eee;margin: 15px 0px;padding-left: 20px;padding-right: 20px;border-top: #ddd 1px solid;border-right: #ddd 1px solid;padding-top: 20px;">' +
    messageHtml +
    '</div>' +
    '<div class="bottomcontent" style="text-align: center;margin-top: 40px;">' +
    `<img class="bottomimg no-lightbox" src="${escapeAttr(line)}" style="width: 100%;margin: 5px auto 5px auto;display: block;pointer-events: none;">` +
    '</div>' +
    `<p class="bottomhr" style="font-size: 12px;text-align: center;color: #999;">${bottom}</p>` +
    '</div></div></form></div>' +
    `<img class="no-lightbox" id="afterimg" src="${escapeAttr(afterimg)}">` +
    '</div></div>'
  )
}

/**
 * 生成「插件产物页」的 Astro 路由源码。
 *
 * 外壳复用主题 BaseLayout（#body-wrap / Header / main / Footer / aside），
 * 正文按上游 `layout/page.pug` 的结构挂载：
 *   #page → (top_img === false) h1.page-title → #article-container != page.content → comments
 */
function renderPluginPageAstro({
  siteConfig,
  styles,
  title,
  topImg,
  pageTypeValue,
  content,
  showComments,
  note,
}) {
  const titleLiteral = typeof title === 'string' && title ? JSON.stringify(title) : 'undefined'
  const topImgLiteral =
    topImg === false ? 'false' : typeof topImg === 'string' && topImg ? JSON.stringify(topImg) : 'undefined'
  const pageTypeLiteral = JSON.stringify(pageTypeValue || 'page')
  const contentLiteral = JSON.stringify(content)
  const commentsImport = showComments
    ? `import CommentsIndex from '@/components/third-party/comments/index.astro'\n`
    : ''
  const commentsRender = showComments ? '    <CommentsIndex page={{ root: site.root }} />\n' : ''
  return `---
/**
 * AUTO-GENERATED by scripts/migrate-hexo.mjs — Hexo 插件生成页（唯一真源在迁移脚本里）。
 *
 * ${note}
 *
 * 结构对齐上游 \`layout/page.pug\`：
 *   #page
 *     if top_img === false && !page.top_single → h1.page-title
 *     #article-container != page.content   ← 插件在 Hexo 构建期渲染的 HTML，已由迁移脚本按插件语义生成
 *     if page.comments !== false → third-party/comments
 * 外壳（Header / Footer / aside / #body-wrap）由主题 BaseLayout 提供，与其它独立页面一致。
 */
import BaseLayout from '@/layouts/BaseLayout.astro'
${commentsImport}import { site } from '${siteConfig}'
import '${styles}'

/** 上游 \`page.title\`（插件 front_matter.title）。 */
const pageTitle: string | undefined = ${titleLiteral}
/** 上游 \`page.type\`（additional-js.pug 的 input#page-type 值）。 */
const pageTypeValue: string = ${pageTypeLiteral}
/** 上游 \`page.top_img\`：false = 显式关闭顶部图（此时 page.pug 输出 h1.page-title）。 */
const topImg: string | false | undefined = ${topImgLiteral}
/** 上游 \`page.content\`：插件 pug 模板渲染出的静态 HTML（迁移期已生成）。 */
const pageContent: string = ${contentLiteral}
---

<BaseLayout
  site={site}
  title={pageTitle}
  content={pageContent}
  pageType="page"
  pageTypeValue={pageTypeValue}
  topImg={topImg}
>
  <div id="page">
    {topImg === false && <h1 class="page-title">{pageTitle}</h1>}
    <div id="article-container"><Fragment set:html={pageContent} /></div>
${commentsRender}  </div>
</BaseLayout>
`
}

/**
 * frontmatter/配置里的日期串 → permalink token 需要的年月日时分秒（Hexo 语义：字面量即站点墙上时间）。
 *
 * 日期分隔符 `[-/]` 与 content.config.ts 的 hexoDate 对齐（`2024/01/15` / `2024-01-15` 均可，C3）。
 * 无法解析时不再伪造 1970-01-01，改为告警并返回 null（调用方自行兜底，不误导 URL/排序）。
 */
function parsePostDateParts(value) {
  const text = String(value ?? '')
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text)
  if (!match) {
    console.warn(`[migrate] 无法解析日期 ${JSON.stringify(text)}，跳过日期段（不再伪造 1970）`)
    return null
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
  }
}

/**
 * 文章 URL 末段收尾（C2 单一规则源）：`.html`/`.htm` 平文件型不加尾斜杠，目录型加。
 * 迁移侧 createPostPathResolver 与生成的 src/data/post-permalink.ts 的 postHref 共用同一规则；
 * 因分属迁移脚本（Node）与生成物（站点运行时）两个运行时，规则在两处各实例化一份，逻辑必须逐字一致。
 */
function applyPermalinkTrailingSlash(rendered) {
  return /\.html?$/i.test(rendered) ? rendered : `${rendered}/`
}

/**
 * 与 `src/data/post-permalink.ts` 的 `postHref()` 同一套规则：
 * 源站 permalink 模式 + abbrlink/slug + frontmatter 日期 → 文章 URL（无前导 `/`，
 * 与 Hexo `post.path` 同形，供 random.js 使用）。
 */
function createPostPathResolver(permalinkPattern) {
  const segments = String(permalinkPattern || ':year/:month/:day/:title/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
  const abbrlinkConfigured = segments.some((segment) => segment.includes(':abbrlink'))
  return (post) => {
    const slug = typeof post.slug === 'string' ? post.slug : ''
    const abbr = post.abbrlink === undefined || post.abbrlink === null || post.abbrlink === '' ? '' : String(post.abbrlink)
    const effectiveSlug = abbrlinkConfigured && abbr ? abbr : slug
    // 日期不可解析时不再伪造 1970，退回迁移时刻的日期段（parsePostDateParts 已告警），保证 URL 无 undefined。
    const now = new Date()
    const parts = parsePostDateParts(post.date) ?? {
      year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(),
      hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds(),
    }
    const pad = (number) => String(number).padStart(2, '0')
    const values = {
      year: String(parts.year),
      short_year: String(parts.year % 100),
      month: pad(parts.month),
      i_month: String(parts.month),
      day: pad(parts.day),
      i_day: String(parts.day),
      hour: pad(parts.hour),
      minute: pad(parts.minute),
      second: pad(parts.second),
      title: slug,
      abbrlink: effectiveSlug,
    }
    const rendered = segments
      .map((segment) => segment.replace(/:([a-z_]+)/gi, (match, token) => (token in values ? values[token] : match)))
      .join('/')
    // 目录型 permalink（Astro build.format=directory 的产物）统一带尾斜杠，与 postHref() 一致；
    // 平文件型（末段 .html/.htm）不带（C2，收口到 applyPermalinkTrailingSlash）。
    return applyPermalinkTrailingSlash(rendered)
  }
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
/* 站点级生成物（W2-B2）：search / feed / sitemap / 百度提交             */
/* ------------------------------------------------------------------ */

/**
 * Hexo 生成器/插件在 `hexo generate` 阶段产出的根级文件：
 *
 *   search.xml        hexo-generator-search 2.4.3        lib/xml_generator.js + templates/search.xml
 *   atom.xml          hexo-pretty-feed 1.1.0             atom.xml
 *   rss2.xml          hexo-pretty-feed 1.1.0             rss2.xml
 *   sitemap.xml/txt   hexo-generator-sitemap 3.0.1       lib/generator.js + sitemap.xml / sitemap.txt
 *   baidusitemap.xml  hexo-generator-baidu-sitemap 0.1.9 baidusitemap.ejs
 *   baidu_urls.txt    hexo-baidu-url-submit 0.0.6        lib/generator.js
 *
 * 实现取舍（详见 docs/notes/phases/P7-4-fix-feeds-search.md）：
 *   - search/atom/rss2 的正文是**构建期渲染后的 HTML**，迁移期拿不到 → 统一生成
 *     Astro endpoint（`src/pages/<产物路径>.ts`），构建期 `getCollection` 取条目，
 *     正文直接用 Astro 7 glob loader 的 eager 渲染产物 `entry.rendered.html`
 *     （实测 22/22 篇文章非空），不需要 astro/container 二次渲染。
 *   - sitemap/baidusitemap/baidu_urls 也走 endpoint：URL 清单依赖源站 permalink 解析器
 *     与分类/标签 slug 规则，放在构建期能复用主题/路由同一套函数（post-permalink.ts /
 *     archives/_data.ts 的 taxonomySlug），迁移脚本里不再复刻一套 slugize。
 *   - 迁移脚本只做「Hexo 插件配置 → 归一化快照 + endpoint 路由文件」的生成；
 *     XML 序列化全部写在生成的 src/data/site-feeds.ts 里（零新增依赖）。
 */

/** hexo-generator-search 2.4.3 配置归一化（默认 path=search.xml / field=post / content=true）。 */
function normalizeSearchGeneratorConfig(siteConfig) {
  if (!Object.prototype.hasOwnProperty.call(siteConfig, 'search')) return null
  const raw =
    siteConfig.search && typeof siteConfig.search === 'object' && !Array.isArray(siteConfig.search)
      ? siteConfig.search
      : {}
  let outputPath = typeof raw.path === 'string' && raw.path.trim() ? raw.path.trim() : 'search.xml'
  if (!path.extname(outputPath)) outputPath += '.xml'
  outputPath = outputPath.replace(/^\/+/, '')
  const ext = path.extname(outputPath).toLowerCase()
  // hexo-generator-search 的 .json 分支是另一套结构（json_generator.js），本轮只支持 .xml；
  // 站点配置成 .json 时登记为 unsupported，不生成半成品。
  return {
    supported: ext === '.xml',
    path: outputPath,
    ext,
    field: typeof raw.field === 'string' && raw.field.trim() ? raw.field.trim() : 'post',
    content: raw.content !== false,
  }
}

/**
 * hexo-pretty-feed 1.1.0 配置归一化（复刻 index.js 的 type/path 配对规则与默认值）。
 * 注意：hub/limit 等是公开配置；token 之类的凭据不在这里（baidu_url_submit 只保留 path/count）。
 */
function normalizeFeedGeneratorConfig(siteConfig) {
  if (!Object.prototype.hasOwnProperty.call(siteConfig, 'feed')) return null
  const raw =
    siteConfig.feed && typeof siteConfig.feed === 'object' && !Array.isArray(siteConfig.feed)
      ? siteConfig.feed
      : {}
  const config = {
    enable: true,
    type: 'atom',
    limit: 20,
    hub: '',
    content: true,
    content_limit: 140,
    content_limit_delim: '',
    pretty_rss2_file: '',
    pretty_atom_file: '',
    order_by: '-date',
    ...raw,
  }
  if (config.enable === false || config.enable === 'false') return null

  let type = config.type
  if (!type || (typeof type !== 'string' && !Array.isArray(type))) type = 'atom'
  if (Array.isArray(type)) {
    type = [...new Set(type.filter((item) => item === 'atom' || item === 'rss2'))]
    if (type.length === 0) type = 'atom'
  }
  if (typeof type === 'string' && type !== 'atom' && type !== 'rss2') type = 'atom'
  const types = typeof type === 'string' ? [type] : type

  let outputPath = config.path
  if (!outputPath || typeof outputPath !== typeof type) {
    outputPath = typeof type === 'string' ? `${type}.xml` : types.map((item) => `${item}.xml`)
  }
  if (Array.isArray(outputPath)) {
    outputPath = [...outputPath]
    if (outputPath.length !== types.length) {
      if (outputPath.length > types.length) outputPath = outputPath.slice(0, types.length)
      else if (outputPath.length === 0) outputPath = types.map((item) => `${item}.xml`)
      else outputPath.push(`${types[1]}.xml`)
    }
    outputPath = outputPath.map((item) => (path.extname(String(item)) ? String(item) : `${item}.xml`))
  } else if (typeof outputPath === 'string' && !path.extname(outputPath)) {
    outputPath += '.xml'
  }
  const text = (value) => (typeof value === 'string' && value ? value : null)
  return {
    outputs: types.map((item, index) => ({
      type: item,
      path: String(typeof outputPath === 'string' ? outputPath : outputPath[index]).replace(/^\/+/, ''),
    })),
    limit: typeof config.limit === 'number' && config.limit > 0 ? config.limit : null,
    content: config.content !== false,
    contentLimit: typeof config.content_limit === 'number' ? config.content_limit : 140,
    contentLimitDelim: typeof config.content_limit_delim === 'string' ? config.content_limit_delim : '',
    orderBy: typeof config.order_by === 'string' && config.order_by ? config.order_by : '-date',
    icon: text(config.icon),
    prettyAtomFile: text(config.pretty_atom_file),
    prettyRss2File: text(config.pretty_rss2_file),
    hub: text(config.hub),
  }
}

/** hexo-generator-sitemap 3.0.1 配置归一化（默认 path=['sitemap.xml','sitemap.txt'] / tags=categories=true）。 */
function normalizeSitemapGeneratorConfig(siteConfig) {
  if (!Object.prototype.hasOwnProperty.call(siteConfig, 'sitemap')) return null
  const raw =
    siteConfig.sitemap && typeof siteConfig.sitemap === 'object' && !Array.isArray(siteConfig.sitemap)
      ? siteConfig.sitemap
      : {}
  const configured = raw.path === undefined ? ['sitemap.xml', 'sitemap.txt'] : raw.path
  const outputs = []
  for (const item of Array.isArray(configured) ? configured : [configured]) {
    let outputPath = String(item ?? '').replace(/^\/+/, '')
    if (!outputPath) continue
    if (!path.extname(outputPath)) outputPath += '.xml'
    const ext = path.extname(outputPath).toLowerCase()
    if (ext !== '.xml' && ext !== '.txt') continue
    outputs.push({ path: outputPath, kind: ext === '.txt' ? 'txt' : 'xml' })
  }
  if (outputs.length === 0) return null
  return {
    outputs,
    tags: raw.tags !== false,
    categories: raw.categories !== false,
  }
}

/**
 * hexo-generator-baidu-sitemap 0.1.9 配置归一化。
 * 源站 `_config.yml` 的 `baidusitemap.path` 缩进丢了（YAML 把 path 解析成顶层键），
 * 这里做与 accept-migration.mjs 同口径的兼容回退。
 */
function normalizeBaiduSitemapGeneratorConfig(siteConfig) {
  if (!Object.prototype.hasOwnProperty.call(siteConfig, 'baidusitemap')) return null
  const raw =
    siteConfig.baidusitemap &&
    typeof siteConfig.baidusitemap === 'object' &&
    !Array.isArray(siteConfig.baidusitemap)
      ? siteConfig.baidusitemap
      : {}
  const topLevelPath = typeof siteConfig.path === 'string' ? siteConfig.path.trim() : ''
  let outputPath = typeof raw.path === 'string' && raw.path.trim() ? raw.path.trim() : ''
  if (!outputPath && topLevelPath.toLowerCase().endsWith('.xml')) outputPath = topLevelPath
  if (!outputPath) outputPath = 'baidusitemap.xml'
  if (!path.extname(outputPath)) outputPath += '.xml'
  return {
    path: outputPath.replace(/^\/+/, ''),
    url: typeof raw.url === 'string' && raw.url ? raw.url : null,
  }
}

/**
 * hexo-baidu-url-submit 0.0.6 配置归一化。
 * 只保留生成文件需要的 path/count；host/token 是凭据，**不**写进迁移站产物/报告。
 */
function normalizeBaiduUrlSubmitGeneratorConfig(siteConfig) {
  if (!Object.prototype.hasOwnProperty.call(siteConfig, 'baidu_url_submit')) return null
  const raw =
    siteConfig.baidu_url_submit &&
    typeof siteConfig.baidu_url_submit === 'object' &&
    !Array.isArray(siteConfig.baidu_url_submit)
      ? siteConfig.baidu_url_submit
      : {}
  const outputPath =
    typeof raw.path === 'string' && raw.path.trim() ? raw.path.trim().replace(/^\/+/, '') : null
  if (!outputPath) return null
  const count = Number(raw.count)
  return { path: outputPath, count: Number.isFinite(count) && count >= 0 ? count : null }
}

/**
 * 收集「会被 Hexo 当成 Page 参与 hexo-generator-sitemap 的 source 静态文件」。
 *
 * hexo 7 的内置 renderer 表（hexo/dist/plugins/renderer/index.js）：
 *   htm→html、html→html、css→css、js→js、json→json、yml/yaml→json、njk/j2→html
 * 其中 js/css 被 hexo-generator-sitemap 硬编码进 skipRenderList，不进 sitemap；
 * 其余（图片/favicon/robots.txt/LICENSE/xsl…）没有 renderer，是 Asset，也不进。
 * 本站命中 5 个 .json（golden sitemap 里能逐条对上）。
 *
 * @param {string} sourceDir 源站 source 目录
 * @param {unknown} skipRender 源站 `_config.yml` 的 skip_render（string | string[]）
 */
const HEXO_STATIC_PAGE_OUTPUT_EXT = {
  '.htm': '.html',
  '.html': '.html',
  '.css': '.css',
  '.js': '.js',
  '.json': '.json',
  '.yml': '.json',
  '.yaml': '.json',
  '.njk': '.html',
  '.j2': '.html',
}

function globToRegExp(glob) {
  const escaped = String(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000\//g, '(?:.*/)?')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${escaped}$`)
}

function collectHexoStaticPageInputs(sourceDir, skipRender) {
  const patterns = (Array.isArray(skipRender) ? skipRender : skipRender ? [skipRender] : [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .map(globToRegExp)
  const pages = []
  for (const rel of walkFiles(sourceDir)) {
    const segments = rel.split('/')
    if (segments.some((segment) => segment.startsWith('_') || segment.startsWith('.'))) continue
    const ext = path.extname(rel).toLowerCase()
    const outputExt = HEXO_STATIC_PAGE_OUTPUT_EXT[ext]
    if (!outputExt) continue
    // 与 hexo-generator-sitemap 的 skipRenderList 对齐：js/css 永远不进 sitemap，
    // 另有源站 skip_render 命中的也不进。
    if (outputExt === '.js' || outputExt === '.css') continue
    if (patterns.some((re) => re.test(rel))) continue
    const outputPath = `${rel.slice(0, rel.length - ext.length)}${outputExt}`
    pages.push({
      path: outputPath,
      updated: statSync(path.join(sourceDir, rel)).mtime.toISOString(),
    })
  }
  pages.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
  return pages
}

/**
 * 生成 `src/data/site-feeds.ts`：6 个站点级生成物的共用实现（构建期执行）。
 *
 * 只插入 import 说明符与配置快照；所有站点身份从 `site.config.ts` 读，
 * 不硬编码源站信息。生成的 TS 刻意不用模板字符串（避免与本模板的 `${}` 冲突），
 * 也不引入任何 npm 依赖。
 */
function renderSiteFeedsModule({
  siteConfigSpecifier,
  permalinkSpecifier,
  taxonomySpecifier,
  generators,
  staticPages,
  pageUpdatedByPermalink,
}) {
  const template = String.raw`/**
 * AUTO-GENERATED by scripts/migrate-hexo.mjs — 站点级生成物（W2-B2）。
 *
 * 覆盖 6 个 Hexo 生成器/插件在 hexo generate 阶段产出的根级文件：
 *   search.xml        hexo-generator-search 2.4.3        lib/xml_generator.js + templates/search.xml
 *   atom.xml          hexo-pretty-feed 1.1.0             atom.xml
 *   rss2.xml          hexo-pretty-feed 1.1.0             rss2.xml
 *   sitemap.xml/txt   hexo-generator-sitemap 3.0.1       lib/generator.js + sitemap.xml / sitemap.txt
 *   baidusitemap.xml  hexo-generator-baidu-sitemap 0.1.9 baidusitemap.ejs
 *   baidu_urls.txt    hexo-baidu-url-submit 0.0.6        lib/generator.js
 *
 * 为什么在构建期（Astro endpoint）生成而不是迁移期：
 *   - search/atom/rss2 的正文是**渲染后的正文 HTML**，迁移期还没有 Markdown 渲染结果；
 *   - sitemap 的帖子/分类/标签 URL 必须和主题路由用同一套规则（postHref / taxonomySlug），
 *     否则 sitemap 里会出现 404 链接。
 *
 * 正文来源：Astro 7 glob loader 在 content sync 阶段 eager 渲染，entry.rendered.html 直接可用
 * （本迁移站 22/22 篇文章非空），与文章页正文同源。这里只额外跑主题的 rewriteHeadings()
 * （补 Hexo marked 的标题 id 与 headerlink），**不**套 lazyload / hexo_safego 外链改写——
 * 源站 feed/search 用的是 after_render 过滤器之前的 post.content（golden 里也没有 data-lazy-src）。
 *
 * XML 全部手写序列化（零新增依赖）：文本转义 & < > " '；CDATA 内容按 hexo 模板的
 * noControlChars 口径剥控制字符（含换行），CDATA 结束标记按 XML 规则拆开。
 *
 * 站点身份（title/subtitle/description/author/url/root）全部来自 site.config.ts；
 * 生成器配置快照 GENERATORS 由迁移脚本从源站 _config.yml 归一化后写入。换一个 Hexo 站
 * 迁移会自动生效，不硬编码源站身份。
 */
import { getCollection } from 'astro:content'
import { site } from '__SITE_CONFIG__'
import { postHref } from '__PERMALINK__'
import { rewriteHeadings } from '@/utils/slugger.ts'
import { taxonomySlug } from '__TAXONOMY__'

type AnyRecord = Record<string, any>

export interface FeedOutputConfig {
  type: 'atom' | 'rss2'
  path: string
}

export interface SitemapOutputConfig {
  path: string
  kind: 'xml' | 'txt'
}

export interface SearchGeneratorConfig {
  path: string
  field: string
  content: boolean
}

export interface FeedGeneratorConfig {
  outputs: FeedOutputConfig[]
  limit: number | null
  content: boolean
  contentLimit: number
  contentLimitDelim: string
  orderBy: string
  icon: string | null
  prettyAtomFile: string | null
  prettyRss2File: string | null
  hub: string | null
}

export interface SitemapGeneratorConfig {
  outputs: SitemapOutputConfig[]
  tags: boolean
  categories: boolean
}

export interface BaiduSitemapConfig {
  path: string
  url: string | null
}

export interface BaiduUrlSubmitConfig {
  path: string
  count: number | null
}

export interface GeneratorConfigs {
  search: SearchGeneratorConfig | null
  feed: FeedGeneratorConfig | null
  sitemap: SitemapGeneratorConfig | null
  baidusitemap: BaiduSitemapConfig | null
  baiduUrlSubmit: BaiduUrlSubmitConfig | null
}

/** 迁移脚本从源站 _config.yml 归一化出的生成器配置快照。 */
export const GENERATORS: GeneratorConfigs = __GENERATORS__

/** Hexo 把 source 下这些文件当 Page 参与 sitemap：迁移期快照（构建期拿不到源站文件）。 */
const STATIC_PAGES: Array<{ path: string; updated: string }> = __STATIC_PAGES__

/** Hexo updated_option=mtime：没有 frontmatter updated 的独立页面用源文件 mtime。 */
const PAGE_UPDATED_BY_PERMALINK: Record<string, string> = __PAGE_UPDATED__

const siteInfo = site as AnyRecord
const CONFIG_URL = String(siteInfo.url || '')
const ORIGIN = CONFIG_URL.replace(/\/+$/, '')

function normalizeRoot(value: unknown): string {
  const text = typeof value === 'string' && value ? value : '/'
  const trimmed = text.replace(/^\/+/, '').replace(/\/+$/, '')
  return trimmed ? '/' + trimmed + '/' : '/'
}

const ROOT = normalizeRoot(siteInfo.root)
/** 站内 URL 公共前缀（ORIGIN + root，root 首尾都有 /）。 */
const FEED_BASE = ORIGIN + ROOT
const SITE_TITLE = String(siteInfo.title || '')
const SITE_SUBTITLE = String(siteInfo.subtitle || '')
const SITE_DESCRIPTION = String(siteInfo.description || '')
const SITE_AUTHOR = String(siteInfo.author || '')
const SITE_EMAIL = String(siteInfo.email || '')

/* ------------------------------------------------------------------ */
/* 通用工具                                                            */
/* ------------------------------------------------------------------ */

function sitePath(value: string): string {
  return ROOT + String(value || '').replace(/^\/+/, '')
}

function fullUrl(value: string): string {
  return ORIGIN + sitePath(value)
}

function encodeUrl(value: string): string {
  try {
    return encodeURI(value)
  } catch {
    return value
  }
}

function escapeXml(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g

/** Hexo 模板 noControlChars：剥控制字符（含换行），CDATA 字节数与 golden 同量级。 */
function stripControlChars(value: unknown): string {
  return String(value == null ? '' : value).replace(CONTROL_CHARS, '')
}

function cdata(value: unknown): string {
  const body = String(value == null ? '' : value).replace(/]]>/g, ']]]]><![CDATA[>')
  return '<![CDATA[' + body + ']]>'
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string' && value) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function isoInstant(value: Date): string {
  return value.toISOString()
}

function utcString(value: Date): string {
  return value.toUTCString()
}

function dayStamp(value: Date): string {
  return value.toISOString().slice(0, 10)
}

const BUILD_DAY = dayStamp(new Date())

function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  })
}

function textResponse(body: string): Response {
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

/* ------------------------------------------------------------------ */
/* 文章 / 独立页面视图                                                  */
/* ------------------------------------------------------------------ */

interface TaxonomyTerm {
  name: string
  /** 站内相对路径（无前导 /，如 tags/生活/、categories/教程/博客/）。 */
  path: string
}

export interface PostView {
  id: string
  title: string
  /** 站内相对路径（含 root，已由 sitePath 处理，如 /posts/pXXX/）。 */
  href: string
  date: Date
  updated: Date
  /** rewriteHeadings 之后、未剥控制字符的正文 HTML（summary/description 截断用）。 */
  content: string
  /** noControlChars 口径的正文 HTML（CDATA 用）。 */
  cdataContent: string
  categories: TaxonomyTerm[]
  tags: TaxonomyTerm[]
  data: AnyRecord
}

function normalizeCategoryPaths(raw: readonly unknown[]): string[][] {
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  const entries = raw.filter(
    (item) => typeof item === 'string' || Array.isArray(item),
  )
  if (entries.length === 0) return []
  const hasHierarchy = entries.some((item) => Array.isArray(item))
  if (hasHierarchy) {
    return entries
      .map((item) => (Array.isArray(item) ? strings(item) : [String(item)]))
      .filter((segments) => segments.length > 0)
  }
  const flat = entries.filter((item): item is string => typeof item === 'string')
  return flat.length > 0 ? [flat] : []
}

function tagTerm(name: string): TaxonomyTerm {
  return { name, path: 'tags/' + taxonomySlug(name) + '/' }
}

function categoryTerm(segments: string[]): TaxonomyTerm {
  return {
    name: segments[segments.length - 1],
    path: 'categories/' + segments.map((segment) => taxonomySlug(segment)).join('/') + '/',
  }
}

let postViewsPromise: Promise<PostView[]> | null = null

/** 文章视图：date 降序（Hexo post generator 的排序），正文取 eager 渲染结果 + rewriteHeadings。 */
export function loadPostViews(): Promise<PostView[]> {
  if (!postViewsPromise) {
    postViewsPromise = (async () => {
      const entries = await getCollection('posts')
      const views = entries
        .filter((entry) => (entry.data as AnyRecord).layout !== 'page')
        .map((entry) => {
          const data = entry.data as AnyRecord
          const date = asDate(data.date) || new Date(0)
          const updated = asDate(data.updated) || date
          const rawHtml = entry.rendered && typeof entry.rendered.html === 'string' ? entry.rendered.html : ''
          const content = rewriteHeadings(rawHtml).html
          const tagNames = Array.isArray(data.tags)
            ? data.tags.filter((item): item is string => typeof item === 'string')
            : []
          const categoryPaths = normalizeCategoryPaths(
            Array.isArray(data.categories) ? data.categories : [],
          )
          const categories: TaxonomyTerm[] = []
          const seenCategory = new Set<string>()
          for (const segments of categoryPaths) {
            for (let depth = 1; depth <= segments.length; depth++) {
              const term = categoryTerm(segments.slice(0, depth))
              if (seenCategory.has(term.path)) continue
              seenCategory.add(term.path)
              categories.push(term)
            }
          }
          return {
            id: entry.id,
            title: typeof data.title === 'string' ? data.title : entry.id,
            href: sitePath(postHref(entry)),
            date,
            updated,
            content,
            cdataContent: stripControlChars(content),
            categories,
            tags: tagNames.map((name) => tagTerm(name)),
            data,
          }
        })
      views.sort((left, right) => right.date.getTime() - left.date.getTime())
      return views
    })()
  }
  return postViewsPromise
}

/** Hexo page.path 语义：permalink 尾部 / → index；无扩展名 → .html。 */
function hexoPagePath(permalink: string): string {
  let value = String(permalink || '')
  if (!value) return '/index.html'
  if (value.endsWith('/')) value += 'index'
  const last = value.slice(value.lastIndexOf('/') + 1)
  if (!/\.[A-Za-z0-9]+$/.test(last)) value += '.html'
  return '/' + value.replace(/^\/+/, '')
}

export interface PageView {
  href: string
  updated: Date
  permalink: string
}

let pageViewsPromise: Promise<PageView[]> | null = null

/** 独立页面视图（layout: page）；updated 缺失时回退到迁移期快照的源文件 mtime。 */
export function loadPageViews(): Promise<PageView[]> {
  if (!pageViewsPromise) {
    pageViewsPromise = (async () => {
      const entries = await getCollection('posts')
      return entries
        .filter((entry) => (entry.data as AnyRecord).layout === 'page')
        .map((entry) => {
          const data = entry.data as AnyRecord
          const permalink =
            typeof data.permalink === 'string' && data.permalink
              ? data.permalink
              : '/' + entry.id.replace(/-page$/, '') + '/'
          const fallback = PAGE_UPDATED_BY_PERMALINK[permalink]
          const updated =
            asDate(data.updated) ||
            asDate(fallback) ||
            asDate(data.date) ||
            new Date(0)
          return { href: hexoPagePath(permalink), updated, permalink }
        })
    })()
  }
  return pageViewsPromise
}

/* ------------------------------------------------------------------ */
/* sitemap 公共数据                                                     */
/* ------------------------------------------------------------------ */

interface DatedUrl {
  loc: string
  date: Date
}

function collectTagTerms(posts: PostView[]): TaxonomyTerm[] {
  const seen = new Set<string>()
  const terms: TaxonomyTerm[] = []
  for (const post of posts) {
    for (const tag of post.tags) {
      if (seen.has(tag.path)) continue
      seen.add(tag.path)
      terms.push(tag)
    }
  }
  return terms
}

function collectCategoryTerms(posts: PostView[]): TaxonomyTerm[] {
  const seen = new Set<string>()
  const terms: TaxonomyTerm[] = []
  for (const post of posts) {
    for (const category of post.categories) {
      if (seen.has(category.path)) continue
      seen.add(category.path)
      terms.push(category)
    }
  }
  return terms
}

/* ------------------------------------------------------------------ */
/* search.xml（hexo-generator-search 2.4.3）                            */
/* ------------------------------------------------------------------ */

export async function renderSearchIndex(): Promise<Response> {
  const config = GENERATORS.search
  if (!config) return xmlResponse('')
  const posts = await loadPostViews()
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>', '<search>']
  for (const post of posts) {
    if (post.data.indexing === false) continue
    const href = escapeXml(encodeUrl(post.href))
    lines.push('  <entry>')
    lines.push('    <title>' + escapeXml(post.title) + '</title>')
    lines.push('    <link href="' + href + '"/>')
    lines.push('    <url>' + href + '</url>')
    if (config.content) {
      lines.push('    <content type="html">' + cdata(post.cdataContent) + '</content>')
    }
    if (post.categories.length > 0) {
      lines.push('    <categories>')
      for (const category of post.categories) {
        lines.push('      <category>' + escapeXml(category.name) + '</category>')
      }
      lines.push('    </categories>')
    }
    if (post.tags.length > 0) {
      lines.push('    <tags>')
      for (const tag of post.tags) {
        lines.push('      <tag>' + escapeXml(tag.name) + '</tag>')
      }
      lines.push('    </tags>')
    }
    lines.push('  </entry>')
  }
  lines.push('</search>')
  return xmlResponse(lines.join('\n') + '\n')
}

/* ------------------------------------------------------------------ */
/* feed（hexo-pretty-feed 1.1.0）                                       */
/* ------------------------------------------------------------------ */

function sortPostsByOrder(posts: PostView[], orderBy: string): PostView[] {
  const descending = orderBy.startsWith('-')
  const field = orderBy.replace(/^-/, '') === 'updated' ? 'updated' : 'date'
  return [...posts].sort((left, right) => {
    const delta = right[field].getTime() - left[field].getTime()
    return descending ? delta : -delta
  })
}

async function selectFeedPosts(config: FeedGeneratorConfig): Promise<PostView[]> {
  let posts = sortPostsByOrder(await loadPostViews(), config.orderBy)
  if (typeof config.limit === 'number' && config.limit > 0) posts = posts.slice(0, config.limit)
  return posts
}

function firstDate(posts: PostView[]): Date {
  return posts.length > 0 ? posts[0].updated : new Date(0)
}

function truncateContent(content: string, limit: number, delim: string): string {
  let short = content.substring(0, limit)
  if (delim) {
    const position = short.lastIndexOf(delim)
    if (position > -1) short = short.substring(0, position)
  }
  return short
}

/** 模板里 description → intro → excerpt → content 截断 的分支顺序。 */
function summaryOf(post: PostView, config: FeedGeneratorConfig): string {
  const candidates = [post.data.description, post.data.intro, post.data.excerpt]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return truncateContent(post.content, config.contentLimit, config.contentLimitDelim)
}

function feedIconUrl(config: FeedGeneratorConfig): string {
  return config.icon ? encodeUrl(fullUrl(config.icon)) : ''
}

function categoryScheme(term: TaxonomyTerm): string {
  return encodeUrl(fullUrl(term.path))
}

function rssCategoryDomain(term: TaxonomyTerm): string {
  return encodeUrl(FEED_BASE + term.path)
}

function atomBody(config: FeedGeneratorConfig, outputPath: string, posts: PostView[]): string {
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>']
  if (config.prettyAtomFile) {
    lines[0] += '<?xml-stylesheet type="text/xsl" href="' + escapeXml(config.prettyAtomFile) + '" ?>'
  }
  lines.push('<feed xmlns="http://www.w3.org/2005/Atom">')
  lines.push('  <title>' + escapeXml(SITE_TITLE) + '</title>')
  const icon = feedIconUrl(config)
  if (icon) lines.push('  <icon>' + escapeXml(icon) + '</icon>')
  if (SITE_SUBTITLE) lines.push('  <subtitle>' + escapeXml(SITE_SUBTITLE) + '</subtitle>')
  lines.push('  <link href="' + escapeXml(encodeUrl(fullUrl(outputPath))) + '" rel="self"/>')
  if (config.hub) lines.push('  <link href="' + escapeXml(encodeUrl(config.hub)) + '" rel="hub"/>')
  lines.push('  <link href="' + escapeXml(encodeUrl(FEED_BASE)) + '"/>')
  lines.push('  <updated>' + isoInstant(firstDate(posts)) + '</updated>')
  lines.push('  <id>' + escapeXml(encodeUrl(FEED_BASE)) + '</id>')
  if (SITE_AUTHOR) {
    lines.push('  <author>')
    lines.push('    <name>' + escapeXml(SITE_AUTHOR) + '</name>')
    if (SITE_EMAIL) lines.push('    <email>' + escapeXml(SITE_EMAIL) + '</email>')
    lines.push('  </author>')
  }
  lines.push('  <generator uri="https://hexo.io/">Hexo</generator>')
  for (const post of posts) {
    const url = escapeXml(encodeUrl(ORIGIN + post.href))
    lines.push('  <entry>')
    lines.push('    <title>' + escapeXml(post.title) + '</title>')
    lines.push('    <link href="' + url + '"/>')
    lines.push('    <id>' + url + '</id>')
    lines.push('    <published>' + isoInstant(post.date) + '</published>')
    lines.push('    <updated>' + isoInstant(post.updated) + '</updated>')
    if (config.content && post.content) {
      lines.push('    <content type="html">' + cdata(post.cdataContent) + '</content>')
    }
    if (post.content) {
      lines.push('    <summary type="html">' + escapeXml(summaryOf(post, config)) + '</summary>')
    }
    const image = typeof post.data.image === 'string' && post.data.image ? post.data.image : ''
    if (image) {
      lines.push('    <content src="' + escapeXml(encodeUrl(fullUrl(image))) + '" type="image"/>')
    }
    for (const category of post.categories) {
      lines.push(
        '    <category term="' +
          escapeXml(category.name) +
          '" scheme="' +
          escapeXml(categoryScheme(category)) +
          '"/>',
      )
    }
    for (const tag of post.tags) {
      lines.push(
        '    <category term="' + escapeXml(tag.name) + '" scheme="' + escapeXml(categoryScheme(tag)) + '"/>',
      )
    }
    lines.push('  </entry>')
  }
  lines.push('</feed>')
  return lines.join('\n') + '\n'
}

function rss2Body(config: FeedGeneratorConfig, outputPath: string, posts: PostView[]): string {
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>']
  if (config.prettyRss2File) {
    lines[0] += '<?xml-stylesheet type="text/xsl" href="' + escapeXml(config.prettyRss2File) + '" ?>'
  }
  lines.push('<rss version="2.0"')
  lines.push('  xmlns:atom="http://www.w3.org/2005/Atom"')
  lines.push('  xmlns:content="http://purl.org/rss/1.0/modules/content/">')
  lines.push('  <channel>')
  lines.push('    <title>' + escapeXml(SITE_TITLE) + '</title>')
  lines.push('    <link>' + escapeXml(FEED_BASE) + '</link>')
  const icon = feedIconUrl(config)
  if (icon) {
    lines.push('    <image>')
    lines.push('      <url>' + escapeXml(icon) + '</url>')
    lines.push('      <title>' + escapeXml(SITE_TITLE) + '</title>')
    lines.push('      <link>' + escapeXml(FEED_BASE) + '</link>')
    lines.push('    </image>')
  }
  lines.push(
    '    <atom:link href="' + escapeXml(encodeUrl(fullUrl(outputPath))) + '" rel="self" type="application/rss+xml"/>',
  )
  if (config.hub) lines.push('    <atom:link href="' + escapeXml(encodeUrl(config.hub)) + '" rel="hub"/>')
  lines.push('    <description>' + escapeXml(SITE_DESCRIPTION) + '</description>')
  lines.push('    <pubDate>' + utcString(firstDate(posts)) + '</pubDate>')
  lines.push('    <generator>http://hexo.io/</generator>')
  for (const post of posts) {
    const url = escapeXml(encodeUrl(ORIGIN + post.href))
    lines.push('    <item>')
    lines.push('      <title>' + escapeXml(post.title) + '</title>')
    lines.push('      <link>' + url + '</link>')
    lines.push('      <guid>' + url + '</guid>')
    lines.push('      <pubDate>' + utcString(post.date) + '</pubDate>')
    if (post.content) {
      lines.push('      <description>' + escapeXml(summaryOf(post, config)) + '</description>')
    }
    const image = typeof post.data.image === 'string' && post.data.image ? post.data.image : ''
    if (image) {
      lines.push('      <enclosure url="' + escapeXml(encodeUrl(fullUrl(image))) + '" type="image"/>')
    }
    if (config.content && post.content) {
      lines.push('      <content:encoded>' + cdata(post.cdataContent) + '</content:encoded>')
    }
    for (const category of post.categories) {
      lines.push(
        '      <category domain="' +
          escapeXml(rssCategoryDomain(category)) +
          '">' +
          escapeXml(category.name) +
          '</category>',
      )
    }
    for (const tag of post.tags) {
      lines.push(
        '      <category domain="' + escapeXml(rssCategoryDomain(tag)) + '">' + escapeXml(tag.name) + '</category>',
      )
    }
    if (post.data.comments) {
      lines.push('      <comments>' + url + '#disqus_thread</comments>')
    }
    lines.push('    </item>')
  }
  lines.push('  </channel>')
  lines.push('</rss>')
  return lines.join('\n') + '\n'
}

export async function renderFeed(type: 'atom' | 'rss2', outputPath: string): Promise<Response> {
  const config = GENERATORS.feed
  if (!config) return xmlResponse('')
  const posts = await selectFeedPosts(config)
  if (type === 'rss2') return xmlResponse(rss2Body(config, outputPath, posts))
  return xmlResponse(atomBody(config, outputPath, posts))
}

/* ------------------------------------------------------------------ */
/* sitemap（hexo-generator-sitemap 3.0.1）                              */
/* ------------------------------------------------------------------ */

function sitemapXmlBody(config: SitemapGeneratorConfig, posts: PostView[], pages: PageView[]): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>']
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  const rows: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }> = []
  for (const item of posts) {
    rows.push({ loc: encodeUrl(ORIGIN + item.href), lastmod: dayStamp(item.updated), changefreq: 'monthly', priority: '0.6' })
  }
  for (const item of pages) {
    rows.push({ loc: encodeUrl(ORIGIN + item.href), lastmod: dayStamp(item.updated), changefreq: 'monthly', priority: '0.6' })
  }
  for (const item of STATIC_PAGES) {
    rows.push({
      loc: encodeUrl(ORIGIN + sitePath(item.path)),
      lastmod: dayStamp(asDate(item.updated) || new Date(0)),
      changefreq: 'monthly',
      priority: '0.6',
    })
  }
  rows.sort((left, right) => {
    if (left.lastmod === right.lastmod) return 0
    return left.lastmod < right.lastmod ? 1 : -1
  })
  for (const row of rows) {
    lines.push('  <url>')
    lines.push('    <loc>' + escapeXml(row.loc) + '</loc>')
    lines.push('    <lastmod>' + row.lastmod + '</lastmod>')
    lines.push('    <changefreq>' + row.changefreq + '</changefreq>')
    lines.push('    <priority>' + row.priority + '</priority>')
    lines.push('  </url>')
  }
  lines.push('  <url>')
  lines.push('    <loc>' + escapeXml(encodeUrl(FEED_BASE)) + '</loc>')
  lines.push('    <lastmod>' + BUILD_DAY + '</lastmod>')
  lines.push('    <changefreq>daily</changefreq>')
  lines.push('    <priority>1.0</priority>')
  lines.push('  </url>')
  if (config.tags) {
    for (const term of collectTagTerms(posts)) {
      lines.push('  <url>')
      lines.push('    <loc>' + escapeXml(encodeUrl(FEED_BASE + term.path)) + '</loc>')
      lines.push('    <lastmod>' + BUILD_DAY + '</lastmod>')
      lines.push('    <changefreq>weekly</changefreq>')
      lines.push('    <priority>0.2</priority>')
      lines.push('  </url>')
    }
  }
  if (config.categories) {
    for (const term of collectCategoryTerms(posts)) {
      lines.push('  <url>')
      lines.push('    <loc>' + escapeXml(encodeUrl(FEED_BASE + term.path)) + '</loc>')
      lines.push('    <lastmod>' + BUILD_DAY + '</lastmod>')
      lines.push('    <changefreq>weekly</changefreq>')
      lines.push('    <priority>0.2</priority>')
      lines.push('  </url>')
    }
  }
  lines.push('</urlset>')
  return lines.join('\n') + '\n'
}

function sitemapTxtBody(config: SitemapGeneratorConfig, posts: PostView[], pages: PageView[]): string {
  const lines: string[] = []
  const dated: DatedUrl[] = []
  for (const item of posts) dated.push({ loc: encodeUrl(ORIGIN + item.href), date: item.updated })
  for (const item of pages) dated.push({ loc: encodeUrl(ORIGIN + item.href), date: item.updated })
  for (const item of STATIC_PAGES) {
    dated.push({ loc: encodeUrl(ORIGIN + sitePath(item.path)), date: asDate(item.updated) || new Date(0) })
  }
  dated.sort((left, right) => right.date.getTime() - left.date.getTime())
  for (const item of dated) lines.push(item.loc)
  lines.push(encodeUrl(FEED_BASE))
  if (config.tags) for (const term of collectTagTerms(posts)) lines.push(encodeUrl(FEED_BASE + term.path))
  if (config.categories) for (const term of collectCategoryTerms(posts)) lines.push(encodeUrl(FEED_BASE + term.path))
  return lines.join('\n') + '\n'
}

export async function renderSitemap(kind: 'xml' | 'txt', outputPath: string): Promise<Response> {
  const config = GENERATORS.sitemap
  if (!config) return xmlResponse('')
  const output = config.outputs.find((item) => item.path === outputPath) || config.outputs.find((item) => item.kind === kind)
  const actualKind = output ? output.kind : kind
  const posts = await loadPostViews()
  const pages = await loadPageViews()
  if (actualKind === 'txt') return textResponse(sitemapTxtBody(config, posts, pages))
  return xmlResponse(sitemapXmlBody(config, posts, pages))
}

/* ------------------------------------------------------------------ */
/* 百度（hexo-generator-baidu-sitemap / hexo-baidu-url-submit）          */
/* ------------------------------------------------------------------ */

export async function renderBaiduSitemap(): Promise<Response> {
  const config = GENERATORS.baidusitemap
  if (!config) return xmlResponse('')
  const origin = config.url ? config.url.replace(/\/+$/, '') : ORIGIN
  // hexo-generator-baidu-sitemap 的 ejs 里 if (post.categories) 对 Hexo 的 Query 对象恒为真，
  // 实际效果是「所有非 baidusitemap:false 的文章」都进 baidusitemap（无分类文章也不例外），
  // 这里按实际产物语义对齐（golden 里无分类的 /posts/p3eeb/ 也在）。
  const posts = (await loadPostViews())
    .filter((post) => post.data.baidusitemap !== false)
    .sort((left, right) => right.updated.getTime() - left.updated.getTime())
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>']
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  for (const post of posts) {
    lines.push('  <url>')
    lines.push('    <loc>' + escapeXml(encodeUrl(origin + post.href)) + '</loc>')
    lines.push('    <lastmod>' + dayStamp(post.updated) + '</lastmod>')
    lines.push('  </url>')
  }
  lines.push('</urlset>')
  return xmlResponse(lines.join('\n') + ' ')
}

export async function renderBaiduUrls(): Promise<Response> {
  const config = GENERATORS.baiduUrlSubmit
  if (!config) return textResponse('')
  // hexo-baidu-url-submit：按 date 倒序，count 缺失/<=0 时不给上限。
  const posts = await loadPostViews()
  const limited =
    typeof config.count === 'number' && config.count > 0 ? posts.slice(0, config.count) : posts
  return textResponse(limited.map((post) => encodeUrl(ORIGIN + post.href)).join('\n'))
}
`

  return template
    .replaceAll('__SITE_CONFIG__', siteConfigSpecifier)
    .replaceAll('__PERMALINK__', permalinkSpecifier)
    .replaceAll('__TAXONOMY__', taxonomySpecifier)
    .replaceAll('__GENERATORS__', JSON.stringify(generators, null, 2))
    .replaceAll('__STATIC_PAGES__', JSON.stringify(staticPages, null, 2))
    .replaceAll('__PAGE_UPDATED__', JSON.stringify(pageUpdatedByPermalink, null, 2))
}

/** 生成单个站点级生成物的 Astro endpoint 路由文件内容。 */
function renderGeneratorEndpoint({ specifier, importName, call }) {
  return `/**
 * AUTO-GENERATED by scripts/migrate-hexo.mjs — 构建期生成站点级文件（W2-B2）。
 *
 * 配置来源：源站 _config.yml 的 search / feed / sitemap / baidusitemap / baidu_url_submit。
 * 实现（XML 序列化 / 正文取法）全部在 src/data/site-feeds.ts，这里只是路由壳。
 */
import { ${importName} } from '${specifier}'

export const prerender = true

export const GET = ${call}
`
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

  /* 目标站自包含：src/ 整树拷贝 + 生成物注入；跨盘/跨仓引用机制已随模板仓化删除。 */
  const warnings = []

  /**
   * ESM import 说明符按「引用文件所在目录」解析，不能所有页面共用一个前缀。
   * 这里按每个产物文件单独计算到仓库根 / 目标站根的相对路径。
   */
  const relativeSpecifier = (fileRel, targetAbs) => {
    const from = path.dirname(path.join(OUT, fileRel))
    const raw = path.relative(from, targetAbs)
    if (raw === '') return '.'
    // Windows 跨盘符时 path.relative 返回绝对路径，相对 import 说明符无法表示；
    // 此时退回 file:// URL，不能强加 './'（会拼出 './D:/...' 这种非法说明符）。
    if (path.isAbsolute(raw)) return pathToFileURL(targetAbs).href
    const r = posix(raw)
    return r.startsWith('.') ? r : `./${r}`
  }
  const siteConfigSpecifier = (fileRel) => `${relativeSpecifier(fileRel, OUT)}/site.config`

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
  /** 1.7.1 没有但主题包保留的兼容键：算「命中」，不剔除、不进 unsupported。 */
  const legacyThemeKeys = themeKeys.filter((key) => LEGACY_THEME_KEYS.has(key))
  const isAcceptedKey = (key) => targetKeySet.has(key) || LEGACY_THEME_KEYS.has(key)
  const matchedThemeKeys = themeKeys.filter(isAcceptedKey)
  const missingIn171 = themeKeys.filter((key) => !isAcceptedKey(key))
  const addedIn171 = target.keys.filter((key) => !themeKeys.includes(key))
  for (const key of legacyThemeKeys) {
    warnings.push(
      `${key} 是 1.6.14 的遗留配置（1.7.1 上游已移除），主题包按兼容键保留并已移植对应页面分支，配置原样保留；新配置建议迁移到 friends_vue。`,
    )
    console.log(`  · 保留 1.6.14 兼容键「${key}」（主题包 schema 标 deprecated，见 P7-4）`)
  }

  /* ---- [3/8] site.config.ts ---- */
  console.log('\n[3/8] 站点配置 → site.config.ts')
  const siteForRender = {}
  for (const key of ['title', 'subtitle', 'description', 'keywords', 'author', 'email', 'language', 'url', 'root']) {
    if (key in siteCfg.data) siteForRender[key] = siteCfg.data[key]
  }
  if (!siteForRender.root) siteForRender.root = '/'
  if (!siteForRender.title) siteForRender.title = siteName
  // Hexo 允许 keywords 写成 YAML 列表（EJS 里 `<%= config.keywords %>` 会渲染成
  // 逗号拼接的字符串），而主题侧 SiteMeta.keywords 是 string，这里统一成前者。
  if (Array.isArray(siteForRender.keywords)) siteForRender.keywords = siteForRender.keywords.join(',')
  const extras = {}
  for (const key of ['timezone', 'per_page', 'permalink', 'external_link', 'index_generator', 'pagination_dir']) {
    if (key in siteCfg.data) extras[key] = siteCfg.data[key]
  }
  extras.sourceTopLevelKeys = siteKeys
  const siteConfigTs = `/**
 * AUTO-GENERATED by scripts/migrate-hexo.mjs — 来自源站 _config.yml。
 *
 * site      : 主题渲染需要的站点元数据（对应 src/utils/url-utils.ts 的 SiteConfig）。
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
    if (isAcceptedKey(key)) cleaned[key] = value
  }

  /* ---- 配置值形态归一化（1.6.14 允许、1.7.1 strict schema 拒绝的写法） ---- */
  // 只做「运行时等价」的形态转换，语义不变，且每条都写进 warnings。
  // 上游文档 _config.yml 的 darkmode 注释里明确列了 `autoChangeMode: false`
  // （不同步系统/时段 = 手动），主题运行时只判断 `=== 1` / `=== 2`，其余值一律走
  // 手动分支（见 src/components/head/inject-head-js.ts:131），
  // 但 1.7.1 的 schema 写的是 `z.number()`（schema.ts:686），false 会被拒。
  if (cleaned.darkmode && typeof cleaned.darkmode === 'object' && cleaned.darkmode.autoChangeMode === false) {
    cleaned.darkmode.autoChangeMode = 0
    warnings.push(
      'darkmode.autoChangeMode: false → 0。上游注释允许 false（=不自动切换，手动模式），主题运行时只判断 ===1/===2，0 与 false 行为一致；1.7.1 schema 只接受 number。',
    )
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
      // 以下两项只给插件产物生成用（random.js 的 posts 列表）：
      // slug = 内容集合 id（= 目标文件名去扩展名，与 post-permalink.ts 的 slugOf 同口径）
      slug: outRel.replace(/\.md$/i, ''),
      // 上游 random generator：`random !== false` 才进 posts（注意 false 以外的 falsy 值也算）
      randomExcluded: data.random === false,
    })
  }
  const postsWithAbbrlink = postRecords.filter((p) => p.hasAbbrlink).length
  console.log(`  ✓ 文章 ${postRecords.length} 篇（含 abbrlink ${postsWithAbbrlink} 篇）`)

  const sourceDir = path.join(SITE, 'source')
  // 独立页面：`**/index.md` → permalink /<目录>/；其余 `*.md`（如 QwQ/equipment/jxgm-link.md）
  // Hexo 渲染成 <路径>.html（page.path = 源路径 .md → .html），permalink 照此注入。
  const pageFiles = walkFiles(sourceDir).filter(
    (rel) =>
      rel.toLowerCase().endsWith('.md') &&
      !rel.startsWith('_posts/') &&
      !rel.startsWith('_data/') &&
      !rel.startsWith('.obsidian/'),
  )
  const pageRecords = []
  const unsupported = []
  for (const rel of pageFiles) {
    const relLower = rel.toLowerCase()
    const isDirIndex = relLower.endsWith('/index.md') || relLower === 'index.md'
    // 根 index.md 切 '' 会让 permalink 变成 '//'，这里保留空目录名但单独兜底。
    const dirName = isDirIndex ? rel.slice(0, -'index.md'.length).replace(/\/$/, '') : rel.slice(0, -'.md'.length)
    const permalink = isDirIndex ? (dirName ? `/${dirName}/` : '/') : `/${dirName}.html`
    const srcAbs = path.join(sourceDir, rel)
    const original = readFileSync(srcAbs, 'utf8')
    const { data } = readFrontmatter(original, rel)
    const type = typeof data.type === 'string' && data.type ? data.type : 'default'
    const declaredLayout = typeof data.layout === 'string' ? data.layout : null
    const hadPermalink = /^permalink\s*:/m.test(readFrontmatter(original, rel).fmText)
    let migrated = injectPageFrontmatter(original, permalink)
    if (!data.title) {
      // 源站允许页面没有 title（如 QwQ/equipment/jxgm-link.md 连 frontmatter 都没有），
      // Hexo 渲染出空的 page-title；内容 schema 的 title 必填，这里补空串保持一致。
      migrated = migrated.replace(/^---(\r?\n)/, `---$1title: ""$1`)
    }
    const dest = `src/content/posts/${(dirName || 'index').replace(/\//g, '-')}-page.md`
    if (!STANDARD_PAGE_TYPES.has(type)) {
      // 上游 page.pug 的 case 同样没有 charts 这类自定义 type——一样落
      // default-page.pug（仅渲染正文）。我们的 DefaultPage 行为与上游一致，不是缺口。
      console.log(`  · page.type「${type}」走 default 分支（与上游 page.pug default 一致）：source/${rel}`)
    }
    if (declaredLayout && declaredLayout !== 'page') {
      // Hexo 对主题缺失的 layout 有回退链：指定模板不存在时按 is_post ? 'post' : 'page'
      // 渲染（hexo lib/theme/view.js）。1.6.14 源站主题与 1.7.1 上游都没有
      // sitetime.pug，源站产物实证 public/log/index.html 走 <div id="page">；
      // 所以「源站主题也没有该模板」的 layout 直接归一为 page，与源站渲染一致。
      const themeName = typeof siteCfg.data.theme === 'string' ? siteCfg.data.theme : 'anzhiyu'
      const sourceThemeLayoutDir = path.join(SITE, 'themes', themeName, 'layout')
      const templateExists = ['.pug', '.ejs', '.hbs', '.swig'].some((ext) =>
        existsSync(path.join(sourceThemeLayoutDir, `${declaredLayout}${ext}`)),
      )
      if (templateExists) {
        unsupported.push({
          category: 'layout',
          item: declaredLayout,
          location: `source/${rel}`,
          reason: `该页声明 layout: ${declaredLayout}，且源站主题里有对应模板（自定义布局）；Astro 侧 [..path].astro 只认 layout === 'page'，迁移后该 URL 会 404。`,
          action: '在目标站为该页补一个专用路由，或人工把 layout 改为 page 并接受默认渲染。',
        })
      } else {
        warnings.push(
          `layout: ${declaredLayout} → page。源站主题没有 ${declaredLayout} 模板，Hexo 的未知 layout 回退到 page 渲染（source/${rel}），这里归一成 page 与源站产物一致。`,
        )
        migrated = migrated.replace(
          new RegExp(`^layout:\\s*${declaredLayout}\\s*$`, 'm'),
          'layout: page',
        )
      }
    }
    writeOut(dest, migrated)
    pageRecords.push({
      source: `source/${rel}`,
      target: dest,
      dir: dirName,
      type,
      permalink: hadPermalink ? (data.permalink ?? permalink) : permalink,
      // Hexo updated_option=mtime：页面没有 frontmatter updated 时 updated=源文件 mtime，
      // sitemap 的 lastmod 与排序都要用它（构建期拿不到源站文件，迁移期先快照）。
      updated: statSync(srcAbs).mtime.toISOString(),
      injectedLayout: !declaredLayout,
      declaredLayout,
    })
  }
  const pageTypeList = [...new Set(pageRecords.map((p) => p.type))].sort()
  console.log(`  ✓ 独立页面 ${pageRecords.length} 个；page.type: ${pageTypeList.join(', ')}`)

  /* ---- [6/8] 数据 + 静态资源 ---- */
  console.log('\n[6/8] 模板整拷贝 + 站点数据 → src/data/，静态资源 → public/')

  // —— 模板整拷贝：输出站自包含（src/ + public/ + tsconfig.json，无跨仓引用）——
  // 生成物 / demo 内容跳过：
  //   src/content/**（demo 文章；源站文章写入 src/content/posts/）
  //   src/content.config.ts、src/data/site-identity.ts（下方生成）
  //   src/pages/**（ROUTES 与插件产物重写生成）
  //   src/data/*.yml（demo 站点数据；源站 _data 写入同目录）
  //   public/anzhiyu/**（random.js 等按源站数据生成）
  // 源站静态资源在 --assets 一步后拷，冲突时站点侧文件优先（与原 integration 语义一致）。
  const skipTemplateFile = (rel) =>
    rel.startsWith('content/') ||
    rel === 'content.config.ts' ||
    rel.startsWith('pages/') ||
    (rel.startsWith('data/') && (rel.endsWith('.yml') || rel === 'data/site-identity.ts'))
  for (const rel of walkFiles(path.join(TEMPLATE, 'src'))) {
    if (skipTemplateFile(rel)) continue
    copyOut(path.join(TEMPLATE, 'src', rel), `src/${rel}`, `模板 src/${rel}`)
  }
  for (const rel of walkFiles(path.join(TEMPLATE, 'public'))) {
    if (rel.startsWith('anzhiyu/')) continue
    copyOut(path.join(TEMPLATE, 'public', rel), `public/${rel}`, `模板 public/${rel}`)
  }
  copyOut(path.join(TEMPLATE, 'tsconfig.json'), 'tsconfig.json', '模板 tsconfig.json')
  const dataDir = path.join(SITE, 'source', '_data')
  const dataRecords = []
  if (existsSync(dataDir)) {
    for (const rel of walkFiles(dataDir)) {
      const srcAbs = path.join(dataDir, rel)
      const dest = `src/data/${rel}`
      copyOut(srcAbs, dest)
      dataRecords.push({ source: `source/_data/${rel}`, target: dest })
    }
  } else {
    console.log('  · 源站没有 source/_data/，跳过')
  }
  // 注意：模板的 site-data.ts 只 glob src/data/*.yml，.json 数据需自行接入。
  const ymlData = dataRecords.filter((d) => d.target.endsWith('.yml')).length
  console.log(`  ✓ 数据文件 ${dataRecords.length} 个（其中 .yml ${ymlData} 个可被 site-data.ts 读取）`)

  let assetCount = 0
  if (opts.assets) {
    for (const rel of walkFiles(sourceDir)) {
      if (rel.startsWith('_posts/') || rel.startsWith('_data/') || rel.startsWith('.obsidian/')) continue
      // .md 是内容（独立页面 / 可能的自定义渲染），Hexo 不会把原始 .md 放进 public；
      // 全部由上面的独立页面扫描接管，这里跳过避免 public 里出现 .md。
      if (rel.toLowerCase().endsWith('.md')) continue
      if (rel.toLowerCase() === 'index.md' || rel.toLowerCase().endsWith('/index.md')) continue
      copyOut(path.join(sourceDir, rel), `public/${rel}`)
      assetCount++
    }
    console.log(`  ✓ 静态资源 ${assetCount} 个 → public/`)
  } else {
    console.log('  · --no-assets：跳过静态资源')
  }

  // Hexo 会把「有内置 renderer 的 source 静态文件」（json/html/yml…）当 Page 参与 sitemap；
  // 这些文件的更新时间和 URL 清单在构建期拿不到，迁移期先快照（--no-assets 时不复制，
  // sitemap 里也就不列，避免生成 404 链接）。
  const staticPageInputs = opts.assets
    ? collectHexoStaticPageInputs(sourceDir, siteCfg.data.skip_render)
    : []
  if (staticPageInputs.length > 0) {
    console.log(
      `  ✓ sitemap 静态页面 ${staticPageInputs.length} 个（Hexo Page 语义）：${staticPageInputs
        .map((item) => item.path)
        .join(', ')}`,
    )
  }

  /* ---- [7/8] Astro 骨架 ---- */
  console.log('\n[7/8] Astro 项目骨架（配置 / 内容集合 / 路由 / 样式）')

  // package.json：普通 registry 依赖（模板 src/ 全量随站拷贝，无跨仓引用）。
  const packageJson = {
    name: `${siteName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-astro`,
    private: true,
    type: 'module',
    scripts: {
      dev: 'astro dev',
      build: 'astro build && node scripts/normalize-html-output.mjs',
      preview: 'astro preview',
    },
    dependencies: {
      '@astrojs/markdown-remark': '^7.3.10',
      astro: '^7.4.13',
      yaml: '^2.9.1',
      zod: '^4.6.7',
    },
    devDependencies: {
      'highlight.js': '^11.12.0',
      stylus: '^0.64.0',
    },
  }
  writeOut('package.json', packageJson)

  // Hexo 对「路径以 .html 结尾」的页面输出平文件（source/QwQ/equipment/jxgm-link.md →
  // public/QwQ/equipment/jxgm-link.html）；Astro 的 build.format=directory 会写成
  // jxgm-link.html/index.html。build 后把这类目录归一成平文件，URL 与源站一致。
  writeOut(
    'scripts/normalize-html-output.mjs',
    `/**
 * AUTO-GENERATED by scripts/migrate-hexo.mjs。
 * Hexo 语义归一：dist 下以 .html 结尾的「目录」（x.html/index.html）→ 平文件 x.html。
 * 只处理目录形式的 .html 输出；普通目录路由（foo/index.html）不受影响。
 */
import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

const DIST = path.resolve('dist')
let moved = 0
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry)
    if (!statSync(abs).isDirectory()) continue
    if (entry.endsWith('.html')) {
      const index = path.join(abs, 'index.html')
      const tmp = abs + '.__tmp__'
      if (!existsSync(index)) continue
      renameSync(index, tmp)
      rmSync(abs, { recursive: true, force: true })
      renameSync(tmp, abs)
      moved++
      continue
    }
    walk(abs)
  }
}
if (existsSync(DIST)) walk(DIST)
console.log(\`[normalize-html-output] 平文件化 \${moved} 处 .html 目录\`)
`,
  )

  // astro.config.mjs：复用模板的自定义 Markdown processor + stylus 插件，改配置文件名。
  let astroConfig = readFileSync(path.join(TEMPLATE, 'astro.config.mjs'), 'utf8')
  astroConfig = astroConfig.replace(
    "path.join(root, 'theme.config.yml')",
    "path.join(root, 'anzhiyu.config.yml')",
  )
  // 迁移产物面向 Hexo 历史内容：真实站 21/39 内容文件含 Hexo tag，且存在
  // 未闭合 / 未知 / 错配 tag。启用 remark-hexo-tag 的宽松模式（默认严格模式不变），
  // 让脏 tag 只 warning、原样透传，不中断内容集合渲染。若上游模板改了写法，
  // 显式 fail 而不是静默退回严格模式（否则未来迁移会重新卡在 build A）。
  const lenientBefore = astroConfig
  astroConfig = astroConfig.replace(
    /\[remarkHexoTag,\s*\{\s*noteStyle:\s*'flat'\s*\}\]/,
    "[remarkHexoTag, { noteStyle: 'flat', lenient: true }]",
  )
  if (astroConfig === lenientBefore) {
    fail('模板 astro.config.mjs 的 remarkPlugins 已变化，无法注入 lenient: true；请同步更新 scripts/migrate-hexo.mjs 的注入规则。')
  }
  writeOut('astro.config.mjs', astroConfig)

  // content.config.ts：复用模板的 schema，把 loader base 指向本站内容目录。
  let contentConfig = readFileSync(path.join(TEMPLATE, 'src', 'content.config.ts'), 'utf8')
  contentConfig = contentConfig.replace(/^\/\*\*[\s\S]*?\*\/\r?\n/, `/**
 * AUTO-GENERATED by scripts/migrate-hexo.mjs（schema 复用模板）。
 * 内容来源改为本目标站的 src/content/posts/（文章 + 独立页面共用一个集合）。
 * date/updated 的 Hexo 时区语义见下方 hexoDate 注释。
 */
`)
  // CONTENT_BASE 常量整体替换（2026-11-27 内容分层后 base 不再是字面量行）：
  // 模板的 env 分支对输出站无意义，收敛为固定指向 src/content/posts/。
  contentConfig = contentConfig.replace(
    /\r?\n\/\*\* 内容根：[\s\S]*?const CONTENT_BASE = process\.env\.ANZHIYU_CONTENT_BASE \|\| '\.\/src\/content'/,
    `\n/** 内容根：源站文章与独立页面（src/content/posts/）。 */\nconst CONTENT_BASE = './src/content/posts'`,
  )
  if (contentConfig.includes('ANZHIYU_CONTENT_BASE')) {
    fail('content.config.ts 的 CONTENT_BASE 替换失败（模板结构已变，检查 migrate 替换点）')
  }
  const tz = siteCfg.data.timezone
  const offset = timezoneOffsetMinutes(tz)
  // DST 检测（C1）：冬/夏各采一次，偏移不同即为夏令时时区。裸 GMT 已记 0，UTC 站 offset=0 不再平移 8 小时。
  const winterOffset = timezoneOffsetMinutes(tz, '2024-01-01T00:00:00Z')
  const hasDST = offset !== null && winterOffset !== null && offset !== winterOffset
  const fmtH = (m) => `UTC${m >= 0 ? '+' : ''}${(m / 60).toFixed(2)}`
  if (offset !== null) {
    contentConfig = contentConfig.replace(/const SITE_UTC_OFFSET_MINUTES = 8 \* 60/, `const SITE_UTC_OFFSET_MINUTES = ${offset}`)
    if (hasDST) {
      // content.config.ts 的 parseHexoDate 用单一 SITE_UTC_OFFSET_MINUTES 常量，无法按文章日期现场换算 DST 偏移；
      // 真·per-date 需改模板 src/content.config.ts（不在本批写范围），故登记限制到 MIGRATION.md。
      warnings.push(
        `源站 timezone ${tz} 含夏令时（冬 ${fmtH(winterOffset)} / 夏 ${fmtH(offset)}）。迁移产物 content.config.ts 的 parseHexoDate 用单一 SITE_UTC_OFFSET_MINUTES（现取 ${fmtH(offset)}），无法按文章日期现场换算 DST 偏移；跨夏令时边界的日期可能偏移约 1 小时，需人工核对（见 MIGRATION.md「时区」）。`,
      )
      console.log(`  ⚠ timezone ${tz} 含夏令时（冬 ${fmtH(winterOffset)} / 夏 ${fmtH(offset)}），单常量按 ${fmtH(offset)} 写入；DST per-date 限制已登记 MIGRATION.md`)
    } else {
      console.log(`  ✓ timezone ${tz} → ${fmtH(offset)}，已写入 content.config.ts`)
    }
  } else {
    warnings.push(`源站 timezone 为空/无法解析（${JSON.stringify(tz ?? '')}），content.config.ts 沿用 +08:00；若文章日期含显式时区请人工核对（见 MIGRATION.md「时区」）。`)
  }
  writeOut('src/content.config.ts', contentConfig)


  // 站点身份：模板把「基准站」元数据收敛到 src/data/site-identity.ts
  // （各页面 import SITE_IDENTITY，archives/_data.ts 再导出成 BASELINE_SITE）。
  // 迁移站没有「基准站」概念，这里让它直接复用 site.config.ts（来源：源站 _config.yml），
  // 保证站点身份只有一个来源；否则页面 import 会直接找不到模块（构建期
  // `Could not resolve '../data/site-identity.ts'`）。
  //
  // P7-4：额外把源站 permalink 编译出来的 `postHref()` 挂到 `site.postHref`，
  // 主题层的 preparePosts / preparePostPage / site-stats 会优先用它生成文章 URL
  // （render 阶段的 `site` 就是这份对象，见模板各页面与 BaseLayout）。
  writeOut(
    'src/data/site-identity.ts',
    `/**
 * AUTO-GENERATED by scripts/migrate-hexo.mjs
 *
 * 模板用本文件承载「基准站」身份（archives/_data.ts 再导出成 BASELINE_SITE）。
 * 迁移站的身份来自源站 _config.yml，已由本脚本生成到 site.config.ts；
 * 这里再挂上源站 permalink 编译产物 postHref（文章 URL 单一真源，P7-4），
 * 避免身份散落两处、也避免 DEPLOY_SITE_* 演示覆盖语义与真实站点 URL 打架。
 */
import { site as siteIdentity } from '../../site.config'
import { postHref } from './post-permalink.ts'

/** 站点身份 + 文章 permalink 解析器（主题组件通过 \`site.postHref\` 取用）。 */
export const SITE_IDENTITY = { ...siteIdentity, postHref }
`,
  )


  // 上游主题 CSS 笔误（逐字节存在于 1.6.14 与 1.7.1 的 _third-party/twikoo.styl）：
  //
  //     .tk-actions
  //       a
  //       cursor pointer      ← 与 a 同级，本该再缩进一层
  //
  // Stylus 照原样输出 `… .tk-actions { a\n cursor: pointer; }`。浏览器把这段当非法
  // 声明整条丢弃（等价于 .tk-actions 没有任何声明），但 Astro 的 postcss 会让整个
  // 构建失败：`[postcss] index.styl:16823:3: Unknown word cursor`。
  // 这里按「浏览器实际生效结果」删掉这两行；**不要**改成正确缩进——那会让
  // cursor:pointer 真的生效，偏离上游视觉。只有 comments.use = Twikoo 时才会展开这一段。
  const TWIKOO_TYPO_RE =
    /( *)\.tk-actions(\r?\n)( *)a\2 *cursor pointer\2/
  const twikooSourceRel = 'upstream/_third-party/twikoo.styl'
  const twikooStyl = `src/styles/${twikooSourceRel}`
  {
    const source = readFileSync(path.join(TEMPLATE, 'src', 'styles', twikooSourceRel), 'utf8')
    if (TWIKOO_TYPO_RE.test(source)) {
      if (!DRY) {
        // 原地改写 copyOut 刚落盘的那份：不走 writeOut，避免 outputFiles / counters 重复计数。
        writeFileSync(
          path.join(OUT, twikooStyl),
          source.replace(
            TWIKOO_TYPO_RE,
            (_match, indent, nl) =>
              `${indent}.tk-actions${nl}${indent}  // 迁移修正：上游 \`.tk-actions / a / cursor pointer\` 缩进笔误，` +
              `浏览器整条丢弃，此处按等价语义删除（见 scripts/migrate-hexo.mjs）${nl}`,
          ),
          'utf8',
        )
        // warning/日志移进 !DRY（C5）：落盘后才声称「已修正」，dry-run 不再误导性地说「已修正」。
        warnings.push(
          '上游 _third-party/twikoo.styl 的 `.tk-actions / a / cursor pointer` 缩进笔误已按等价语义删除（浏览器本来就不生效，否则 postcss 会让构建失败）。',
        )
        console.log('  ✓ 修正上游 twikoo.styl 的 CSS 缩进笔误（仅 Twikoo 站会展开）')
      } else {
        console.log('  · [dry-run] 将修正上游 twikoo.styl 的 CSS 缩进笔误（仅 Twikoo 站会展开）')
      }
    }
  }

  // 路由集合：首页 / 分页 / 独立页面 / 文章页 / 404 / 归档（三级） / 分类 / 标签。
  // 归档/分类/标签的数据层在模板 src/pages/archives/_data.ts，常量来自
  // 基准站 _config.yml；迁移站按源站配置注入（见 rewriteArchiveData）。
  // Hexo 官方 generator 的默认值（未配置块时）：
  //   archive_generator: per_page=站点 per_page，yearly/monthly=true，daily=false
  //   category_generator / tag_generator: per_page=站点 per_page
  const sitePerPage = typeof siteCfg.data.per_page === 'number' ? siteCfg.data.per_page : 10
  const generatorPerPage = (block, key) => {
    const value = siteCfg.data[key]
    if (value && typeof value === 'object' && typeof value.per_page === 'number') return value.per_page
    return sitePerPage
  }
  const archiveGeneratorBlock = siteCfg.data.archive_generator ?? {}
  const archiveConfig = {
    enable: true,
    per_page: generatorPerPage(null, 'archive_generator'),
    yearly: archiveGeneratorBlock.yearly !== undefined ? archiveGeneratorBlock.yearly === true : true,
    monthly: archiveGeneratorBlock.monthly !== undefined ? archiveGeneratorBlock.monthly === true : true,
    daily: archiveGeneratorBlock.daily === true,
  }
  const siteDateFormat = typeof siteCfg.data.date_format === 'string' && siteCfg.data.date_format ? siteCfg.data.date_format : 'YYYY-MM-DD'
  const siteTimeFormat = typeof siteCfg.data.time_format === 'string' && siteCfg.data.time_format ? siteCfg.data.time_format : 'HH:mm:ss'
  const siteTimezone = extras.timezone && String(extras.timezone).trim() ? String(extras.timezone).trim() : 'Asia/Shanghai'
  const siteLanguage = typeof siteForRender.language === 'string' && siteForRender.language ? siteForRender.language : 'zh-CN'

  /**
   * 把模板的 archives/_data.ts 改写成迁移站的版本：
   *   1. 基准站常量（时区 / 语言 / 日期格式 / 各级 per_page）→ 源站 _config.yml 的值；
   *   2. ARCHIVE_GENERATOR 块 → 按源站配置与 Hexo 默认值合成；
   *   3. 文章 href → 走 post-permalink.ts（源站 permalink 模式，如 posts/p:abbrlink/），
   *      否则归档/分类页里的链接与文章真实 URL 不一致。
   */
  const rewriteArchiveData = (text) => {
    let out = text
    // 常量块中间夹着逐行注释（/** 基准站 … */），所以只锚定首尾两行
    const constBlock =
      /export const SITE_TIMEZONE = '[^']*'[\s\S]*?export const TAG_PER_PAGE = \d+\r?\n/
    if (!constBlock.test(out)) {
      fail('archives/_data.ts 的基准常量块与预期结构不符，无法注入源站配置（模板该文件可能已变更）')
    }
    out = out.replace(
      constBlock,
      [
        `export const SITE_TIMEZONE = '${siteTimezone}'`,
        `export const SITE_LANGUAGE = '${siteLanguage}'`,
        `export const DATE_FORMAT = '${siteDateFormat}'`,
        `export const TIME_FORMAT = '${siteTimeFormat}'`,
        `export const SITE_PER_PAGE = ${sitePerPage}`,
        `export const ARCHIVE_PER_PAGE = ${archiveConfig.per_page}`,
        `export const CATEGORY_PER_PAGE = ${generatorPerPage(null, 'category_generator')}`,
        `export const TAG_PER_PAGE = ${generatorPerPage(null, 'tag_generator')}`,
        '',
      ].join('\n'),
    )
    const archBlock = /const ARCHIVE_GENERATOR = \{[\s\S]*?\}/
    if (!archBlock.test(out)) fail('archives/_data.ts 的 ARCHIVE_GENERATOR 块与预期结构不符')
    out = out.replace(archBlock, `const ARCHIVE_GENERATOR = ${JSON.stringify(archiveConfig)}`)
    // 文章 href：/YYYY/MM/DD/<slug>/ → 源站 permalink（post-permalink.ts 的 postHref）
    const hrefLine =
      "href: urlFor(`/${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${postSlugOf(entry)}/`),"
    if (!out.includes(hrefLine)) fail('archives/_data.ts 的文章 href 行与预期不符')
    out = out.replace(hrefLine, 'href: urlFor(postHref(entry)),')
    // 导入 postHref（紧跟 SITE_IDENTITY 导入之后，相对深度从 pages/archives/ 到 src/data/）
    const identityImport = /import \{ SITE_IDENTITY \} from '([^']+)'\r?\n/
    if (!identityImport.test(out)) fail('archives/_data.ts 缺少 SITE_IDENTITY 导入，无法定位插入点')
    out = out.replace(
      identityImport,
      (match) => `${match}import { postHref } from '../../data/post-permalink.ts'\n`,
    )
    return out
  }

  /** Hexo index_generator：默认 per_page 10（hexo-generator-index），源站可覆盖。 */
  const indexGeneratorBlock = siteCfg.data.index_generator ?? {}
  const indexPerPage =
    typeof indexGeneratorBlock.per_page === 'number' ? indexGeneratorBlock.per_page : 10

  /**
   * 首页 / 首页分页路由的 paginatePosts 默认 per_page 是基准站的
   * `index_generator.per_page: 6`（INDEX_PER_PAGE）；迁移站要按源站配置注入，
   * 否则分页数与源站不一致（22 篇 / 6 = 4 页 vs 源站 / 10 = 3 页）。
   */
  const rewriteIndexPerPage = (text, rel) => {
    let out = text
    const calls = ['paginatePosts(posts)', 'paginatePosts(preparePosts(entries))']
    for (const call of calls) {
      if (!out.includes(call)) continue
      out = out.split(call).join(`paginatePosts(${call.slice('paginatePosts('.length, -1)}, ${indexPerPage})`)
    }
    if (out === text) {
      warnings.push(`${rel} 没有找到 paginatePosts 调用，index_generator.per_page=${indexPerPage} 未注入，分页数可能与源站不一致。`)
    }
    return out
  }

  const ROUTES = [
    'src/pages/index.astro',
    'src/pages/page/[...page].astro',
    'src/pages/[...path].astro',
    'src/pages/404.astro',
    'src/pages/archives/_data.ts',
    'src/pages/archives/[...page].astro',
    'src/pages/archives/[year]/[...page].astro',
    'src/pages/archives/[year]/[month]/[...page].astro',
    'src/pages/categories/[...category].astro',
    'src/pages/tags/[tag]/[...page].astro',
  ]
  for (const rel of ROUTES) {
    let text = readFileSync(path.join(TEMPLATE, rel), 'utf8')
    const siteConst = /^const site = \{[\s\S]*?^\}/m
    if (siteConst.test(text)) {
      text = text.replace(siteConst, `import { site } from '${siteConfigSpecifier(rel)}'`)
    } else if (!/from\s+['"][^'"]*data\/site-identity(?:\.ts)?['"]/.test(text)) {
      // 现状：模板页面从 src/data/site-identity.ts 取身份（见上面生成的
      // 转发文件），不再内联 const site。两条路都没有才需要人工看。
      warnings.push(`${rel} 既没有内联的 site 常量，也没有 import data/site-identity.ts，站点身份可能仍是基准站，请人工检查。`)
    }
    if (rel === 'src/pages/archives/_data.ts') text = rewriteArchiveData(text, rel)
    if (rel === 'src/pages/index.astro' || rel === 'src/pages/page/[...page].astro') {
      text = rewriteIndexPerPage(text, rel)
    }
    writeOut(rel, text)
  }
  console.log(`  ✓ 路由 ${ROUTES.length} 个（含 404 / 归档三级 / 分类 / 标签）`)

  /* ---- 文章路由按源站 permalink 模式落位 ----
   * 源站 `_config.yml` 的 `permalink`（如 `posts/p:abbrlink/`）决定文章 URL；
   * 模板的文章路由写死了 `:year/:month/:day/:title/`（文件路径即路由），
   * 直接照搬会让迁移站的全部文章 URL 与源站不一致（书签/SEO 全断）。
   * 这里把模式编译成「目录段 + 动态参数段」：
   *   - 纯字面量段 → 字面量目录；
   *   - 含 token 的段（如 `p:abbrlink`）→ 动态参数目录 `[p0]`，参数值含字面前缀；
   *   - `:year/:month/:day/:title` 等沿用 preparePosts 的年月日语义（站点时区）。
   * 文章路由文件被搬到模式对应的位置，getStaticPaths 改为按模式算参数。
   */
  const permalinkPattern = String(
    (extras.permalink ?? ':year/:month/:day/:title/'),
  ).replace(/^\//, '').replace(/\/$/, '')
  const PERMALINK_TOKENS = [
    'year', 'month', 'i_month', 'day', 'i_day', 'hour', 'minute', 'second',
    'title', 'abbrlink', 'short_year',
  ]
  const patternSegments = permalinkPattern.split('/').filter(Boolean)
  const patternDynamic = patternSegments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => PERMALINK_TOKENS.some((token) => segment.includes(`:${token}`)))
  const patternUnsupported = [
    ...new Set(
      (permalinkPattern.match(/:[a-z_]+/g) ?? []).filter(
        (token) => !PERMALINK_TOKENS.includes(token.slice(1)),
      ),
    ),
  ]
  if (patternUnsupported.length > 0) {
    warnings.push(
      `permalink 模式包含暂不支持的 token（${patternUnsupported.join(' ')}）——文章路由会把这些段按字面量输出，URL 与源站不一致，需要人工处理。`,
    )
  }
  // 动态段的参数名：p0 / p1 …（Astro 参数名随意，值里含字面前缀）
  const postRouteRel = [
    'src/pages',
    ...patternSegments.map((segment, index) => {
      const dynamic = patternDynamic.find((item) => item.index === index)
      return dynamic ? `[p${patternDynamic.indexOf(dynamic)}]` : segment
    }),
    'index.astro',
  ].join('/')
  const postRouteSourceRel = 'src/pages/[year]/[month]/[day]/[slug].astro'
  {
    let text = readFileSync(path.join(TEMPLATE, postRouteSourceRel), 'utf8')
    const siteConst = /^const site = \{[\s\S]*?^\}/m
    if (siteConst.test(text)) {
      text = text.replace(siteConst, `import { site } from '${siteConfigSpecifier(postRouteRel)}'`)
    }
    // 1) 原导入 preparePosts 只为年月日；permalink 模块接管后不再需要
    text = text.replace(/^import \{ preparePosts \}.*\r?\n/m, '')
    // 2) getStaticPaths 重写：按模式算参数
    const gpsStart = text.indexOf('export const getStaticPaths')
    const gpsEnd = text.indexOf('type Props', gpsStart)
    if (gpsStart === -1 || gpsEnd === -1) {
      fail(`无法改写文章路由的 getStaticPaths（${postRouteRel}）；permalink 模式：${permalinkPattern}`)
    }
    const gpsReplacement = `export const getStaticPaths: GetStaticPaths = async () => {
  const entries = await getCollection('posts')
  return entries
    .filter((entry) => entry.data.layout !== 'page')
    .map((entry) => ({ params: postRouteParams(entry), props: { id: entry.id } }))
}

`
    text = text.slice(0, gpsStart) + gpsReplacement + text.slice(gpsEnd)
    // 3) 注入 permalink 模块导入（放在 SITE_IDENTITY 导入之后，路径深度按文件位置算）
    const permalinkSpecifier = `${relativeSpecifier(postRouteRel, OUT)}/data/post-permalink`
    text = text.replace(
      /(import \{ SITE_IDENTITY \}.*\r?\n)/,
      `$1import { postRouteParams } from '${permalinkSpecifier}'\n`,
    )
    // 4) 搬移目录后重算其余相对导入的深度（`@/` 说明符不以 ./ 或 ../ 开头，不受影响）
    text = text.replace(
      /(from\s*|import\s+)(['"])(\.\.?\/[^'"]+)\2/g,
      (match, prefix, quote, spec) => {
        const abs = posix(path.posix.normalize(path.posix.join(path.posix.dirname(postRouteSourceRel), spec)))
        const r = posix(path.relative(path.posix.dirname(postRouteRel), abs))
        const fixed = r.startsWith('.') ? r : `./${r}`
        return `${prefix}${quote}${fixed}${quote}`
      },
    )
    writeOut(postRouteRel, text)
    console.log(`  ✓ 文章路由按 permalink「${permalinkPattern}」落位：${postRouteRel}`)
  }

  /* ---- 生成 src/data/post-permalink.ts ---- */
  {
    const timezoneDefault = extras.timezone && String(extras.timezone).trim() ? String(extras.timezone).trim() : 'Asia/Shanghai'
    const segCases = patternDynamic
      .map(({ segment }, order) => {
        const renderTokens = PERMALINK_TOKENS.map((token) => {
          if (!segment.includes(`:${token}`)) return null
          // :title 与 :abbrlink 都回退 slug：hexo-abbrlink 会把 abbrlink 写进 frontmatter，
          // 没有该 frontmatter 的文章沿用文件名 slug（Hexo 的 :title 语义）。
          const accessor = {
            year: 'parts.year',
            month: 'String(parts.month).padStart(2, "0")',
            i_month: 'String(parts.month)',
            day: 'String(parts.day).padStart(2, "0")',
            i_day: 'String(parts.day)',
            hour: 'String(parts.hour).padStart(2, "0")',
            minute: 'String(parts.minute).padStart(2, "0")',
            second: 'String(parts.second).padStart(2, "0")',
            short_year: 'String(parts.year % 100)',
            title: 'slug',
            abbrlink: 'effectiveSlug',
          }[token]
          return `.replace(':${token}', ${accessor})`
        }).filter(Boolean).join('')
        return `  case ${order}:\n    return '${segment}'${renderTokens}`
      })
      .filter(Boolean)
      .join('\n')
    const permalinkTs = `/**
 * AUTO-GENERATED by scripts/migrate-hexo.mjs — 源站 permalink 模式的实现。
 *
 * 模式：'${permalinkPattern}'（来自源站 _config.yml 的 permalink）
 * 时区：'${timezoneDefault}'（源站 timezone 为空时按 +08:00 处理，与 content.config.ts 一致）
 *
 * 语义与 Hexo 一致：无时区字面量按站点时区的「墙上时间」解释；
 * :title / :abbrlink 缺省回退到文件名 slug（hexo-abbrlink 会把 abbrlink 写进 frontmatter）。
 */
import { createSiteDateFormatter } from '@/utils/date.ts'

const formatter = createSiteDateFormatter({ timezone: '${timezoneDefault}' })

/** 源站是否配置了 abbrlink（permalink 里出现 :abbrlink 即视为配置）。 */
const abbrlinkConfigured = ${permalinkPattern.includes(':abbrlink')}

/** 动态段在模式里的段序号（静态段不计）。 */
const patternDynamicOrder: number[] = [${patternDynamic.map((item) => item.index).join(', ')}]

/** 模式的段序列（静态段为字面量，动态段由 segmentValue 求值）。 */
const patternSegments: string[] = ${JSON.stringify(patternSegments)}

/** Hexo :title 语义：post slug（文件名或 slug frontmatter），不是完整标题。 */
function slugOf(entry: { id: string; data: Record<string, unknown> }): string {
  const explicit = entry.data.slug
  if (typeof explicit === 'string' && explicit) return explicit
  return entry.id
}

/** 单个动态段的值（含字面前缀，如 'p' + abbrlink）。 */
function segmentValue(entry: { id: string; data: Record<string, unknown> }, order: number): string {
  const slug = slugOf(entry)
  const abbr = entry.data.abbrlink
  const effectiveSlug =
    abbrlinkConfigured && abbr !== undefined && abbr !== null && abbr !== '' ? String(abbr) : slug
  const date = entry.data.date instanceof Date ? entry.data.date : new Date(0)
  const parts = formatter.parts(date)
  switch (order) {
${segCases}
    default:
      return slug
  }
}

/** 文章页 getStaticPaths 的参数（每个动态段一个参数，值含字面前缀）。 */
export function postRouteParams(entry: { id: string; data: Record<string, unknown> }): Record<string, string> {
  const params: Record<string, string> = {}
  patternDynamicOrder.forEach((_segmentIndex, index) => {
    params[\`p\${index}\`] = segmentValue(entry, index)
  })
  return params
}

/** 文章 URL 末段收尾（C2）：\`.html\`/\`.htm\` 平文件型不加尾斜杠，目录型加（与 scripts/migrate-hexo.mjs 的 applyPermalinkTrailingSlash 同一规则）。 */
function applyPermalinkTrailingSlash(rendered: string): string {
  return /\\.html?$/i.test(rendered) ? rendered : \`\${rendered}/\`
}

/** 文章完整 URL（无站点前缀，归档页/分类页链接用；与 postRouteParams 同一套规则）。 */
export function postHref(entry: { id: string; data: Record<string, unknown> }): string {
  const segments = patternSegments.map((segment, index) => {
    const order = patternDynamicOrder.indexOf(index)
    return order === -1 ? segment : segmentValue(entry, order)
  })
  return \`/\${applyPermalinkTrailingSlash(segments.join('/'))}\`
}
`
    writeOut('src/data/post-permalink.ts', permalinkTs)
    console.log(`  ✓ permalink 模块：src/data/post-permalink.ts（动态段 ${patternDynamic.length} 个）`)
  }

  /* ---- [7.x/8] Hexo 插件产物 ----
   * 上游主题靠插件在 hexo generate 阶段注入额外页面/脚本；Astro 没有插件机制，
   * 这里按插件源码逐份移植「产物生成」。四个产物全部由源站配置/数据驱动：
   *   A. envelope_comment  → <path>/index.html（信笺留言板，走主题 page 外壳）
   *   B. bangumi          → <path>/index.html（想看/在看/已看 三 tab）
   *   C. hexo_safego      → <security.html_file_name>（base64 参数 + 倒计时跳转页）
   *   D. random generator → <random.path>（随机文章 + 页脚随机友链）
   * 配置缺失/enable=false/数据文件不存在 → 打印跳过日志，不产出文件。
   */
  console.log('\n[7.x/8] Hexo 插件产物（envelope 留言板 / bangumi 追番 / safego go.html / random.js）')
  const rootConfig = typeof siteCfg.data.root === 'string' && siteCfg.data.root ? siteCfg.data.root : '/'
  const safegoCfg = normalizeSafeGoConfig(siteCfg.data.hexo_safego)
  const safegoEnabled = Boolean(safegoCfg.general.enable)
  const pluginArtifacts = { envelope: null, bangumi: null, safego: null, random: null }

  /** 插件产物页的公共 import 说明符（packages / site.config / 全局样式入口）。 */
  const pluginPageDeps = (pageRel) => ({
    siteConfig: siteConfigSpecifier(pageRel),
    styles: relativeSpecifier(pageRel, path.join(OUT, 'src', 'styles', 'upstream', 'index.styl')),
  })

  /* A. envelope_comment → 信笺留言板 */
  {
    const envelopeCfg = siteCfg.data.envelope_comment
    const enabled =
      envelopeCfg && typeof envelopeCfg === 'object' && (envelopeCfg.enable === true || envelopeCfg.enable === 'true')
    if (!enabled) {
      console.log('  · 无 envelope_comment 配置（enable=false），跳过留言板页')
    } else {
      const frontMatter =
        envelopeCfg.front_matter && typeof envelopeCfg.front_matter === 'object' ? envelopeCfg.front_matter : {}
      const pagePath = String(envelopeCfg.path || 'comments').replace(/^\/+|\/+$/g, '')
      const pageRel = `src/pages/${pagePath}/index.astro`
      const title = typeof frontMatter.title === 'string' ? frontMatter.title : ''
      const topImg =
        frontMatter.top_img === false
          ? false
          : typeof frontMatter.top_img === 'string'
            ? frontMatter.top_img
            : undefined
      const pageTypeValue = typeof frontMatter.type === 'string' && frontMatter.type ? frontMatter.type : 'envelope'
      const showComments = frontMatter.comments !== false
      const content = renderEnvelopePageHtml(envelopeCfg, siteForRender, rootConfig)
      writeOut(
        pageRel,
        renderPluginPageAstro({
          ...pluginPageDeps(pageRel),
          title,
          topImg,
          pageTypeValue,
          content,
          showComments,
          note: '来源：hexo-butterfly-envelope（hexo.config.envelope_comment）。正文按插件 lib/html.pug 静态渲染；',
        }),
      )
      pluginArtifacts.envelope = {
        url: `/${pagePath}/`,
        routeFile: pageRel,
        title,
        pageType: pageTypeValue,
        comments: showComments,
        messageCount: Array.isArray(envelopeCfg.message) && envelopeCfg.message.length ? envelopeCfg.message.length : 4,
        contentBytes: Buffer.byteLength(content),
      }
      console.log(`    · /${pagePath}/：title「${title || '（空）'}」，信笺正文 ${pluginArtifacts.envelope.messageCount} 行`)
    }
  }

  /* B. bangumi → 追番页 */
  {
    const bangumiCfg = siteCfg.data.bangumi
    const enabled = bangumiCfg && typeof bangumiCfg === 'object' && (bangumiCfg.enable === true || bangumiCfg.enable === 'true')
    const bangumiDataFile = path.join(SITE, 'source', '_data', 'bangumis.json')
    if (!enabled) {
      console.log('  · 无 bangumi 配置（enable=false），跳过追番页')
    } else if (!existsSync(bangumiDataFile)) {
      console.log("  · 缺少 source/_data/bangumis.json（先用 `hexo bangumi -u` 抓数据），跳过追番页")
    } else {
      const readJson = (file, label) => {
        try {
          return JSON.parse(readFileSync(file, 'utf8'))
        } catch (error) {
          fail(`解析 ${label} 失败：${posix(path.relative(SITE, file))}\n${error.message}`)
          return null
        }
      }
      const bangumiData = readJson(bangumiDataFile, 'bangumis.json')
      const extraFile = path.join(SITE, 'source', '_data', 'extra_bangumis.json')
      if (existsSync(extraFile)) {
        // 上游 extra_bangumis.json：按 extraOrder 决定插在前面还是后面
        const extra = readJson(extraFile, 'extra_bangumis.json')
        const mergeExtra = (base, added) => {
          if (!Array.isArray(added)) return base
          return bangumiCfg.extraOrder === 1 ? [...added, ...base] : [...base, ...added]
        }
        bangumiData.wantWatch = mergeExtra(bangumiData.wantWatch ?? [], extra.wantWatchExtra)
        bangumiData.watching = mergeExtra(bangumiData.watching ?? [], extra.watchingExtra)
        bangumiData.watched = mergeExtra(bangumiData.watched ?? [], extra.watchedExtra)
        console.log('    · 合并 extra_bangumis.json（extraOrder=' + String(bangumiCfg.extraOrder ?? '') + '）')
      }
      const rawPath = String(bangumiCfg.path || 'bangumis/index.html')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
      let pagePath = rawPath || 'bangumis'
      if (pagePath.endsWith('/index.html')) pagePath = pagePath.slice(0, -'/index.html'.length)
      else if (pagePath.endsWith('index.html')) pagePath = pagePath.slice(0, -'index.html'.length).replace(/\/+$/, '')
      else if (/\.html$/i.test(pagePath)) {
        pagePath = pagePath.replace(/\.html$/i, '')
        warnings.push(
          `bangumi.path「${rawPath}」是平文件形态，迁移侧按目录路由 /${pagePath}/ 输出（Hexo 的 flat .html 产物不适用 Astro 的目录路由；如需保持 URL 请改 bangumi.path）。`,
        )
      }
      const pageRel = `src/pages/${pagePath}/index.astro`
      const extraOptions =
        bangumiCfg.extra_options && typeof bangumiCfg.extra_options === 'object' ? bangumiCfg.extra_options : {}
      const title = typeof bangumiCfg.title === 'string' ? bangumiCfg.title : ''
      const topImg =
        extraOptions.top_img === false ? false : typeof extraOptions.top_img === 'string' ? extraOptions.top_img : undefined
      const showComments = extraOptions.comments !== false
      const content = renderBangumiPageHtml({
        config: bangumiCfg,
        siteConfig: siteForRender,
        data: bangumiData,
        safego: safegoCfg,
        root: rootConfig,
      })
      writeOut(
        pageRel,
        renderPluginPageAstro({
          ...pluginPageDeps(pageRel),
          title,
          topImg,
          pageTypeValue: 'page',
          content,
          showComments,
          note: '来源：hexo-bilibili-bangumi（hexo.config.bangumi + source/_data/bangumis.json）。正文按插件 bangumi/bili-template/pagination 模板静态渲染；',
        }),
      )
      const counts = {
        wantWatch: Array.isArray(bangumiData.wantWatch) ? bangumiData.wantWatch.length : 0,
        watching: Array.isArray(bangumiData.watching) ? bangumiData.watching.length : 0,
        watched: Array.isArray(bangumiData.watched) ? bangumiData.watched.length : 0,
      }
      pluginArtifacts.bangumi = {
        url: `/${pagePath}/`,
        routeFile: pageRel,
        title,
        pageType: 'page',
        comments: showComments,
        counts,
        items: counts.wantWatch + counts.watching + counts.watched,
        sourceData: 'source/_data/bangumis.json',
        contentBytes: Buffer.byteLength(content),
      }
      console.log(
        `    · /${pagePath}/：${counts.wantWatch} 想看 / ${counts.watching} 在看 / ${counts.watched} 已看（共 ${pluginArtifacts.bangumi.items} 条卡片）`,
      )
    }
  }

  /* C. hexo_safego → 安全跳转页 */
  if (!safegoEnabled) {
    console.log('  · 无 hexo_safego 配置（general.enable=false），跳过 go.html')
  } else {
    const fileName = String(safegoCfg.security.html_file_name || 'go.html').replace(/^\/+/, '')
    const pageRel = `public/${fileName}`
    const content = renderSafeGoPageHtml(safegoCfg)
    writeOut(pageRel, content)
    pluginArtifacts.safego = {
      url: `/${fileName}`,
      routeFile: pageRel,
      urlParamName: safegoCfg.security.url_param_name,
      base64: safegoCfg.general.enable_base64_encode !== false,
      targetBlank: safegoCfg.general.enable_target_blank !== false,
      countdown: safegoCfg.appearance.countdowntime || 5,
      darkmode: safegoCfg.appearance.darkmode,
      title: safegoCfg.appearance.title,
      contentBytes: Buffer.byteLength(content),
    }
    console.log(
      `    · /${fileName}：参数名 ${safegoCfg.security.url_param_name}，base64=${safegoCfg.general.enable_base64_encode !== false}，倒计时 ${safegoCfg.appearance.countdowntime || 5}s`,
    )
  }

  /* D. random.js（上游 scripts/helpers/random.js 的 generator） */
  {
    const randomCfgBlock = siteCfg.data.random && typeof siteCfg.data.random === 'object' ? siteCfg.data.random : {}
    const randomPath = String(randomCfgBlock.path || 'anzhiyu/random.js').replace(/^\/+/, '')
    const resolvePostPath = createPostPathResolver(permalinkPattern)
    const includedPosts = postRecords.filter((record) => !record.randomExcluded)
    if (includedPosts.length === 0) {
      console.log('  · 没有任何文章（或全部 random:false），跳过 random.js')
    } else {
      // 任务口径：date 倒序（同日期保持源站目录顺序）
      const timestampOf = (record) => {
        const parts = parsePostDateParts(record.date)
        // 日期不可解析：作为排序键垫底（不再伪造 1970）；parsePostDateParts 已告警。
        if (!parts) return 0
        return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
      }
      const posts = [...includedPosts]
        .sort((left, right) => timestampOf(right) - timestampOf(left))
        .map((record) => resolvePostPath(record))
      // 友链数据：footer.list.enable && randomFriends > 0 时才带上随机友链块
      const linkFile = path.join(SITE, 'source', '_data', 'link.yml')
      let linkGroups = []
      if (existsSync(linkFile)) {
        try {
          const parsed = parseYaml(readFileSync(linkFile, 'utf8'))
          if (Array.isArray(parsed)) linkGroups = parsed
          else warnings.push('source/_data/link.yml 顶层不是数组，random.js 的友链随机块已跳过。')
        } catch (error) {
          warnings.push(`source/_data/link.yml 解析失败，random.js 友链随机块已跳过：${error.message}`)
        }
      }
      const footerCfg = themeCfg.data.footer && typeof themeCfg.data.footer === 'object' ? themeCfg.data.footer : {}
      const footerList = footerCfg.list && typeof footerCfg.list === 'object' ? footerCfg.list : {}
      const footerListEnabled = footerList.enable === true || footerList.enable === 'true'
      const randomFriends = Number(footerList.randomFriends) || 0
      const pjaxEnabled = Boolean(themeCfg.data.pjax && themeCfg.data.pjax.enable)
      const content = renderRandomJs({ posts, links: linkGroups, pjaxEnabled, footerListEnabled, randomFriends })
      const pageRel = `public/${randomPath}`
      writeOut(pageRel, content)
      pluginArtifacts.random = {
        url: `/${randomPath}`,
        routeFile: pageRel,
        posts: posts.length,
        excludedByRandomFalse: postRecords.length - includedPosts.length,
        pjaxEnabled,
        footerListEnabled,
        randomFriends,
        friendLinks: linkGroups.reduce(
          (total, group) => total + (Array.isArray(group?.link_list) ? group.link_list.length : 0),
          0,
        ),
        contentBytes: Buffer.byteLength(content),
      }
      console.log(
        `    · /${randomPath}：${posts.length} 篇文章（random:false 排除 ${postRecords.length - includedPosts.length}），友链块 ${footerListEnabled && randomFriends > 0 ? `开（${pluginArtifacts.random.friendLinks} 条 / 每轮 ${randomFriends} 个）` : '关'}，pjax=${pjaxEnabled}`,
      )
    }
  }

  /* ---- [7.y/8] 站点级生成物（search / feed / sitemap / 百度） ----
   * 6 个产物都需要构建期数据（渲染后的正文 HTML / 文章 URL / taxonomy），Astro 静态构建下
   * 没有「渲染后文件」钩子可用，只能做成 endpoint：迁移脚本写「配置快照 + 实现模块 + 路由壳」。
   * 所有路径/身份都从源站 _config.yml 读取，不硬编码源站。
   */
  console.log('\n[7.y/8] 站点级生成物（search.xml / atom.xml / rss2.xml / sitemap.xml / baidusitemap.xml / baidu_urls.txt）')
  const searchGenerator = normalizeSearchGeneratorConfig(siteCfg.data)
  const feedGenerator = normalizeFeedGeneratorConfig(siteCfg.data)
  const sitemapGenerator = normalizeSitemapGeneratorConfig(siteCfg.data)
  const baiduSitemapGenerator = normalizeBaiduSitemapGeneratorConfig(siteCfg.data)
  const baiduUrlSubmitGenerator = normalizeBaiduUrlSubmitGeneratorConfig(siteCfg.data)

  const generatorsConfig = {
    search:
      searchGenerator && searchGenerator.supported
        ? {
            path: searchGenerator.path,
            field: searchGenerator.field,
            content: searchGenerator.content,
          }
        : null,
    feed: feedGenerator,
    sitemap: sitemapGenerator,
    baidusitemap: baiduSitemapGenerator,
    baiduUrlSubmit: baiduUrlSubmitGenerator,
  }
  const generatorArtifacts = {
    search: null,
    feed: null,
    sitemap: null,
    baidusitemap: null,
    baiduUrlSubmit: null,
  }
  const generatorEndpoints = []
  const plannedGeneratorOutputs = []
  const planGeneratorOutput = (owner, outputPath) => {
    const rel = String(outputPath || '').replace(/^\/+/, '')
    const duplicate = plannedGeneratorOutputs.find((item) => item.path === rel)
    if (duplicate) {
      fail(
        `站点级生成物路径重复：/${rel}（${duplicate.owner} 与 ${owner}）——请检查源站 ` +
          '_config.yml 的 search.path / feed.path / sitemap.path / baidusitemap.path / baidu_url_submit.path',
      )
    }
    plannedGeneratorOutputs.push({ owner, path: rel })
    return rel
  }
  const writeGeneratorEndpoint = (outputPath, importName, call) => {
    const rel = `src/pages/${outputPath}.ts`
    writeOut(
      rel,
      renderGeneratorEndpoint({
        specifier: relativeSpecifier(rel, path.join(OUT, 'src', 'data', 'site-feeds.ts')),
        importName,
        call,
      }),
    )
    generatorEndpoints.push({ output: outputPath, routeFile: rel })
    return rel
  }

  const hasGeneratorConfig = Object.values(generatorsConfig).some(Boolean)
  if (!hasGeneratorConfig) {
    console.log('  · 源站未配置 search / feed / sitemap / baidusitemap / baidu_url_submit，跳过')
  } else {
    const feedsRel = 'src/data/site-feeds.ts'
    const pageUpdatedByPermalink = {}
    for (const record of pageRecords) {
      if (record.updated) pageUpdatedByPermalink[record.permalink] = record.updated
    }
    writeOut(
      feedsRel,
      renderSiteFeedsModule({
        siteConfigSpecifier: siteConfigSpecifier(feedsRel),
        permalinkSpecifier: relativeSpecifier(feedsRel, path.join(OUT, 'src', 'data', 'post-permalink.ts')),
        taxonomySpecifier: relativeSpecifier(feedsRel, path.join(OUT, 'src', 'pages', 'archives', '_data.ts')),
        generators: generatorsConfig,
        staticPages: staticPageInputs,
        pageUpdatedByPermalink,
      }),
    )

    /* search.xml */
    if (searchGenerator) {
      if (!searchGenerator.supported) {
        console.log(`  · search.path「${searchGenerator.path}」：hexo-generator-search 的 .json 分支未支持，跳过`)
        unsupported.push({
          category: 'hexo-generator',
          item: `search.path = ${searchGenerator.path}`,
          location: '_config.yml',
          reason:
            'hexo-generator-search 的 .json 分支（json_generator.js）是另一套 JSON 结构，本轮只实现 .xml 分支。',
          action: '把 search.path 改回 search.xml（本站默认），或按 json_generator.js 的输出结构自行接搜索组件。',
        })
      } else {
        const rel = planGeneratorOutput('search', searchGenerator.path)
        writeGeneratorEndpoint(rel, 'renderSearchIndex', 'renderSearchIndex')
        generatorArtifacts.search = {
          path: `/${rel}`,
          routeFile: `src/pages/${rel}.ts`,
          field: searchGenerator.field,
          content: searchGenerator.content,
          sourceConfig: 'search.path / search.field / search.content',
        }
        console.log(
          `    · /${rel}：field=${searchGenerator.field}，content=${searchGenerator.content ? 'CDATA 全文' : '关闭'}`,
        )
        if (searchGenerator.field !== 'post') {
          warnings.push(
            `search.field=${searchGenerator.field}：本轮 search.xml 只生成文章条目（post 分支）；` +
              'page/自定义 field 需要额外实现，见 docs/guides/MIGRATION.md「搜索」章节。',
          )
        }
      }
    }

    /* atom.xml / rss2.xml */
    if (feedGenerator) {
      const outputs = []
      for (const output of feedGenerator.outputs) {
        const rel = planGeneratorOutput(`feed.${output.type}`, output.path)
        writeGeneratorEndpoint(rel, 'renderFeed', `() => renderFeed('${output.type}', '${output.path}')`)
        outputs.push({ type: output.type, path: `/${rel}`, routeFile: `src/pages/${rel}.ts` })
      }
      generatorArtifacts.feed = {
        outputs,
        limit: feedGenerator.limit,
        content: feedGenerator.content,
        orderBy: feedGenerator.orderBy,
        icon: feedGenerator.icon,
        prettyAtomFile: feedGenerator.prettyAtomFile,
        prettyRss2File: feedGenerator.prettyRss2File,
        hub: feedGenerator.hub,
        sourceConfig: 'feed.type / feed.path / feed.limit / feed.content',
      }
      console.log(
        `    · ${outputs.map((item) => item.path).join(' / ')}：limit=${feedGenerator.limit ?? '不限制'}，` +
          `content=${feedGenerator.content ? 'CDATA 全文' : '关闭'}，order_by=${feedGenerator.orderBy}`,
      )
    }

    /* sitemap.xml / sitemap.txt */
    if (sitemapGenerator) {
      const outputs = []
      for (const output of sitemapGenerator.outputs) {
        const rel = planGeneratorOutput('sitemap', output.path)
        writeGeneratorEndpoint(rel, 'renderSitemap', `() => renderSitemap('${output.kind}', '${output.path}')`)
        outputs.push({ path: `/${rel}`, kind: output.kind, routeFile: `src/pages/${rel}.ts` })
      }
      generatorArtifacts.sitemap = {
        outputs,
        tags: sitemapGenerator.tags,
        categories: sitemapGenerator.categories,
        sourceConfig: 'sitemap.path（tags/categories 默认 true）',
      }
      console.log(
        `    · ${outputs.map((item) => item.path).join(' / ')}：posts + pages + 静态页面，` +
          `tags=${sitemapGenerator.tags}，categories=${sitemapGenerator.categories}`,
      )
    }

    /* baidusitemap.xml */
    if (baiduSitemapGenerator) {
      const rel = planGeneratorOutput('baidusitemap', baiduSitemapGenerator.path)
      writeGeneratorEndpoint(rel, 'renderBaiduSitemap', 'renderBaiduSitemap')
      generatorArtifacts.baidusitemap = {
        path: `/${rel}`,
        routeFile: `src/pages/${rel}.ts`,
        urlOverride: baiduSitemapGenerator.url,
        sourceConfig: 'baidusitemap.path',
      }
      console.log(`    · /${rel}：全部文章（baidusitemap:false 除外，与插件实际产物对齐）`)
    }

    /* baidu_urls.txt */
    if (baiduUrlSubmitGenerator) {
      const rel = planGeneratorOutput('baiduUrlSubmit', baiduUrlSubmitGenerator.path)
      writeGeneratorEndpoint(rel, 'renderBaiduUrls', 'renderBaiduUrls')
      generatorArtifacts.baiduUrlSubmit = {
        path: `/${rel}`,
        routeFile: `src/pages/${rel}.ts`,
        count: baiduUrlSubmitGenerator.count,
        // host/token 是提交凭据：本产物只生成 URL 清单，不读也不写凭据。
        secretsOmitted: ['host', 'token'],
        sourceConfig: 'baidu_url_submit.path / baidu_url_submit.count',
      }
      console.log(
        `    · /${rel}：${baiduUrlSubmitGenerator.count == null ? '全部文章' : `最新 ${baiduUrlSubmitGenerator.count} 篇`}（不提交，只生成清单）`,
      )
    }

    console.log(`  ✓ 站点级生成物 ${generatorEndpoints.length} 个，路由壳 ${generatorEndpoints.length} 个（构建期执行）`)
  }

  /* ---- 插件产物已生成，但插件「渲染期行为」里的全站后处理仍无法等价迁移 ---- */
  if (safegoEnabled) {
    unsupported.push({
      category: 'hexo-plugin-page',
      item: 'hexo_safego 全站外链改写（after_render:html）',
      location: '_config.yml',
      reason:
        'go.html 与插件产物（bangumi 卡片标题）里的外链已按插件规则改写成 /go.html?u=base64；但 hexo-safego 还会在渲染后对**整站 HTML** 的外部链接统一改写，Astro 侧没有「渲染后 HTML 后处理」管线，正文里的外链仍是原始地址。',
      action:
        '若需要全站外链都经过 /go.html：在 BaseLayout/内容渲染层加一个 rehype 插件做同样的 href 重写（逻辑见本脚本 safeGoRewrite），或部署层用 CDN/边缘函数改写。',
    })
  }

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
  // 其中 bangumi / envelope_comment / hexo_safego 的**页面产物**已由本脚本的 [7.x]
  // 阶段按插件语义生成（见 report.plugins / docs/notes/phases/P7-4-fix-plugin-pages.md），
  // 不再列入「无等价物」清单；它们残留的渲染期行为单独归类为 hexo-plugin-page。
  // search / feed / sitemap / baidusitemap / baidu_url_submit 已由 [7.y] 阶段按插件语义生成
  // 等价产物（见 report.generators / docs/guides/MIGRATION.md §7.2），不再列为「无等价物」；
  // 这里的清单只剩真正需要人工接的 Hexo 插件。
  const HEXO_PLUGINS = [
    'abbrlink',
    'aisummary', 'all_minifier',
    'aplayer', 'nofollow', 'auto_spacing', 'highlight', 'prismjs', 'deploy',
  ]
  const presentPlugins = HEXO_PLUGINS.filter((key) => key in siteCfg.data)
  if (presentPlugins.length) {
    unsupported.push({
      category: 'hexo-plugin',
      item: presentPlugins.join(', '),
      location: '_config.yml',
      reason: '这些是 Hexo 生成器/渲染器插件配置，Astro 没有等价插件机制；abbrlink、AI 摘要、压缩、图床等需换实现。',
      action: 'abbrlink 已作为 frontmatter 字段被文章路由读取（无需插件）；其余按 MIGRATION.md「部署 / 验证」章节改用 CI 脚本或主题层插件。',
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
    /** [7.x] Hexo 插件产物：envelope / bangumi / safego / random.js（null = 源站未启用）。 */
    plugins: pluginArtifacts,
    pluginArtifactCount: Object.values(pluginArtifacts).filter(Boolean).length,
    /** [7.y] 站点级生成物（构建期 endpoint）：search / feed / sitemap / 百度（null = 源站未配置）。 */
    generators: generatorArtifacts,
    generatorEndpoints,
    generatorArtifactCount: generatorEndpoints.length,
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
  console.log(
    `  插件产物        : ${Object.values(pluginArtifacts).filter(Boolean).length}/4（${Object.entries(pluginArtifacts)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
      .join(', ') || '源站未启用任何插件页'}）`,
  )
  console.log(
    `  站点级生成物    : ${generatorEndpoints.length}（${generatorEndpoints.map((item) => `/${item.output}`).join(', ') || '源站未配置'}）`,
  )
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
    console.log('  详见 docs/guides/MIGRATION.md（评论/搜索/统计、CDN、部署、回滚、验证清单）。')
  }
}

main()
