#!/usr/bin/env node
/**
 * P1.5 垂直切片 · Playwright 真浏览器验证（CI / 常规环境跑这一份）
 *
 * 验证 5 项架构假设（PLAN §Phase 1.5）：
 *   #3 全局元素 #web_bg：ClientRouter 整 body 替换后是否还是同一个 DOM 节点、computed style 是否仍在
 *   #4 script[data-pjax] 等价：每次导航是否恰好执行一次、旧页脚本是否不重复执行
 *   #5 上游 class 命中：.note / .recent-post-item / #web_bg 的 computed style 是否来自上游 Stylus
 *   #6 pug 风格 HTML：void 标签不闭合能否编译 / 解析
 *   #8 音乐播放器：transition:persist 的播放器/audio 导航后是否存活、播放是否不中断
 *
 * 额外验证：导航时 document 请求数=0、pjax shim（window.pjax.loadUrl → navigate）、
 * console error / pageerror / 重复监听累加计数。
 *
 * ⚠️ 本机（DSH Windows 沙箱）实测限制：
 *   - Node 用 piped stdio spawn 子进程会 EPERM（沙箱禁止管道）
 *   - Chromium 启动后创建 mojo 命名管道被拒（FATAL platform_channel.cc），任何页面 target
 *     都无法 attach，Playwright 无法在此沙箱里启动 Chromium
 *   本脚本因此做了一层降级：piped spawn 失败→ignore；无法 launch→手动起浏览器 + connectOverCDP。
 *   本机实测这条降级链仍失败（浏览器进程自身被沙箱打断），真实浏览器验证改由
 *   tests/artifacts + public/slice-harness.js 的页内 harness 在 wincu 浏览器通道完成，
 *   证据见 docs/notes/P1.5-vertical-slice.md。CI / 正常桌面环境应能直接跑本脚本。
 *
 * 用法：
 *   pnpm --filter blog build
 *   node examples/blog/tests/vertical-slice.mjs
 * 可选环境变量：PORT（preview 端口，默认 4399）、CDP_ENDPOINT（复用已启动浏览器）、
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE（手动指定浏览器可执行文件）、HEADED=1。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BLOG_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(BLOG_ROOT, '..', '..')
const ARTIFACTS = path.join(__dirname, 'artifacts')
const DIST = path.join(BLOG_ROOT, 'dist')
const PORT = Number(process.env.PORT || 4399)
const BASE = `http://127.0.0.1:${PORT}`
const VIEWPORT = { width: 1280, height: 720 }
const CDP_PORT = Number(process.env.CDP_PORT || 9333)

// 本机沙箱不允许写 %LOCALAPPDATA%\ms-playwright，浏览器装在仓库 node_modules/.cache 下。
const LOCAL_BROWSERS_PATH = path.join(REPO_ROOT, 'node_modules', '.cache', 'playwright-browsers')
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(LOCAL_BROWSERS_PATH)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = LOCAL_BROWSERS_PATH
}
const { chromium } = await import('playwright')

const WEB_BG_STYLE_PROPS = [
  'position', 'zIndex', 'width', 'height', 'top', 'left', 'transform',
  'backgroundColor', 'backgroundAttachment', 'backgroundPosition', 'backgroundSize', 'backgroundRepeat',
]

const results = []
const info = []
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? null })
  const shown = detail === undefined ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}${shown}`)
}
function note(name, detail) {
  info.push({ name, detail })
  console.log(`[INFO] ${name}${detail === undefined ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
}
const log = (...args) => console.log('[slice]', ...args)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 沙箱里 piped stdio spawn 会同步抛 EPERM，退化成 inherit/ignore 保证服务还能起。 */
function spawnSafe(command, args, options) {
  try {
    return spawn(command, args, options)
  } catch (error) {
    if (error.code !== 'EPERM') throw error
    log('piped stdio spawn 被拒（EPERM），退化为 stdio:ignore 重试')
    return spawn(command, args, { ...options, stdio: 'ignore' })
  }
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      /* 服务还没起来 */
    }
    await sleep(200)
  }
  return false
}

