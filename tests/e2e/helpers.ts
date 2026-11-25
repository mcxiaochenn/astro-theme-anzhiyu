/**
 * 行为用例共用的选择器、确定性导航基座与外部资源隔离。
 *
 * 设计目标（P4-10 CI 首跑 26 条失败后重做，见 docs/notes/P4-10-e2e-ci-fix.md）：
 *
 * 1. **导航不依赖 `load`**：demo 站 head/body 里引了 cdn.cbd.int / npm.elemecdn /
 *    bu.dusays 等外部资源，CI 上偶发挂起会让 `page.goto()` 默认的 `waitUntil: "load"`
 *    一直等不到，整条用例 30s 超时。这里统一用 `domcontentloaded` + 显式等
 *    「主题运行时已初始化」的 DOM 标记（`#loading-box.loaded` + `#nav.show`）。
 * 2. **站内导航不依赖 `waitForURL`**：ClientRouter 是 pushState 导航，没有 load 生命周期，
 *    `page.waitForURL()`（默认 waitUntil "load"）会空等到超时；改成 poll URL +
 *    `astro:page-load` 事件标记。
 * 3. **外部源隔离**：非 127.0.0.1/localhost 的请求一律不落真实网络 ——
 *    图片/媒体/字体/其他直接 abort；第三方脚本用最小的全局桩 fulfil（主题自身
 *    main.js 对这些全局是无保护调用：`Fancybox.bind` / `new LazyLoad` / `Snackbar.show` /
 *    `QRCode` / `waterfall()`，断网会让首屏初始化在 DOMContentLoaded 里抛 ReferenceError，
 *    反而把「环境不可达」伪装成「产品 bug」）。第三方 CSS 返回空样式。
 *    站内资源（127.0.0.1/localhost）始终放行。
 * 4. **右侧按钮走真实用户路径**：`#darkmode` 在默认折叠的 `#rightside-config-hide` 里，
 *    且 `#rightside` 未滚动时整块 translate 到视口外。真实路径是「滚动让 #rightside
 *    出现 → 点齿轮 #rightside-config 展开 → 点 #darkmode」。
 *
 * 只依赖「用户可见/稳定」的契约（真实 DOM id 与 localStorage 键），
 * 不读主题内部变量名或组件实现细节。
 */
import { expect, test as base, type Locator, type Page, type Response } from '@playwright/test'

/* ------------------------------------------------------------------ */
/* 1. 外部资源隔离                                                      */
/* ------------------------------------------------------------------ */

/** 站点自身的 host；其余 host 都视为外部源。 */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * 第三方脚本的最小桩。
 *
 * 只补主题 main.js 首屏初始化路径上**会调到**的全局（均为上游 external 资源提供）；
 * 第三方库本身不在 e2e 验收范围（P4-1 资源层另有 HTTP 级检查），这里保证
 * 「外部 CDN 不可达」不会污染首方运行时行为。
 */
const THIRD_PARTY_STUB = `
;(function () {
  var noop = function () {};
  window.Fancybox = window.Fancybox || { bind: noop, unbind: noop, default: { bind: noop } };
  window.LazyLoad = window.LazyLoad || function () { this.update = noop; this.loadAll = noop; };
  window.Snackbar = window.Snackbar || { show: noop };
  window.QRCode = window.QRCode || function () {};
  window.QRCode.CorrectLevel = window.QRCode.CorrectLevel || { L: 1, M: 0, Q: 3, H: 2 };
  window.waterfall = window.waterfall || noop;
  window.APlayer = window.APlayer || function () {};
  window.Meting = window.Meting || {};
  window.Pace = window.Pace || { on: noop, off: noop, start: noop, stop: noop, restart: noop };
  // about 页（components/page/about/about-script.ts）：typeof gsap 守卫后的 CountUp 动画
  window.CountUp = window.CountUp || function () { this.start = noop; this.update = noop; };
  // peoplecanvas（assets/js/anzhiyu/people.js）用到 parseEase / timeline 链 / ticker.add·remove；
  // 桩必须覆盖 cleanupPeopleCanvas（pjax:send → gsap.ticker.remove），否则「外部 CDN 不可达」
  // 会伪装成产品 TypeError（G1 CI 红：reading 'remove'）。
  window.gsap = window.gsap || {
    set: noop,
    to: noop,
    parseEase: function () { return function (t) { return t; }; },
    ticker: { add: noop, remove: noop },
    timeline: function () {
      return { timeScale: noop, to: noop, eventCallback: noop, kill: noop, progress: noop };
    },
  };
  window.socialShare = window.socialShare || noop;
})();
`

