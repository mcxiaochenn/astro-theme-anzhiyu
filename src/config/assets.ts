/**
 * assets.ts — 上游 `scripts/events/cdn.js` 的 Astro 复刻（P4-1）。
 *
 * 上游在 `before_generate` 里把 `theme.asset` 算成一张「资源键 → URL」的表，
 * 模板统一用 `url_for(theme.asset.xxx)` 取用：
 *
 *   1. `internalSrc`（主题自带 js）按 `CDN.internal_provider` 解析；
 *   2. `plugins.yml`（第三方库）按 `CDN.third_party_provider` 解析；
 *   3. `CDN.option` 里非 null 的键覆盖前两者。
 *
 * 这里刻意**不**在运行时读 YAML：`plugins.yml` 的 55 个条目在下面固化成常量，
 * 与上游 `plugins.yml`（1.7.1 / commit 72439d93）逐项一致。版本号也照抄，
 * 所以第三方 URL 与基线产物逐字节相同。
 *
 * 逐行对照（cdn.js:69-110）：
 *   - `minFile()`：只把**文件名末尾**的 `.js/.css` 换成 `.min.js/.min.css`，
 *     已经带 `.min` 的不重复加（负向后行断言）；
 *   - `cdnjs_file`：去掉开头的 `lib/`、`dist/`、`browser/` 段（正则里 `[lib|dist]`
 *     是字符类，上游原样保留，见 docs/reference/upstream-delta.md）；
 *   - internal 分支在算完 `cdnjs_file` 之后才给 `file` 加 `source/` 前缀，
 *     所以 `local` 用的是去掉 `source/` 的路径（`js/main.js`），
 *     而 jsdelivr 等 CDN 用的是 `source/js/main.min.js`；
 *   - internal 额外补一个 `main_css = 'css/index.css'`（没有 `source/` 前缀）。
 *
 * 取到的值是**未加站点前缀**的路径（`js/main.js` / `css/index.css`）或完整 URL，
 * 调用方仍需套 `url_for()`（`createUrlFor()`），与上游 pug 的写法一致。
 */
import type { ThemeConfig } from './schema.ts'

/** 上游主题包版本（`require('../../package.json').version`）。baseline 是 1.7.1。 */
export const INTERNAL_VERSION = '1.7.1'

/** 资源条目：`plugins.yml` 的一项。 */
export interface AssetEntry {
  name: string
  file: string
  version: string
  /** 上游 `other_name`：cdnjs 的库名（默认用 `name`）。 */
  other_name?: string
}

export type AssetMap = Record<string, string>

/**
 * 主题内部脚本（cdn.js:16-67）。`file` 是相对主题 `source/` 的路径。
 * `version` 在 local provider 下不参与 URL，但非 local 时决定 `@x.y.z`。
 */
const INTERNAL_SRC: Record<string, AssetEntry> = {
  main: { name: 'hexo-theme-anzhiyu', file: 'js/main.js', version: INTERNAL_VERSION },
  utils: { name: 'hexo-theme-anzhiyu', file: 'js/utils.js', version: INTERNAL_VERSION },
  translate: { name: 'hexo-theme-anzhiyu', file: 'js/tw_cn.js', version: INTERNAL_VERSION },
  local_search: {
    name: 'hexo-theme-anzhiyu',
    file: 'js/search/local-search.js',
    version: INTERNAL_VERSION,
  },
  algolia_js: {
    name: 'hexo-theme-anzhiyu',
    file: 'js/search/algolia.js',
    version: INTERNAL_VERSION,
  },
  random_friends_post_js: {
    name: 'hexo-theme-anzhiyu',
    file: 'js/anzhiyu/random_friends_post.js',
    version: INTERNAL_VERSION,
  },
  right_click_menu_js: {
    name: 'hexo-theme-anzhiyu',
    file: 'js/anzhiyu/right_click_menu.js',
    version: INTERNAL_VERSION,
  },
  comment_barrage_js: {
    name: 'hexo-theme-anzhiyu',
    file: 'js/anzhiyu/comment_barrage.js',
    version: INTERNAL_VERSION,
  },
  ai_abstract_js: {
    name: 'hexo-theme-anzhiyu',
    file: 'js/anzhiyu/ai_abstract.js',
    version: INTERNAL_VERSION,
  },
  people_js: {
    name: 'hexo-theme-anzhiyu',
    file: 'js/anzhiyu/people.js',
    version: INTERNAL_VERSION,
  },
}

/**
 * 第三方库（上游 `plugins.yml` 的固化副本，55 项）。
 * 更新上游依赖时同步这里，不要在运行时解析 YAML。
 */
