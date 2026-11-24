/**
 * runtime.ts — ClientRouter 与上游 Pjax 契约之间的适配层（P4-3）。
 *
 * 上游 `layout/includes/third-party/pjax.pug` 做了两件事：
 *   1. 用 Pjax 接管站内链接（选择器 `a:not([target="_blank"])`，替换
 *      `head > title` / `#config-diff` / `#body-wrap` / `.js-pjax` 等子树）；
 *   2. 在 `pjax:send` / `pjax:complete` 上挂全局副作用（预加载、音乐、统计、
 *      `window.refreshFn()` 等）。
 *
 * Astro 侧由 `<ClientRouter />` 接管第 1 件事，本模块只负责第 2 件事的**等价映射**：
 *   astro:before-swap  → 记录当前 `<html data-theme>` + 补发 `pjax:send`
 *   astro:after-swap   → 重放 `<html data-theme>`（ClientRouter 换页会覆写 html 属性）
 *   astro:page-load    → 先 `window.refreshFn()`，再补发 `pjax:complete`
 *
 * 三个关键点：
 *   - **首屏不重复执行**：`main.js` 在 DOMContentLoaded 里已经调用过 `refreshFn()`，
 *     Astro 的 `astro:page-load` 首屏也会触发一次；这里用 `hasNavigated` 跳过首屏，
 *     与上游 Pjax 只在真正导航后发 `pjax:complete` 的语义一致。
 *   - **幂等初始化**：模块本身由 Astro 按 URL 去重只执行一次；但仍用 window 标记
 *     兜底，避免 dev/HMR 或未来切换打包方式时重复注册监听（P1.5 §4.2 的教训）。
 *   - **`pjax.loadUrl` 保持**：模板（`onclick="pjax.loadUrl(...)"`、`banner-button`、
 *     `toRandomPost()`）直接调全局 `pjax`，这里映射到 `navigate()`；
 *     `{ history: false }` → `replace`，其余 → `auto`。
 *
 * 额外的第四个副作用（P4-4 修）：**换页后重放 `<html data-theme>`**。
 *
 * 上游 Pjax 只换 `#body-wrap` 等子树，`<html>` 上的运行时属性天然保留；而
 * ClientRouter 的 `swap()`（`@astrojs/runtime/internal/transitions/swap-functions.js`）
 * 会调用 `swapRootAttributes(newDocument)`：**删掉当前 `<html>` 的全部属性**，
 * 再挂上**新文档**（fetch 回来的静态 HTML）的 html 属性。静态 HTML 里
 * `<html data-theme={display_mode}>` 是构建期就写死的兜底值（BaseLayout.astro:280），
 * 用户手选的 dark 只存在于首屏内联 bootstrap 的运行时结果里 —— 于是换页后
 * data-theme 被打回 display_mode（examples/blog 是 light）。
 *
 * 首屏 bootstrap（inject-head-js）**不会**在换页时重新执行来兜住：它和其他
 * 站点级内联脚本的 textContent 逐字相同，首次加载即被 ClientRouter 记入
 * `scriptsAlreadyRan` 并打上 `data-astro-exec`，`runScripts()` 会跳过它
 * （`router.js` 的 `if (script.dataset.astroExec === "") continue;`）。
 * 因此只能在 `astro:after-swap`（swap 之后、page-load/refreshFn 之前）显式重放。
 * 详见 docs/notes/P4-4-darkmode-nav-fix.md。
 */
import { navigate } from 'astro:transitions/client'

type PjaxLoadOptions = { history?: boolean }
type PjaxGlobal = { loadUrl: (url: string, options?: PjaxLoadOptions) => void }

type RuntimeWindow = Window & {
  pjax?: PjaxGlobal
  refreshFn?: () => void
  aplayers?: Array<{ options?: { fixed?: boolean }; destroy?: () => void }>
  __anzhiyuPjaxRuntime?: boolean
  __anzhiyuPjaxNavigated?: boolean
  /** 首屏 `inject-head-js` bootstrap 定义（`darkmode.enable` 为真时存在）。 */
  activateDarkMode?: () => void
  activateLightMode?: () => void
}