/**
 * 把页面所有非本地请求钉死在「不发真实网络」：
 *   - script  → 返回上面的桩（主题首屏初始化依赖这些全局；返回空体会 ReferenceError）
 *   - stylesheet → 返回空样式（第三方 CSS 不影响 DOM 契约断言）
 *   - 其余（image/media/font/document/other…）→ abort
 *
 * 必须在第一次 `page.goto` 之前调用；返回的扩展 test fixture 已经处理好了。
 */
export async function isolateExternalRequests(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = request.url()
    // data: / blob: / chrome-extension: 等非 http(s) 资源放行
    if (!/^https?:/i.test(url)) return route.continue()
    let hostname: string
    try {
      hostname = new URL(url).hostname
    } catch {
      return route.continue()
    }
    if (LOCAL_HOSTS.has(hostname)) return route.continue()

    const resourceType = request.resourceType()
    if (resourceType === 'script') {
      return route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: THIRD_PARTY_STUB,
      })
    }
    if (resourceType === 'stylesheet') {
      return route.fulfill({
        status: 200,
        contentType: 'text/css; charset=utf-8',
        body: '/* e2e: 第三方 CDN 样式在离线 CI 中不加载（不属于首方 DOM 契约） */',
      })
    }
    return route.abort('blockedbyclient')
  })
}

/**
 * 扩展的 `test`：每个用例的 page 自动套上外部资源隔离。
 *
 * 各 spec 从本文件 `import { expect, test } from './helpers'` 即可；
 * `pwa.spec.ts` 走独立配置（playwright.pwa.config.ts），不受这里影响。
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    await isolateExternalRequests(page)
    await use(page)
  },
})

export { expect }

/* ------------------------------------------------------------------ */
/* 2. 确定性导航                                                        */
/* ------------------------------------------------------------------ */

/** 主题首屏初始化（DOMContentLoaded 里的 refreshFn）的等待上限。 */
const READY_TIMEOUT = 20_000
/** 一次 ClientRouter 站内导航的等待上限。 */
const ROUTE_TIMEOUT = 20_000

/**
 * 等主题运行时初始化完成，不使用 load 事件：
 *   - `#loading-box`（preloader 遮罩，z-index 1001）加上 `.loaded` —— 否则它会挡住点击；
 *   - `#nav` 加上 `.show` —— main.js 的 DOMContentLoaded → refreshFn → initAdjust 产物。
 * 两者都是 `setTimeout(…, 10000)` / load 的后备路径也能满足的稳定标记。
 */
export async function waitForThemeReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const loading = document.getElementById('loading-box')
      const nav = document.getElementById('nav')
      return (
        (!loading || loading.classList.contains('loaded')) &&
        Boolean(nav && nav.classList.contains('show'))
      )
    },
    undefined,
    { timeout: READY_TIMEOUT },
  )
}

/**
 * 打开页面并等到主题运行时可用（`domcontentloaded`，不等外部资源 load）。
 * 返回 `page.goto` 的 Response，供需要断言 HTTP 状态码的用例使用。
 */
export async function gotoReady(page: Page, path = '/'): Promise<Response | null> {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
  await waitForThemeReady(page)
  return response
}

/**
 * 点一个站内链接并等 ClientRouter 完成一次客户端导航。
 *
 * 为什么不用 `page.waitForURL()`：ClientRouter 用 history.pushState 换 URL，
 * 没有 load 生命周期事件，`waitForURL` 默认 waitUntil:"load" 会空等到超时
 * （CI 首跑 4 条用例就是死在这里）。这里改为：
 *   1. 点击前在 document 上挂一次性的 `astro:page-load` 监听 —— ClientRouter 在
 *      DOM swap + pushState + astro:after-swap 之后派发它，是「导航完成」的精确信号；
 *   2. poll URL 变化（swap 后立刻 pushState，可作为早退检查）；
 *   3. 等事件标记。
 */
