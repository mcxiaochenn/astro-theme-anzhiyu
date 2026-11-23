/**
 * about 页公共工具 — 把上游模板里反复出现的三件事收口：
 *
 *  1. `url_for()`（about.pug:21/90/153/155 的图片地址）；
 *  2. `<img>` 的 lazyload 最终形态（`scripts/filters/post_lazyload.js` 的等效物，
 *     见 `components/archive/LazyImage.astro` 的说明）；
 *  3. `_p()`（文案只在 `languages/*.yml` 里，基准站语言是 zh-CN）。
 *
 * 站点语言目前没有从 BaseLayout 透传到子组件（见 `layouts/site.ts` 的注释），
 * 与 `FlinkPage` / `FcirclePage` 一致，这里按基准站的 zh-CN 取词。
 */
import { getThemeConfig, readString } from '../../../layouts/theme-context.ts'
import { createUrlFor } from '../../../layouts/site.ts'
import { lazyImageAttrs } from '../../layout/lazyload.ts'
import { tp } from '../../../i18n/index.ts'

const theme = getThemeConfig()
const urlFor = createUrlFor('/')

/** 上游 `_p(key, ...args)`；about 页固定 zh-CN（基准站语言）。 */
export const _p = (key: string, ...args: unknown[]): string => tp(key, 'zh-CN', ...args)

/** 上游 `url_for(path)`。 */
export { urlFor }

/**
 * `<img>` 属性。
 *
 * - 启用站级 lazyload 时与上游最终产物一致：`src=占位图` + `onerror` + `data-lazy-src`；
 * - 未启用时退回 `src` 原值。
 *
 * `fallbackOnError` 对应 pug 自己写的 `onerror=this.onerror=null;this.src='…'`：
 * lazyload 开启时它的 `onerror` 会被站级过滤器插入的那条挤到第二位，而
 * `diff-html.mjs:375` 对重复属性「保留第一个」，所以这里只在未启用 lazyload 时补。
 */
export function imageAttrs(
  src: string,
  fallbackOnError = false,
): Record<string, string> {
  const attrs = lazyImageAttrs(src, { theme, urlFor })
  if (!fallbackOnError || 'data-lazy-src' in attrs) return attrs
  const errorFlink = readString(theme.error_img, 'flink', '/img/friend_404.gif')
  return { ...attrs, onerror: `this.onerror=null;this.src='${errorFlink}'` }
}

/**
 * 上游 `new Date(datatime).toISOString().slice(0, -14)`（about.pug:242/245）：
 * 只保留 `YYYY-MM-DD`。无时区字面量按基准站 +08:00 解释，保证与构建机 TZ 无关。
 */
export function rewardDate(value?: string): string {
  if (!value) return ''
  const text = value.includes('T') ? value : value.replace(' ', 'T')
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text)
  const parsed = new Date(hasZone ? text : `${text}+08:00`)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, -14)
}

/** 上游 `pjax.loadUrl("…")` 的静态 onclick 属性（交互行为留给 Phase 4）。 */
export const pjaxLoad = (url?: string): string => `pjax.loadUrl("${url ?? ''}")`
