#!/usr/bin/env node
/**
 * deploy-demo-pages.mjs — 把验证站以子路径部署到 GitHub Pages 用户站。
 *
 * 部署形态：mcxiaochenn.github.io 仓库（branch 部署，Pages source = main /root）
 * 的 `blog/` 子目录。用户站根目录的其它内容（个人主页、musicunlock 等）不受影响；
 * `_astro/` 等下划线目录会被 Jekyll 忽略，所以仓库根必须有一个 `.nojekyll`。
 *
 * 流程：
 *   1. 注入 DEPLOY_SITE_URL / DEPLOY_SITE_ROOT 触发 demo 构建（与验收构建同一套
 *      代码，只覆盖 site.url / site.root / Astro `base`；默认验收构建完全不受影响）；
 *   2. 产物 HTML 后处理：把没带子路径前缀的站内绝对路径（Sidebar / MenuItems 等
 *      组件硬编码的 /archives/ /tags/ /categories/ 链接）统一补前缀。JS 里的运行时
 *      路径不做改写（音乐球 / 搜索等次要功能在子路径部署下降级，属已知边界）；
 *   3. clone 用户 Pages 仓库（浅克隆）→ 覆盖 `blog/` → 补 `.nojekyll` → commit → push；
 *   4. push 后 GitHub Pages 自动构建，约 1–2 分钟生效。
 *
 * 用法：
 *   node scripts/deploy-demo-pages.mjs
 * 环境变量（可选）：
 *   DEMO_PAGES_REPO   默认 mcxiaochenn/mcxiaochenn.github.io
 *   DEMO_PAGES_PATH   默认 blog（子路径，不含斜杠）；传 '' 或 '-' 表示根路径部署
 *   DEMO_PAGES_URL    默认 https://mcxiaochenn.github.io
 *   DEMO_PAGES_BRANCH 默认 main
 *   DEMO_PAGES_CNAME  自定义域名（写入仓库 CNAME 文件）；缺省从 DEMO_PAGES_URL
 *                     主机名推导，*.github.io 不写
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

const here = fileURLToPath(import.meta.url)
const repoRoot = resolve(here, '..', '..')
const distDir = join(repoRoot, 'examples', 'blog', 'dist')

const PAGES_REPO = process.env.DEMO_PAGES_REPO || 'mcxiaochenn/mcxiaochenn.github.io'
// 显式传 ''（或 '-'）表示根路径部署（自定义域名形态）；缺省仍是子路径 'blog'。
const rawPagesPath = process.env.DEMO_PAGES_PATH
const PAGES_PATH = (rawPagesPath === undefined ? 'blog' : rawPagesPath === '-' ? '' : rawPagesPath).replace(
  /^\/+|\/+$/g,
  '',
)
const PAGES_URL = (process.env.DEMO_PAGES_URL || 'https://mcxiaochenn.github.io').replace(/\/+$/, '')
const PAGES_BRANCH = process.env.DEMO_PAGES_BRANCH || 'main'
// 自定义域名（CNAME 文件）：显式 DEMO_PAGES_CNAME 优先；否则从 URL 主机名推导，
// *.github.io 不写 CNAME。
const PAGES_CNAME =
  process.env.DEMO_PAGES_CNAME ??
  (new URL(PAGES_URL).hostname.endsWith('.github.io') ? '' : new URL(PAGES_URL).hostname)

/** 带输出地执行 shell 命令；失败即退出。 */
function run(command, options = {}) {
  console.log(`  $ ${command}`)
  execSync(command, { stdio: 'inherit', cwd: repoRoot, ...options })
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

if (!existsSync(distDir)) fail('examples/blog/dist 不存在——先构建一次？')

/* ------------------------------------------------------------------ */
/* 1. demo 构建                                                        */
/* ------------------------------------------------------------------ */

console.log('[1/4] demo 构建（site.url=%s, root=/%s, Astro base=/%s）', PAGES_URL, PAGES_PATH, PAGES_PATH)
// 注意：这里用 spawnSync 的 env 注入，值以 node 直接传给子进程，不经过
// Git Bash 的 MSYS 路径转换（命令行前缀 `/blog` 会被转换成 Windows 路径）。
// 根路径部署时 DEPLOY_SITE_ROOT 传 '/'（site-identity 归一化后即 root=/）。
const build = spawnSync('pnpm', ['--filter', 'blog', 'build'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    DEPLOY_SITE_URL: PAGES_URL,
    DEPLOY_SITE_ROOT: PAGES_PATH || '/',
    CODEBUDDY_SAFE_DELETE_ENABLED: '0',
  },
  stdio: 'inherit',
  shell: true,
})
if (build.status !== 0) fail(`demo 构建失败（exit ${build.status}）`)

/* ------------------------------------------------------------------ */
/* 2. HTML 后处理：站内绝对路径补子路径前缀                              */
/* ------------------------------------------------------------------ */

const prefix = PAGES_PATH ? `/${PAGES_PATH}` : ''
const shouldPrefix = (url) =>
  url.startsWith('/') && url !== prefix && !url.startsWith(`${prefix}/`) && !url.startsWith('//')

const htmlFiles = collectHtmlFiles(distDir)
let rewritten = 0
if (!prefix) {
  console.log('[2/4] HTML 后处理：根路径部署，跳过前缀改写（%d 个页面）', htmlFiles.length)
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
  console.log('[2/4] HTML 后处理：%d 个页面，%d 处 href/src 补了 %s 前缀', htmlFiles.length, rewritten, prefix)
}

/* ------------------------------------------------------------------ */
/* 3. 同步到用户 Pages 仓库的子目录                                     */
/* ------------------------------------------------------------------ */

const tmpRepo = join(repoRoot, '.tmp-pages-deploy')
const headSha = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim()

rmSync(tmpRepo, { recursive: true, force: true })
console.log('[3/4] clone %s（浅克隆）', PAGES_REPO)
run(`git clone --depth 1 --branch ${PAGES_BRANCH} https://github.com/${PAGES_REPO}.git ${tmpRepo}`)

const targetDir = PAGES_PATH ? join(tmpRepo, PAGES_PATH) : tmpRepo
if (PAGES_PATH) {
  rmSync(targetDir, { recursive: true, force: true })
} else {
  // 根路径部署（自定义域名）：清空仓库内容但保留 .git
  for (const name of readdirSync(tmpRepo)) {
    if (name === '.git') continue
    rmSync(join(tmpRepo, name), { recursive: true, force: true })
  }
}
mkdirSync(targetDir, { recursive: true })
cpSync(distDir, targetDir, { recursive: true })

// Jekyll 会忽略下划线开头的目录（Astro 的 _astro/），必须禁用。
const nojekyll = join(tmpRepo, '.nojekyll')
if (!existsSync(nojekyll)) writeFileSync(nojekyll, '')

// 自定义域名：CNAME 文件（GitHub Pages 读它绑定域名）
if (PAGES_CNAME) writeFileSync(join(tmpRepo, 'CNAME'), `${PAGES_CNAME}\n`)

run('git add -A', { cwd: tmpRepo })

let committed
try {
  run(`git commit -m "deploy(${PAGES_PATH}): astro-theme-anzhiyu demo @ ${headSha}"`, { cwd: tmpRepo })
  committed = true
} catch {
  committed = false
}

if (!committed) {
  console.log('[deploy-demo] 没有需要提交的变化（demo 产物与远端一致）')
} else {
  console.log('[4/4] push 到 %s@%s', PAGES_BRANCH, PAGES_REPO)
  run(`git push origin ${PAGES_BRANCH}`, { cwd: tmpRepo })
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
