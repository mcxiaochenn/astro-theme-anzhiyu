/**
 * lazyload.ts — 复刻上游 Hexo 主题的 `scripts/filters/post_lazyload.js`（P2-4）。
 *
 * 上游是一个 **站点级** 后处理：注册在 `after_render:html`，当
 * `theme.lazyload.enable && theme.lazyload.field === 'site'` 时，把每个
 * `<img src="X">` 改写成
 *
 *   <img src="<占位图>" onerror="this.onerror=null,this.src=&quot;<error_img>&quot;" data-lazy-src="X">
 *
 * 这个改写不是装饰，是 **运行时契约**：`source/js/main.js:1123` 里
 * `new LazyLoad({ elements_selector: 'img', data_src: 'lazy-src' })`
 * 读的就是 `data-lazy-src`（vanilla-lazyload 的 `data_src: "lazy-src"` 会拼成
 * `data-lazy-src`）。没这个属性，图会立刻加载而不是懒加载。
 * `class` 里带 `nolazyload` 的图（如 `#loading-box` 的加载头像、`#post-top-bg`）上游跳过。
 *
 * 为什么是「组件内 helper」而不是全局后处理：
 *   Astro 没有 Hexo 的 `after_render:html` 钩子；组件级是当前唯一能保证本阶段
 *   产物形状的手段。它只覆盖**本目录组件自己产出的 `<img>`**（导航下拉/侧栏
 *   返回菜单的小图标、footer 的 socialBar 头像）。
 *   Markdown 正文图、首页卡片封面等其它 `<img>` 的等价处理留给
 *   P2-7 / P2-8，全站统一（Astro integration 的 `astro:build:done` 重写 dist HTML
 *   是最贴近上游语义的做法）记在 P2-4 报告的「Phase 4 注意」里。
 */

import { readFlag, readString } from '../../config/theme-context.ts'
import type { ThemeConfig } from '../../config/schema.ts';

/** 上游 `post_lazyload.js` 的默认占位图（`theme.lazyload.placeholder` 为空时）。 */
const DEFAULT_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export interface LazyImageOptions {
  theme: ThemeConfig;
  /** 站点 `url_for()`，`theme.lazyload.placeholder` 需要过一遍。 */
  urlFor: (path?: string | null) => string;
}

/**
 * 返回 `<img>` 上要展开的属性。写法：
 *
 *   <img class="…" alt="…" {...lazyImageAttrs(icon, { theme, urlFor })} />
 *
 * 关闭 lazyload 时只返回 `{ src }`（与不启用该功能的站点一致）。
 */
export function lazyImageAttrs(
  src: string,
  options: LazyImageOptions,
): Record<string, string> {
  const { theme, urlFor } = options;
  const enabled = readFlag(theme.lazyload, 'enable') && readString(theme.lazyload, 'field') === 'site';
  if (!enabled) return { src };

  const placeholder = readString(theme.lazyload, 'placeholder', '');
  // 上游 `error_img.post_page` 直接进 onerror，不过 url_for
  const errorImage = readString(theme.error_img, 'post_page', '');

  return {
    src: placeholder ? urlFor(placeholder) : DEFAULT_PLACEHOLDER,
    onerror: `this.onerror=null,this.src="${errorImage}"`,
    'data-lazy-src': src,
  };
}