function startPreview() {
  const astroBin = path.join(REPO_ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs')
  if (!existsSync(astroBin)) throw new Error(`找不到 astro CLI: ${astroBin}`)
  const child = spawnSafe(
    process.execPath,
    [astroBin, 'preview', '--host', '127.0.0.1', '--port', String(PORT)],
    { cwd: BLOG_ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
  )
  const output = []
  child.stdout?.on('data', (d) => output.push(String(d)))
  child.stderr?.on('data', (d) => output.push(String(d)))
  return { child, output }
}

function findManualChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  try {
    const bundled = chromium.executablePath()
    if (bundled && existsSync(bundled)) return bundled
  } catch {
    /* 没装就继续找 */
  }
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (browsersPath && existsSync(browsersPath)) {
    for (const entry of readdirSync(browsersPath)) {
      const dir = path.join(browsersPath, entry)
      if (entry.startsWith('chromium_headless_shell-')) {
        const exe = path.join(dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')
        if (existsSync(exe)) return exe
      }
      if (entry.startsWith('chromium-')) {
        const exe = path.join(dir, 'chrome-win64', 'chrome.exe')
        if (existsSync(exe)) return exe
      }
    }
  }
  return null
}

/** launch() 被沙箱挡住时的降级：手动带 CDP 端口起浏览器，再用 connectOverCDP 接上。 */
async function launchViaCdpFallback(launchOptions) {
  const endpoint = process.env.CDP_ENDPOINT
  if (endpoint) {
    log('使用已有 CDP endpoint:', endpoint)
    return { browser: await chromium.connectOverCDP(endpoint), source: endpoint, child: null }
  }
  const exe = findManualChromium()
  if (!exe) throw new Error('没有可用的 Chromium 可执行文件')
  const userDataDir = path.join(REPO_ROOT, 'node_modules', '.cache', 'pw-userdata-slice')
  const child = spawnSafe(
    exe,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  const endpoint2 = `http://127.0.0.1:${CDP_PORT}`
  if (!(await waitForServer(`${endpoint2}/json/version`, 15000))) {
    child.kill('SIGKILL')
    throw new Error('手动启动的 Chromium CDP 端口没有就绪')
  }
  log('手动启动浏览器:', exe)
  return { browser: await chromium.connectOverCDP(endpoint2), source: exe, child }
}

async function readWebBgStyle(page) {
  return page.evaluate((props) => {
    const el = document.querySelector('#web_bg')
    if (!el) return null
    const cs = getComputedStyle(el)
    const out = {}
    for (const prop of props) out[prop] = cs[prop]
    return out
  }, WEB_BG_STYLE_PROPS)
}

async function readClassProbes(page) {
  return page.evaluate(() => {
    const noteEl = document.querySelector('#note-probe')
    const postEl = document.querySelector('#recent-post-probe')
    const note = noteEl ? getComputedStyle(noteEl) : null
    const post = postEl ? getComputedStyle(postEl) : null
    return {
      diagnostics: { innerWidth, innerHeight, devicePixelRatio, doubleRow: matchMedia('(min-width: 1201px)').matches },
      note: note
        ? {
            position: note.position, paddingTop: note.paddingTop, paddingLeft: note.paddingLeft,
            marginBottom: note.marginBottom, borderLeftWidth: note.borderLeftWidth,
            borderTopWidth: note.borderTopWidth, borderLeftColor: note.borderLeftColor,
            backgroundColor: note.backgroundColor,
          }
        : null,
      recentPost: post
        ? {
            display: post.display, flexDirection: post.flexDirection, height: post.height,
            fontSize: post.fontSize, borderRadius: post.borderRadius, overflow: post.overflow,
            rectWidth: postEl.getBoundingClientRect().width,
            parentWidth: postEl.parentElement ? postEl.parentElement.getBoundingClientRect().width : null,
          }
        : null,
    }
  })
}

async function readPugProbe(page) {
  return page.evaluate(() => {
    const probe = document.querySelector('#pug-probe')
    if (!probe) return null
    const img = probe.querySelector('img')
    return {
      children: probe.children.length,
      hasBr: Boolean(probe.querySelector('br')),
      hasImg: Boolean(img),
      hasInput: Boolean(probe.querySelector('input')),
      hasHr: Boolean(probe.querySelector('hr')),
      inputValue: probe.querySelector('input')?.value ?? null,
      imgComplete: img?.complete ?? null,
      imgNaturalWidth: img?.naturalWidth ?? null,
    }
  })
}

async function readRuntimeState(page) {
  return page.evaluate(() => ({
    path: location.pathname,
    title: document.title,
    pjaxRunTotal: window.__pjaxRunTotal ?? null,
    pjaxRuns: window.__pjaxRunPaths ?? window.__pjaxRuns ?? null,
    pjaxCompleteRuns: window.__pjaxCompleteRuns ?? null,
    homeScriptRuns: window.__homeScriptRuns ?? null,
    page2ScriptRuns: window.__page2ScriptRuns ?? null,
    page2PjaxRuns: window.__page2PjaxRuns ?? null,
    pjaxGlobalType: typeof window.pjax,
    pjaxLoadUrlType: typeof window.pjax?.loadUrl,
    navigationEntries: performance.getEntriesByType('navigation').length,
    fetchEntries: performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'fetch').map((e) => e.name),
  }))
}

async function readPersistState(page) {
  return page.evaluate(() => {
    const bg = document.querySelector('#web_bg')
    const player = document.querySelector('#music-player')
    const audio = document.querySelector('#bgm')
    return {
      sameWebBgNode: bg === window.__webBgRef,
      webBgMark: bg?.__probeMark ?? null,
      webBgPersistAttr: bg?.getAttribute('data-astro-transition-persist') ?? null,
      samePlayerNode: player === window.__playerRef,
      playerMark: player?.__probeMark ?? null,
      sameAudioNode: audio === window.__audioRef,
      audioMark: audio?.__probeMark ?? null,
      audio: audio
        ? {
            paused: audio.paused, currentTime: audio.currentTime, readyState: audio.readyState,
            duration: audio.duration, errorCode: audio.error?.code ?? null,
          }
        : null,
    }
  })
}

async function main() {
  if (!existsSync(path.join(DIST, 'index.html')) || !existsSync(path.join(DIST, 'page2', 'index.html'))) {
    console.error('[slice] dist 不完整，先跑 pnpm --filter blog build')
    process.exit(2)
  }
  mkdirSync(ARTIFACTS, { recursive: true })

  const preview = { child: null, output: [] }
  let browser = null
  let browserChild = null
  let exitCode = 0
  const consoleMessages = []
  const pageErrors = []
  const requests = []
  const responses = []

  try {
    if (!process.env.CDP_ENDPOINT) {
      Object.assign(preview, startPreview())
      if (!(await waitForServer(BASE))) throw new Error(`astro preview 没起来（${BASE}）\n${preview.output.join('')}`)
      log('preview ready:', BASE)
    } else {
      log('复用外部浏览器/CDP，不启动 preview:', BASE)
    }

    const headless = process.env.HEADED !== '1'
    const launchOptions = {
      headless,
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    }
    let browserSource = 'playwright launch()'
    try {
      browser = await chromium.launch(launchOptions)
    } catch (error) {
      log('chromium.launch() 失败:', String(error.message || error).split('\n')[0])
      const fallback = await launchViaCdpFallback(launchOptions)
      browser = fallback.browser
      browserChild = fallback.child
      browserSource = `connectOverCDP(${fallback.source})`
    }
    const browserVersion = browser.version()
    log('browser:', browserVersion, '| headless:', headless, '| source:', browserSource)

    const context = browser.contexts()[0] ?? (await browser.newContext({ viewport: VIEWPORT }))
    const page = context.pages()[0] ?? (await context.newPage())
    await page.setViewportSize(VIEWPORT)

    page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }))
    page.on('pageerror', (err) => pageErrors.push(String(err)))
    page.on('request', (req) => requests.push({ url: req.url(), type: req.resourceType(), method: req.method(), nav: req.isNavigationRequest() }))
    page.on('response', (res) => responses.push({ url: res.url(), status: res.status() }))

    await page.addInitScript(() => {
      window.__astroEvents = []
      for (const name of ['astro:before-swap', 'astro:after-swap', 'astro:page-load']) {
        document.addEventListener(name, () => window.__astroEvents.push({ name, path: location.pathname }))
      }
    })

    // ========== 1. 初次加载首页 ==========
    await page.goto(BASE + '/', { waitUntil: 'load' })
    await page.waitForFunction(() => (window.__pjaxRunTotal ?? 0) >= 1)
    await page.waitForFunction(() => (window.__pjaxCompleteRuns?.length ?? 0) >= 1)

    const initialRuntime = await readRuntimeState(page)
    const initialWebBgStyle = await readWebBgStyle(page)
    const initialClassProbes = await readClassProbes(page)
    const dpr = initialClassProbes.diagnostics.devicePixelRatio
    const snapped = (cssPx) => Math.floor(cssPx * dpr) / dpr

    check('初次加载 / 成功', initialRuntime.path === '/', initialRuntime.path)
    check('初次加载标题正确', String(initialRuntime.title).includes('首页'), initialRuntime.title)
    check('page-load 在首屏触发（pjax:complete shim 生效）', initialRuntime.pjaxCompleteRuns?.length === 1, initialRuntime.pjaxCompleteRuns)
    check('shim 暴露 window.pjax.loadUrl()', initialRuntime.pjaxGlobalType === 'object' && initialRuntime.pjaxLoadUrlType === 'function', { pjax: initialRuntime.pjaxGlobalType, loadUrl: initialRuntime.pjaxLoadUrlType })
    check('初次加载导航条目数 = 1', initialRuntime.navigationEntries === 1, initialRuntime.navigationEntries)

    // ---- #5 样式命中 ----
    const d = initialClassProbes.diagnostics
    check('#web_bg position:fixed', initialWebBgStyle?.position === 'fixed', initialWebBgStyle?.position)
    check('#web_bg z-index:-999', initialWebBgStyle?.zIndex === '-999', initialWebBgStyle?.zIndex)
    check('#web_bg 背景色 = rgb(247,249,254)（需 html[data-theme=light]）', initialWebBgStyle?.backgroundColor === 'rgb(247, 249, 254)', initialWebBgStyle?.backgroundColor)
    check('#web_bg transform 为 rotate(-1deg) matrix', String(initialWebBgStyle?.transform).startsWith('matrix'), initialWebBgStyle?.transform)
    check('#web_bg 宽高 ≈ 200% 视口（±2px）', Math.abs(parseFloat(initialWebBgStyle?.width) - d.innerWidth * 2) <= 2 && Math.abs(parseFloat(initialWebBgStyle?.height) - d.innerHeight * 2) <= 2, { width: initialWebBgStyle?.width, height: initialWebBgStyle?.height, viewport: [d.innerWidth, d.innerHeight] })
    check('.note position/padding/margin 命中上游', initialClassProbes.note?.position === 'relative' && initialClassProbes.note?.paddingTop === '15px' && initialClassProbes.note?.marginBottom === '20px', initialClassProbes.note)
    check('.note.icon-padding padding-left:3em 命中上游', initialClassProbes.note?.paddingLeft === '48px', initialClassProbes.note?.paddingLeft)
    check('.note.blue border-left-color:#428bca 命中上游', initialClassProbes.note?.borderLeftColor === 'rgb(66, 139, 202)', initialClassProbes.note?.borderLeftColor)
    check('.note.blue 背景 lighten(#428bca,85%) 命中上游', initialClassProbes.note?.backgroundColor === 'rgb(227, 238, 247)', initialClassProbes.note?.backgroundColor)
    const rp = initialClassProbes.recentPost
    const rpBaseOk = rp?.display === 'flex' && rp?.borderRadius === '12px' && rp?.overflow === 'hidden'
    const rpLayoutOk = d.doubleRow
      ? rp?.flexDirection === 'column' && Math.abs(rp.rectWidth / rp.parentWidth - 0.49) < 0.02
      : rp?.flexDirection === 'row' && Math.abs(parseFloat(rp.height) - 18 * parseFloat(rp.fontSize)) < 1
    check('.recent-post-item 命中上游（display:flex/border-radius:12px/上游布局分支）', rpBaseOk && rpLayoutOk, { doubleRow: d.doubleRow, rp })

    // ---- 持久节点打标 ----
    const marks = await page.evaluate(() => {
      const bg = document.querySelector('#web_bg')
      const player = document.querySelector('#music-player')
      const audio = document.querySelector('#bgm')
      if (!bg || !player || !audio) return { ok: false }
      bg.__probeMark = 'web_bg-initial'
      player.__probeMark = 'player-initial'
      audio.__probeMark = 'audio-initial'
      window.__webBgRef = bg
      window.__playerRef = player
      window.__audioRef = audio
      return { ok: true, webBgPersistAttr: bg.getAttribute('data-astro-transition-persist'), playerPersistAttr: player.getAttribute('data-astro-transition-persist') }
    })
    check('持久节点已打 expando 标记', marks.ok, marks)
    note('transition:persist 生成的属性值', marks)

    // ---- #8 音频起播 ----
    await page.evaluate(async () => {
      const audio = document.getElementById('bgm')
      window.__audioPlayError = null
      audio.muted = true
      try { await audio.play() } catch (error) { window.__audioPlayError = String(error) }
      await new Promise((resolve) => setTimeout(resolve, 700))
    })
    const audioBeforeNav = await page.evaluate(() => {
      const audio = document.getElementById('bgm')
      return { paused: audio.paused, currentTime: audio.currentTime, readyState: audio.readyState, duration: audio.duration }
    })
    const playError = await page.evaluate(() => window.__audioPlayError)
    check('音频已起播（play() 无异常）', playError === null, playError)
    check('音频初次播放中且 currentTime 前进', !audioBeforeNav.paused && audioBeforeNav.currentTime > 0.2, audioBeforeNav)

    check('初次加载 document 请求 = 1', requests.filter((r) => r.type === 'document').length === 1, requests.filter((r) => r.type === 'document').length)
    await sleep(300)
    await page.screenshot({ path: path.join(ARTIFACTS, 'pw-01-home.png') })

    // ========== 2. 普通链接导航：首页 → 第二页 ==========
    const docsBeforeNav1 = requests.filter((r) => r.type === 'document').length
    const fetchesBeforeNav1 = requests.filter((r) => r.type === 'fetch').length
    await page.evaluate(() => { window.__eventsBeforeNav1 = window.__astroEvents.length })
    await page.click('#nav-page2')
    await page.waitForFunction(() => location.pathname === '/page2/' && (window.__pjaxRunTotal ?? 0) >= 2, undefined, { timeout: 15000 })
    await page.waitForFunction(() => (window.__pjaxCompleteRuns?.length ?? 0) >= 2)
    await sleep(450)
    const docsAfterNav1 = requests.filter((r) => r.type === 'document').length
    const fetchesAfterNav1 = requests.filter((r) => r.type === 'fetch').length
    const nav1Runtime = await readRuntimeState(page)
    const nav1Persist = await readPersistState(page)
    const nav1WebBgStyle = await readWebBgStyle(page)
    const nav1ClassProbes = await readClassProbes(page)
    const pugProbe = await readPugProbe(page)
    const nav1Events = await page.evaluate(() => window.__astroEvents.slice(window.__eventsBeforeNav1))

    check('导航 1：document 请求增量为 0', docsAfterNav1 - docsBeforeNav1 === 0, { before: docsBeforeNav1, after: docsAfterNav1 })
    check('导航 1：出现 ClientRouter 的 fetch 请求', fetchesAfterNav1 > fetchesBeforeNav1, fetchesAfterNav1 - fetchesBeforeNav1)
    check('导航 1：到达 /page2/ 且标题已换', nav1Runtime.path === '/page2/' && String(nav1Runtime.title).includes('第二页'), { path: nav1Runtime.path, title: nav1Runtime.title })
    check('#web_bg 导航后是同一个 DOM 节点（expando 仍在）', nav1Persist.sameWebBgNode === true && nav1Persist.webBgMark === 'web_bg-initial', { sameNode: nav1Persist.sameWebBgNode, mark: nav1Persist.webBgMark })
    check('#web_bg computed style 导航前后逐属性一致', JSON.stringify(initialWebBgStyle) === JSON.stringify(nav1WebBgStyle), JSON.stringify(initialWebBgStyle) === JSON.stringify(nav1WebBgStyle) ? 'equal' : { before: initialWebBgStyle, after: nav1WebBgStyle })
    check('#music-player 导航后是同一个 DOM 节点', nav1Persist.samePlayerNode === true && nav1Persist.playerMark === 'player-initial', { sameNode: nav1Persist.samePlayerNode })
    check('#bgm audio 导航后是同一个 DOM 节点', nav1Persist.sameAudioNode === true && nav1Persist.audioMark === 'audio-initial', { sameNode: nav1Persist.sameAudioNode })
    check('音频导航后未中断（paused=false 且 currentTime 单调不减）', Boolean(nav1Persist.audio) && nav1Persist.audio.paused === false && nav1Persist.audio.currentTime >= audioBeforeNav.currentTime, { before: audioBeforeNav, after: nav1Persist.audio })
    check('data-pjax（全局）导航 1 后执行次数 = 2', nav1Runtime.pjaxRunTotal === 2, nav1Runtime.pjaxRunTotal)
    check('旧页脚本（首页）未重复执行：__homeScriptRuns=1', nav1Runtime.homeScriptRuns === 1, nav1Runtime.homeScriptRuns)
    check('新页脚本（第二页）首次进入执行一次：__page2ScriptRuns=1', nav1Runtime.page2ScriptRuns === 1, nav1Runtime.page2ScriptRuns)
    check('页级 data-pjax 脚本首次进入执行一次：__page2PjaxRuns=1', nav1Runtime.page2PjaxRuns === 1, nav1Runtime.page2PjaxRuns)
    check('astro:before-swap / after-swap / page-load 各触发一次', ['astro:before-swap', 'astro:after-swap', 'astro:page-load'].every((n) => nav1Events.filter((e) => e.name === n).length === 1), nav1Events)
    check('导航 1 后导航条目数仍 = 1', nav1Runtime.navigationEntries === 1, nav1Runtime.navigationEntries)
    note('导航 1 的 fetch 资源条目', nav1Runtime.fetchEntries)
    check('第二页 .note.red.simple border 命中上游（5px/1px，按 DPR 吸附复核）', Boolean(nav1ClassProbes.note) && Math.abs(parseFloat(nav1ClassProbes.note.borderLeftWidth) - snapped(5)) < 0.02 && Math.abs(parseFloat(nav1ClassProbes.note.borderTopWidth) - snapped(1)) < 0.02, { dpr, ...nav1ClassProbes.note })
    check('pug 探针：br/img/input/hr 全部解析进 DOM', Boolean(pugProbe) && pugProbe.hasBr && pugProbe.hasImg && pugProbe.hasInput && pugProbe.hasHr, pugProbe)
    check('pug 探针：input value 生效', pugProbe?.inputValue === 'pug', pugProbe?.inputValue)
    check('pug 探针：img 正常加载', (pugProbe?.imgNaturalWidth ?? 0) > 0, { naturalWidth: pugProbe?.imgNaturalWidth })
    await page.screenshot({ path: path.join(ARTIFACTS, 'pw-02-page2-after-nav.png') })

    // ========== 3. 返回首页 ==========
    await page.click('#back-home')
    await page.waitForFunction(() => location.pathname === '/' && (window.__pjaxRunTotal ?? 0) >= 3, undefined, { timeout: 15000 })
    await page.waitForFunction(() => (window.__pjaxCompleteRuns?.length ?? 0) >= 3)
    await sleep(450)
    const nav2Runtime = await readRuntimeState(page)
    const nav2Persist = await readPersistState(page)
    check('导航 2（返回首页）：data-pjax 执行次数 = 3', nav2Runtime.pjaxRunTotal === 3, nav2Runtime.pjaxRunTotal)
    check('导航 2：旧页脚本（第二页）未重复执行：__page2ScriptRuns=1', nav2Runtime.page2ScriptRuns === 1, nav2Runtime.page2ScriptRuns)
    check('导航 2：#web_bg 仍是同一个节点', nav2Persist.sameWebBgNode && nav2Persist.webBgMark === 'web_bg-initial', { sameNode: nav2Persist.sameWebBgNode })
    check('导航 2：音频仍未中断', Boolean(nav2Persist.audio) && nav2Persist.audio.paused === false && nav2Persist.audio.currentTime >= audioBeforeNav.currentTime, nav2Persist.audio)
    check('导航 2 后导航条目数仍 = 1', nav2Runtime.navigationEntries === 1, nav2Runtime.navigationEntries)

    // ========== 4. pjax shim：pjax.loadUrl() ==========
    const docsBeforeNav3 = requests.filter((r) => r.type === 'document').length
    await page.click('#shim-page2')
    await page.waitForFunction(() => location.pathname === '/page2/' && (window.__pjaxRunTotal ?? 0) >= 4, undefined, { timeout: 15000 })
    await page.waitForFunction(() => (window.__pjaxCompleteRuns?.length ?? 0) >= 4)
    await sleep(450)
    const docsAfterNav3 = requests.filter((r) => r.type === 'document').length
    const nav3Runtime = await readRuntimeState(page)
    check('pjax.loadUrl 导航：document 请求增量为 0', docsAfterNav3 - docsBeforeNav3 === 0, { before: docsBeforeNav3, after: docsAfterNav3 })
    check('pjax.loadUrl 导航：到达 /page2/', nav3Runtime.path === '/page2/', nav3Runtime.path)
    check('pjax.loadUrl 导航：全局 data-pjax 执行次数 = 4', nav3Runtime.pjaxRunTotal === 4, nav3Runtime.pjaxRunTotal)
    check('pjax.loadUrl 导航：pjax:complete 共 4 次', nav3Runtime.pjaxCompleteRuns?.length === 4, nav3Runtime.pjaxCompleteRuns)
    check('第二次进入第二页：data-astro-rerun 让页级脚本再执行一次（=2）', nav3Runtime.page2PjaxRuns === 2, nav3Runtime.page2PjaxRuns)
    check('全部导航结束后 document 请求总数 = 1（仅初次加载）', requests.filter((r) => r.type === 'document').length === 1, requests.filter((r) => r.type === 'document').map((r) => r.url))
    await page.screenshot({ path: path.join(ARTIFACTS, 'pw-03-page2-shim-nav.png') })

    // ========== 5. 重复监听计数 + console ==========
    const probeHits = await page.evaluate(() => {
      window.__pjaxProbeHits = 0
      document.dispatchEvent(new Event('pjax:probe'))
      return window.__pjaxProbeHits
    })
    note('重复监听累加：dispatch 一次 pjax:probe 的命中数（= data-pjax 全局脚本执行次数）', probeHits)

    const consoleErrors = consoleMessages.filter((m) => m.type === 'error')
    const consoleWarnings = consoleMessages.filter((m) => m.type === 'warning')
    check('导航全流程 console error = 0', consoleErrors.length === 0, consoleErrors)
    check('导航全流程 pageerror = 0', pageErrors.length === 0, pageErrors)
    note('console warning 原文', consoleWarnings)
    note('HTTP >= 400 的响应', responses.filter((r) => r.status >= 400).map((r) => `${r.status} ${r.url}`))

    const evidence = {
      generatedAt: new Date().toISOString(),
      base: BASE,
      browser: { version: browserVersion, source: browserSource, headless },
      viewport: VIEWPORT,
      results,
      info,
      runtime: { initial: initialRuntime, nav1: nav1Runtime, nav2: nav2Runtime, nav3: nav3Runtime },
      persist: { marks, nav1: nav1Persist, nav2: nav2Persist },
      style: { initialWebBg: initialWebBgStyle, nav1WebBg: nav1WebBgStyle, initialClassProbes, nav1ClassProbes },
      requestSummary: {
        documentRequests: requests.filter((r) => r.type === 'document').map((r) => r.url),
        fetchRequests: requests.filter((r) => r.type === 'fetch').map((r) => r.url),
        totalRequests: requests.length,
      },
      console: { errors: consoleErrors, warnings: consoleWarnings, all: consoleMessages },
      pageErrors,
      screenshots: ['artifacts/pw-01-home.png', 'artifacts/pw-02-page2-after-nav.png', 'artifacts/pw-03-page2-shim-nav.png'],
    }
    writeFileSync(path.join(ARTIFACTS, 'playwright-slice-result.json'), JSON.stringify(evidence, null, 2))

    const failed = results.filter((r) => !r.ok)
    console.log('')
    console.log('=========== 汇总 ===========')
    console.log(`PASS ${results.length - failed.length} / FAIL ${failed.length} / 共 ${results.length} 项`)
    console.log(`console error: ${consoleErrors.length}，pageerror: ${pageErrors.length}，document 请求: ${requests.filter((r) => r.type === 'document').length}`)
    if (failed.length > 0) {
      for (const f of failed) console.log(`  FAIL - ${f.name} :: ${JSON.stringify(f.detail)}`)
      exitCode = 1
    }
  } catch (error) {
    console.error('[slice] 运行失败:', error)
    exitCode = 2
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (browserChild) {
      try { browserChild.kill('SIGKILL') } catch { /* ignore */ }
    }
    const child = preview.child
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await sleep(300)
      if (child.exitCode === null) child.kill('SIGKILL')
    }
  }
  process.exit(exitCode)
}

main()
