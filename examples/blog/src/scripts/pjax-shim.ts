/**
 * P1.5 pjax shim 最小验证
 *
 * 上游主题的模板/脚本大量依赖两个 pjax 契约：
 *   1. 模板里直接调 `pjax.loadUrl(url, { history: false })`
 *   2. 脚本里监听 `pjax:complete` 做刷新（window.refreshFn / lazyload / pangu / Prism / 统计上报）
 *
 * 这里验证把两者映射到 Astro ClientRouter：
 *   pjax.loadUrl       → navigate()（history:false → replace）
 *   astro:page-load    → 在 document 上补发 pjax:complete
 *
 * 这个模块是 Astro 打包出的 module script（URL 稳定），ClientRouter 导航时会被
 * deselectScripts 按 URL 去重，因此只执行一次 —— 正好符合「只初始化一次的路由层」定位。
 */
import { navigate } from 'astro:transitions/client'

type PjaxLoadOptions = {
  /** 上游语义：false = 不压历史栈（对应 navigate 的 replace） */
  history?: boolean
}

type PjaxGlobal = {
  loadUrl: (url: string, options?: PjaxLoadOptions) => void
}

type PjaxShimWindow = Window & {
  pjax?: PjaxGlobal
  __pjaxCompleteRuns?: string[]
}

const w = window as PjaxShimWindow

if (!w.pjax) {
  w.pjax = {
    loadUrl(url: string, options: PjaxLoadOptions = {}) {
      const history = options.history === false ? 'replace' : 'auto'
      void navigate(url, { history })
    },
  }
}

document.addEventListener('astro:page-load', () => {
  w.__pjaxCompleteRuns = w.__pjaxCompleteRuns || []
  w.__pjaxCompleteRuns.push(location.pathname)
  document.dispatchEvent(
    new CustomEvent('pjax:complete', { detail: { path: location.pathname } }),
  )
})