export async function clickAndWaitForClientRoute(page: Page, target: Locator): Promise<string> {
  await page.evaluate(() => {
    const state = window as unknown as { __e2eRouteDone?: boolean }
    state.__e2eRouteDone = false
    document.addEventListener(
      'astro:page-load',
      () => {
        state.__e2eRouteDone = true
      },
      { once: true },
    )
  })

  const previousUrl = page.url()
  await target.click()
  await expect
    .poll(() => page.url(), { timeout: ROUTE_TIMEOUT, message: '点击站内链接后 URL 没有变化' })
    .not.toBe(previousUrl)
  await page.waitForFunction(
    () => (window as unknown as { __e2eRouteDone?: boolean }).__e2eRouteDone === true,
    undefined,
    { timeout: ROUTE_TIMEOUT },
  )
  return page.url()
}

/** 等 ClientRouter 完成一次历史前进/后退（用 history API，绕开 waitUntil:"load"）。 */
export async function goBackAndWait(page: Page, previousUrl: string): Promise<void> {
  await page.evaluate(() => history.back())
  await expect
    .poll(() => page.url(), { timeout: ROUTE_TIMEOUT, message: 'history.back() 后 URL 没有回到上一页' })
    .not.toBe(previousUrl)
}

/** `history.forward()` + URL 变化等待。 */
export async function goForwardAndWait(page: Page, previousUrl: string): Promise<void> {
  await page.evaluate(() => history.forward())
  await expect
    .poll(() => page.url(), { timeout: ROUTE_TIMEOUT, message: 'history.forward() 后 URL 没有前进' })
    .not.toBe(previousUrl)
}

/* ------------------------------------------------------------------ */
/* 3. 选择器与小工具                                                    */
/* ------------------------------------------------------------------ */

/**
 * 首页第一张真实文章卡片的标题链接（站内导航类用例的稳定入口）。
 *
 * 为什么不用 `#recent-posts a[href^="/"]`：`#recent-posts` 里文章卡片之前先渲染分类条
 * `#categoryBar`（examples/blog/src/pages/index.astro:50-57，CategoryBar 在 PostCard 之前），
 * 它的第一个链接是当前页自己 `<a href="/">首页</a>` —— 点击后 URL 不变，
 * clickAndWaitForClientRoute 的 URL poll 会 20s 超时（CI 第二轮 5 条导航用例的死因）。
 *
 * 为什么选 `a.article-title`：
 *   - PostCard.astro:163 给每张卡片输出唯一一个 `a.article-title`，是纯结构类名，与站点语言、
 *     文章标题文案无关（置顶卡片只是多一个 `lastestpost-item` 类，仍是真实文章卡片）；
 *   - 分类条/分页/推荐位都不在 `.recent-post-item` 内（推荐位 `#home_top` 在 `#recent-posts`
 *     之外），因此不会被误命中；
 *   - 构建产物实测：`#recent-posts .recent-post-item a.article-title[href^="/"]` 命中 6 个
 *     （6 张卡片各 1 个），首个 href=/2025/02/02/sticky-top/，对应 dist 文件存在。
 */
export function internalLink(page: Page) {
  return page.locator('#recent-posts .recent-post-item a.article-title[href^="/"]').first()
}

/** 右击一个元素，打开自定义右键菜单（仅在 rightClickMenu.enable=true 的站点可用）。 */
export async function openContextMenu(page: Page, target: Locator) {
  await target.click({ button: 'right' })
  await expect(page.locator('#rightMenu')).toBeVisible()
}

/**
 * demo 站是否加载了自定义右键菜单运行时。
 *
 * 依据：`examples/blog/theme.config.yml` 的 `rightClickMenu.enable: false`（与上游主题
 * 默认一致）→ AdditionalJs 不输出 right_click_menu.js → `window.rm` 不存在。
 * 用例据此 skip，而不是伪造成「右键没反应」的产品 bug；一旦 fixture 打开该开关，
 * 这些用例会自动开始执行。
 */
export async function hasRightMenuRuntime(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const rm = (window as unknown as { rm?: { showRightMenu?: unknown } }).rm
    return Boolean(rm && typeof rm.showRightMenu === 'function')
  })
}

/** `rightClickMenu.enable=false` 时行为类用例的统一 skip 依据。 */
export const RIGHT_MENU_DISABLED_REASON =
  'demo 站 theme.config.yml 的 rightClickMenu.enable=false（与上游主题默认一致），' +
  'right_click_menu.js 未加载、window.rm 不存在；右键菜单行为验收需要启用该开关的站点/' +
  'fixture（examples/blog 配置属并行任务范围，见 P4-10 报告 §5）'