export const THIRD_PARTY_SRC: Record<string, AssetEntry> = {
  algolia_search: { name: 'algoliasearch', file: 'dist/algoliasearch-lite.umd.js', version: '4.18.0' },
  instantsearch: { name: 'instantsearch.js', file: 'dist/instantsearch.production.min.js', version: '4.84.0' },
  docsearch_js: { name: '@docsearch/js', file: 'dist/umd/index.js', version: '4.3.2', other_name: 'docsearch-js' },
  docsearch_css: { name: '@docsearch/css', file: 'dist/style.css', version: '4.3.2', other_name: 'docsearch-css' },
  pjax: { name: 'pjax', file: 'pjax.min.js', version: '0.2.8' },
  blueimp_md5: { name: 'blueimp-md5', file: 'js/md5.min.js', version: '2.19.0' },
  valine: { name: 'valine', file: 'dist/Valine.min.js', version: '1.5.1' },
  twikoo: { name: 'twikoo', file: 'dist/twikoo.all.min.js', version: '1.6.44' },
  waline_js: { name: '@waline/client', file: 'dist/waline.js', version: '3.8.0', other_name: 'waline' },
  waline_css: { name: '@waline/client', file: 'dist/waline.css', version: '3.8.0', other_name: 'waline' },
  waline_meta_css: { name: '@waline/client', file: 'dist/waline-meta.css', version: '3.8.0', other_name: 'waline' },
  sharejs: { name: 'butterfly-extsrc', file: 'sharejs/dist/js/social-share.min.js', version: '1.1.3' },
  sharejs_css: { name: 'butterfly-extsrc', file: 'sharejs/dist/css/share.min.css', version: '1.1.3' },
  mathjax: { name: 'mathjax', file: 'es5/tex-mml-chtml.js', version: '4.0.0' },
  katex: { name: 'katex', file: 'dist/katex.min.css', version: '0.16.25', other_name: 'KaTeX' },
  katex_copytex: { name: 'katex', file: 'dist/contrib/copy-tex.min.js', version: '0.16.25', other_name: 'KaTeX' },
  mermaid: { name: 'mermaid', file: 'dist/mermaid.min.js', version: '11.12.2' },
  canvas_ribbon: { name: 'butterfly-extsrc', file: 'dist/canvas-ribbon.min.js', version: '1.1.3' },
  canvas_fluttering_ribbon: { name: 'butterfly-extsrc', file: 'dist/canvas-fluttering-ribbon.min.js', version: '1.1.3' },
  canvas_nest: { name: 'butterfly-extsrc', file: 'dist/canvas-nest.min.js', version: '1.1.3' },
  activate_power_mode: { name: 'butterfly-extsrc', file: 'dist/activate-power-mode.min.js', version: '1.1.3' },
  fireworks: { name: 'butterfly-extsrc', file: 'dist/fireworks.min.js', version: '1.1.3' },
  click_heart: { name: 'butterfly-extsrc', file: 'dist/click-heart.min.js', version: '1.1.3' },
  ClickShowText: { name: 'butterfly-extsrc', file: 'dist/click-show-text.min.js', version: '1.1.3' },
  lazyload: { name: 'vanilla-lazyload', file: 'dist/lazyload.iife.min.js', version: '19.1.3' },
  instantpage: { name: 'instant.page', file: 'instantpage.js', version: '5.2.0' },
  typed: { name: 'typed.js', file: 'dist/typed.umd.js', version: '2.1.0' },
  pangu: { name: 'pangu', file: 'dist/browser/pangu.min.js', version: '4.0.7' },
  fancybox_css: { name: '@fancyapps/ui', file: 'dist/fancybox/fancybox.css', version: '6.1.6', other_name: 'fancyapps-ui' },
  fancybox: { name: '@fancyapps/ui', file: 'dist/fancybox/fancybox.umd.js', version: '6.1.6', other_name: 'fancyapps-ui' },
  medium_zoom: { name: 'medium-zoom', file: 'dist/medium-zoom.min.js', version: '1.1.0' },
  snackbar_css: { name: 'node-snackbar', file: 'dist/snackbar.min.css', version: '0.1.16' },
  snackbar: { name: 'node-snackbar', file: 'dist/snackbar.min.js', version: '0.1.16' },
  fontawesome: { name: '@fortawesome/fontawesome-free', file: 'css/all.min.css', version: '7.1.0', other_name: 'font-awesome' },
  flickr_justified_gallery_js: { name: 'flickr-justified-gallery', file: 'dist/fjGallery.min.js', version: '2.2.0' },
  flickr_justified_gallery_css: { name: 'flickr-justified-gallery', file: 'dist/fjGallery.css', version: '2.2.0' },
  aplayer_css: { name: 'anzhiyu-theme-static', file: 'aplayer/APlayer.min.css', version: '1.0.0' },
  aplayer_js: { name: 'anzhiyu-blog-static', file: 'js/APlayer.min.js', version: '1.0.1' },
  meting_js: { name: 'hexo-anzhiyu-music', file: 'assets/js/Meting2.min.js', version: '1.0.1' },
  prismjs_js: { name: 'prismjs', file: 'prism.js', version: '1.30.0', other_name: 'prism' },
  prismjs_lineNumber_js: { name: 'prismjs', file: 'plugins/line-numbers/prism-line-numbers.min.js', version: '1.30.0', other_name: 'prism' },
  prismjs_autoloader: { name: 'prismjs', file: 'plugins/autoloader/prism-autoloader.min.js', version: '1.30.0', other_name: 'prism' },
  artalk_js: { name: 'artalk', file: 'dist/Artalk.js', version: '2.9.1' },
  artalk_css: { name: 'artalk', file: 'dist/Artalk.css', version: '2.9.1' },
  pace_js: { name: 'pace-js', file: 'pace.min.js', version: '1.2.4', other_name: 'pace' },
  pace_default_css: { name: 'anzhiyu-theme-static', file: 'progress_bar/progress_bar.css', version: '1.1.10' },
  coin_js: { name: 'anzhiyu-theme-static', file: 'coin/coin.js', version: '1.0.0' },
  coin_css: { name: 'anzhiyu-theme-static', file: 'coin/coin.min.css', version: '1.0.0' },
  countup_js: { name: 'anzhiyu-theme-static', file: 'countup/countup.js', version: '1.0.0' },
  gsap_js: { name: 'anzhiyu-theme-static', file: 'gsap/gsap.min.js', version: '1.0.0' },
  rightmenu: { name: 'anzhiyu-theme-static', file: 'rightmenu/rightmenu.js', version: '1.0.0' },
  waterfall: { name: 'anzhiyu-theme-static', file: 'waterfall/waterfall.js', version: '1.0.0' },
  ali_iconfont_css: { name: 'anzhiyu-theme-static', file: 'icon/ali_iconfont_css.css', version: '1.1.9' },
  accesskey_js: { name: 'anzhiyu-theme-static', file: 'accesskey/accesskey.js', version: '1.1.5' },
  colorthief: { name: 'colorthief', file: 'dist/color-thief.umd.min.js', version: '2.6.0' },
}