const w = window as RuntimeWindow

type ThemeMode = 'dark' | 'light'

/**
 * 换页前 `<html data-theme>` 的快照（P4-4）。
 *
 * 必须是「换页前 DOM 上的实际值」而不是 localStorage：首访跟随系统/时段时
 * localStorage 里没有显式记录，但用户看到的主题同样是 dark，导航后也不该被
 * 打回静态 light。上游 Pjax 不碰 `<html>` 属性，这里用重放等效复刻。
 */
let themeBeforeSwap: ThemeMode | null = null

function readTheme(): ThemeMode | null {
  const value = document.documentElement.getAttribute('data-theme')
  return value === 'dark' || value === 'light' ? value : null
}

/**
 * 重放换页前的主题（`astro:after-swap` 时机）。
 *
 * 优先调 inject-head-js 定义的 `activateDarkMode` / `activateLightMode`：它们除了
 * `data-theme` 还会把 `<meta name="theme-color">` 改成与主题匹配的颜色 —— head swap
 * 同样会把这条 meta 换成新文档的静态 light 值。bootstrap 未定义时（`darkmode.enable`
 * 关闭，主题本就不允许切）退化为直接写属性，保证不会把已生效的 dark 打回 light。
 */
function restoreTheme(theme: ThemeMode): void {
  if (theme === 'dark') {
    if (typeof w.activateDarkMode === 'function') w.activateDarkMode()
    else document.documentElement.setAttribute('data-theme', 'dark')
  } else if (typeof w.activateLightMode === 'function') {
    w.activateLightMode()
  } else {
    document.documentElement.setAttribute('data-theme', 'light')
  }
}

/**
 * `utils.js` 顶部是 `const anzhiyu = {...}`（全局**词法**绑定，不是 window 属性），
 * 所以 `window.anzhiyu` 取不到；模块里直接按名字引用，配合 `typeof` 守卫。
 */
declare const anzhiyu: { removeGlobalFnEvent?: (name: string) => void } | undefined

function dispatch(name: string): void {
  document.dispatchEvent(new CustomEvent(name))
}

/** 上游 pjax.pug:24-44 的 `pjax:send` 副作用。 */
function onPjaxSend(): void {
  // `anzhiyu.removeGlobalFnEvent` 在 utils.js 里定义；首屏加载顺序异常时可能还没有。
  if (typeof anzhiyu !== 'undefined') {
    anzhiyu?.removeGlobalFnEvent?.('pjax')
    anzhiyu?.removeGlobalFnEvent?.('themeChange')
  }

  document.getElementById('rightside')?.classList.remove('rightside-show')

  /*
   * 上游 pjax.pug 在这里销毁 `window.aplayers` 里 fixed=false 的播放器。
   * Astro 侧 `#nav-music` 是 `transition:persist`，播放器本身不随 swap 销毁，
   * 提前 destroy 反而会让 Meting2 随后的 disconnectedCallback 二次销毁（报错），
   * 因此这里不再主动 destroy；由元素自身的生命周期负责（P4-7 接管音乐交互时复核）。
   */

  const typed = (w as unknown as { typed?: object }).typed
  if (typeof typed === 'object' && typed) {
    ;(typed as { destroy?: () => void }).destroy?.()
  }

  // reset readmode
  const bodyClassList = document.body.classList
  if (bodyClassList.contains('read-mode')) bodyClassList.remove('read-mode')
}