/** 读取 `saveToLocal('theme')` 的值；没写过时返回 undefined。 */
export async function readStoredTheme(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('theme')
    if (!raw) return undefined
    try {
      return JSON.parse(raw).value as string
    } catch {
      return undefined
    }
  })
}

/** `<html data-theme>` 的当前值。 */
export async function currentTheme(page: Page): Promise<string | null> {
  return page.locator('html').getAttribute('data-theme')
}

/**
 * 让右侧按钮栏 `#rightside` 进入视口。
 *
 * `#rightside` 默认 `right: -48px; opacity: 0`，main.js 的滚动监听在
 * `scrollY > 26` 时给它 `translateX(-58px)` 才露出来；不滚动的话 `#darkmode` 会被
 * Playwright 判为 "Element is outside of the viewport"（force:true 也不能点）。
 */
export async function revealRightside(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 400))
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const rightside = document.getElementById('rightside')
          if (!rightside) return false
          const box = rightside.getBoundingClientRect()
          return box.left >= 0 && box.right <= window.innerWidth
        }),
      { timeout: 10_000, message: '#rightside 没有随滚动进入视口（右侧按钮栏未显示）' },
    )
    .toBe(true)
}

/**
 * 真实用户路径展开右侧「设置」折叠组：滚动露出 #rightside → 点齿轮。
 * 展开后 `#rightside-config-hide` 带 `.show` 类，`#darkmode` 等按钮才可点击。
 */
export async function openRightsideSettings(page: Page): Promise<void> {
  await revealRightside(page)
  await page.locator('#rightside-config').click()
  await expect(page.locator('#rightside-config-hide')).toHaveClass(/\bshow\b/)
}

/**
 * 通过右侧按钮切换一次明暗主题，返回切换后的值。
 *
 * 走的是真实用户路径（展开设置组 → 点 #darkmode），不再用 force:true 硬点折叠元素；
 * `rightSideFn["rightside-config"]` 会把折叠组展开，`#darkmode` 的 click 由
 * main.js 的 rightSideFn.darkmode 处理（改 `<html data-theme>` + write localStorage）。
 */
export async function toggleThemeViaRightside(page: Page): Promise<'light' | 'dark'> {
  const before = await currentTheme(page)
  const next = before === 'dark' ? 'light' : 'dark'
  await openRightsideSettings(page)
  await page.locator('#darkmode').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', next)
  return next
}

/** 站点启用了哪套搜索 UI；都没启用时返回 null（用例据此 skip）。 */
export async function detectSearchUi(page: Page): Promise<'local' | 'algolia' | 'docsearch' | null> {
  if ((await page.locator('#local-search').count()) > 0) return 'local'
  if ((await page.locator('#algolia-search').count()) > 0) return 'algolia'
  if ((await page.locator('.docsearch-wrap').count()) > 0) return 'docsearch'
  return null
}

/**
 * 记录所有 `document` 类型的请求（整页刷新的硬证据）。
 *
 * 必须在 `page.goto` 之前挂监听，否则首访的那次 document 请求会被漏掉；
 * 首访之后用返回数组的长度作为基线，站内导航不应再追加任何一条。
 */
export function trackDocumentRequests(page: Page): string[] {
  const documents: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documents.push(request.url())
  })
  return documents
}

/** 页面运行期错误收集器：console 的 error 级消息 + 未捕获 JS 异常分开记。 */
export function collectPageErrors(page: Page): {
  consoleErrors: string[]
  pageErrors: string[]
} {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  return { consoleErrors, pageErrors }
}

/**
 * 过滤掉「资源加载失败」类 console 噪音。
 *
 * 第三方 CDN（Meting / fancybox / lazyload…）与图片 404 属于 P4 资源与第三方集成
 * 的验收范围（另有用例覆盖），不是 ClientRouter 的运行时错误；把它们排除后只留
 * 真正的 JS 报错。外部源已被 `isolateExternalRequests` 钉死，abort 产生的
 * `net::ERR_FAILED` 也走这条过滤。
 */
export function runtimeConsoleErrors(errors: string[]): string[] {
  return errors.filter(
    (text) => !/Failed to load resource|net::ERR|ERR_(?:CONNECTION|NAME|CERT|ABORTED|FAILED)/.test(text),
  )
}