/** cdn.js:69-71 —— 只替换文件名末尾的 `.js/.css`，`.min.js` 不再加一次。 */
function minFile(file: string): string {
  return file.replace(/(?<!\.min)\.(js|css)$/g, (ext) => `.min${ext}`)
}

/** cdn.js:77-78 —— cdnjs 的库名与去前缀路径（字符类 `[lib|dist]` 原样保留）。 */
function cdnjsFile(file: string): string {
  return file.replace(/^[lib|dist]*\/|browser\//g, '')
}

/** cdn.js:73-110 —— 把一组条目解析成 URL 表。 */
function createCDNLink(
  data: Record<string, AssetEntry>,
  type: string,
  cdn: { version?: boolean; custom_format?: unknown },
  cond = '',
): AssetMap {
  const out: AssetMap = {}
  const customFormat = typeof cdn.custom_format === 'string' ? cdn.custom_format : ''

  for (const key of Object.keys(data)) {
    const { name, version, other_name } = data[key]
    let file = data[key].file

    const cdnjsName = other_name || name
    const strippedCdnjsFile = cdnjsFile(file)
    const minCdnjsFile = minFile(strippedCdnjsFile)
    if (cond === 'internal') file = `source/${file}`
    const min_file = minFile(file)
    const verType = cdn.version ? `@${version}` : ''

    const value: Record<string, string> = {
      version,
      name,
      file,
      cdnjs_file: strippedCdnjsFile,
      min_file,
      min_cdnjs_file: minCdnjsFile,
      cdnjs_name: cdnjsName,
    }

    const cdnSource: Record<string, string> = {
      local: cond === 'internal' ? strippedCdnjsFile : `/pluginsSrc/${name}/${file}`,
      jsdelivr: `https://cdn.jsdelivr.net/npm/${name}${verType}/${min_file}`,
      unpkg: `https://unpkg.com/${name}${verType}/${file}`,
      cdnjs: `https://cdnjs.cloudflare.com/ajax/libs/${cdnjsName}/${version}/${minCdnjsFile}`,
      elemecdn: `https://npm.elemecdn.com/${name}${verType}/${file}`,
      onmicrosoft: `https://npm.onmicrosoft.cn/${name}${verType}/${file}`,
      cbd: `https://cdn.cbd.int/${name}${verType}/${file}`,
      anheyu: `https://cdn.anheyu.com/npm/${name}${verType}/${min_file}`,
      custom: customFormat.replace(/\$\{(.+?)\}/g, (_match, token: string) => value[token] ?? ''),
    }

    if (cdnSource[type] !== undefined) out[key] = cdnSource[type]
  }

  if (cond === 'internal') out.main_css = 'css/index.css'
  return out
}

/** cdn.js:113-119 —— 去掉 `CDN.option` 里值为 null 的键。 */
function withoutNullValues(option: unknown): Record<string, string> {
  if (!option || typeof option !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(option as Record<string, unknown>)) {
    if (value !== null && value !== undefined) out[key] = String(value)
  }
  return out
}

/**
 * 计算整张资源表（等价于上游构建后得到的 `theme.asset`）。
 *
 * 键集合 = internalSrc ∪ thirdPartySrc ∪ CDN.option（非 null），后者覆盖前者。
 */
export function resolveAssets(theme: ThemeConfig): AssetMap {
  const cdn = theme.CDN
  return Object.assign(
    createCDNLink(INTERNAL_SRC, cdn.internal_provider, cdn, 'internal'),
    createCDNLink(THIRD_PARTY_SRC, cdn.third_party_provider, cdn),
    withoutNullValues(cdn.option),
  )
}