/** 上游 pjax.pug:46-71 的 `pjax:complete` 首句（其余副作用由页面脚本监听）。 */
function onPjaxComplete(): void {
  if (typeof w.refreshFn === 'function') w.refreshFn()

  // 上游会重建 `script[data-pjax]`；Astro 侧用 `data-astro-rerun` 自动重执行，
  // 这里只兜底处理「手写但漏标 rerun」的 data-pjax 脚本。
  document.querySelectorAll<HTMLScriptElement>('script[data-pjax]:not([data-astro-rerun])').forEach((item) => {
    const replacement = document.createElement('script')
    for (const attr of Array.from(item.attributes)) replacement.setAttribute(attr.name, attr.value)
    replacement.textContent = item.text || item.textContent || ''
    item.parentNode?.replaceChild(replacement, item)
  })

  // `GLOBAL_CONFIG` 是内联脚本里的全局词法绑定，不在 window 上；这里直接检查
  // lazyload 实例是否存在，效果与 `GLOBAL_CONFIG.islazyload && update()` 等价。
  ;(w as unknown as { lazyLoadInstance?: { update?: () => void } }).lazyLoadInstance?.update?.()

  const panguInit = (w as unknown as { panguInit?: () => void }).panguInit
  if (typeof panguInit === 'function') panguInit()

  const loadMeting = (w as unknown as { loadMeting?: () => void }).loadMeting
  if (typeof loadMeting === 'function' && document.getElementsByClassName('aplayer').length) loadMeting()

  const Prism = (w as unknown as { Prism?: { highlightAll?: () => void } }).Prism
  if (Prism && typeof Prism === 'object' && typeof Prism.highlightAll === 'function') {
    Prism.highlightAll()
  }
}

function install(): void {
  if (w.__anzhiyuPjaxRuntime) return
  w.__anzhiyuPjaxRuntime = true
  w.__anzhiyuPjaxNavigated = false

  if (!w.pjax) {
    w.pjax = {
      loadUrl(url: string, options: PjaxLoadOptions = {}) {
        const history = options.history === false ? 'replace' : 'auto'
        void navigate(url, { history })
      },
    }
  }

  document.addEventListener('astro:before-swap', (event) => {
    /*
     * P4-4：先记下换页前的主题。swap() 里 swapRootAttributes 会整组替换 <html>
     * 属性，不记就只剩新文档静态的 display_mode。
     */
    themeBeforeSwap = readTheme()

    /*
     * `#nav-music` 是 transition:persist，但 Astro 仍会把新文档里的同名节点插入后
     * 再替换掉。新插入的 `<meting-js>` 会被 Meting2 立刻 upgrade，随后又被移除，
     * 触发 `disconnectedCallback` 里未初始化的 `this.player.destroy()`（第三方库
     * 未做空值保护）。在 swap 前从新文档里删掉待替换的 meting-js，可避免这条噪音；
     * 持久化的旧节点仍由 Astro 正常搬运。音乐交互本身归 P4-7。
     */
    const newDocument = (event as unknown as { newDocument?: Document }).newDocument
    newDocument?.querySelectorAll('meting-js').forEach((node) => node.remove())

    w.__anzhiyuPjaxNavigated = true
    onPjaxSend()
    dispatch('pjax:send')
  })

  /*
   * P4-4：`astro:after-swap` 在 swapRootAttributes / head / body 换完之后、
   * runScripts + astro:page-load（refreshFn）之前同步派发，所以在新的 view-transition
   * 快照生成前把主题放回去就不会闪。这里只重放「换页前是什么」，不重新做决策：
   * 首访的系统/时段判断仍只由首屏 bootstrap 负责，手动切换仍只由 rightSideFn.darkmode
   * 负责，本监听不写 localStorage、不调 handleThemeChange。
   */
  document.addEventListener('astro:after-swap', () => {
    if (themeBeforeSwap) restoreTheme(themeBeforeSwap)
  })

  document.addEventListener('astro:page-load', () => {
    // 首屏：main.js 的 DOMContentLoaded 已经 refreshFn 过；上游也不会发 pjax:complete。
    if (!w.__anzhiyuPjaxNavigated) return
    onPjaxComplete()
    dispatch('pjax:complete')
  })
}

install()
