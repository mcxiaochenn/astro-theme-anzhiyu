/**
 * search/render.mjs — 上游 `layout/includes/third-party/search/*.pug`（P5-1）。
 *
 * 映射：
 *   renderSearchIndex  ← index.pug:1-6        （algolia > local_search > docsearch 优先级）
 *   renderLocalSearch  ← local-search.pug:1-20（#local-search 弹层）
 *   renderAlgolia      ← algolia.pug:1-22     （#algolia-search 弹层 + tags）
 *   renderDocsearch    ← docsearch.pug:1-27   （.docsearch-wrap + 初始化脚本）
 *
 * 门控：`theme.local_search.enable` / `theme.algolia_search.enable` /
 * `theme.docsearch.enable`（三者默认全 false，故基准站 0 节点）。
 * 文案用 zh-CN 默认字面量（上游 `_p('search.*')`）。
 * 上游挂载点：layout.pug:86（rightside / nav_music 之后、rightmenu 之前）。
 */
import { asset, esc, flag, inlineScript, obj, styleLink, srcScript } from '../_kit.mjs'

const CLOSE_BUTTON =
  '<button class="search-close-button"><i class="anzhiyufont anzhiyu-icon-xmark"></i></button>'
const MASK = '<div id="search-mask"></div>'
/**
 * 搜索弹层在上游 pjax 的换页区域**之外**（layout.pug:86 的 third-party/search 整棵
 * 不随 #body-wrap/.js-pjax 交换），Algolia instantsearch / docsearch 的容器引用也
 * 绑在这些节点上。这里用 `data-astro-transition-persist` 把弹层标成常驻节点，
 * 等价复刻上游生命周期；属性本身走 diff-html N7（data-astro-* 整类丢弃），不影响
 * 基线 DOM 比对。`#search-button`（Header 子树）仍随页替换，由各搜索脚本换页重绑。
 */
const SEARCH_PERSIST = ' data-astro-transition-persist="search_overlay"'

/** local-search.pug:1-20 —— 完整弹层 DOM（上游无任何脚本，脚本在 additional-js.pug:49-50）。 */
export function renderLocalSearch(theme) {
  if (!flag(theme.local_search, 'enable')) return ''
  return (
    `<div id="local-search"${SEARCH_PERSIST}>` +
    '<div class="search-dialog">' +
    '<nav class="search-nav">' +
    '<span class="search-dialog-title">搜索</span>' +
    '<span id="loading-status"></span>' +
    CLOSE_BUTTON +
    '</nav>' +
    '<div id="loading-database" class="is-center">' +
    '<i class="anzhiyufont anzhiyu-icon-spinner anzhiyu-pulse-icon"></i>' +
    '<span>  数据库加载中</span>' +
    '</div>' +
    '<div class="search-wrap">' +
    '<div id="local-search-input">' +
    '<div class="local-search-box">' +
    '<input class="local-search-box--input" placeholder="搜索文章" type="text">' +
    '</div>' +
    '</div>' +
    '<hr>' +
    '<div id="local-search-results"></div>' +
    '</div>' +
    '</div>' +
    MASK +
    '</div>'
  )
}

/** algolia.pug:1-22 —— #algolia-hits 里的 tag-list 由 theme.algolia_search.tags 决定。 */
export function renderAlgolia(theme) {
  if (!flag(theme.algolia_search, 'enable')) return ''
  const tags = obj(theme.algolia_search).tags
  const tagLinks = Array.isArray(tags)
    ? tags
        .map((item) => {
          const name = String(item ?? '')
          return `<a class="tag-list" href="${esc('/tags/' + name)}" title="${esc(name)}">${esc(name)}</a>`
        })
        .join('')
    : ''
  return (
    `<div id="algolia-search"${SEARCH_PERSIST}>` +
    '<div class="search-dialog">' +
    '<nav class="search-nav">' +
    '<span class="search-dialog-title">搜索</span>' +
    CLOSE_BUTTON +
    '</nav>' +
    '<div class="search-wrap">' +
    '<div id="algolia-search-input"></div>' +
    '<hr>' +
    '<div id="algolia-search-results">' +
    `<div id="algolia-hits">${tagLinks}</div>` +
    '<div id="algolia-pagination"></div>' +
    '<div id="algolia-info"><div class="algolia-stats"></div><div class="algolia-poweredBy"></div></div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    MASK +
    '</div>'
  )
}

/** docsearch.pug:1-27 —— 读 theme.docsearch.appId/apiKey/indexName/option。 */
export function renderDocsearch(theme) {
  if (!flag(theme.docsearch, 'enable')) return ''
  const d = obj(theme.docsearch)
  const body = `(() => {
      docsearch(Object.assign({
        appId: ${JSON.stringify(d.appId ?? null)},
        apiKey: ${JSON.stringify(d.apiKey ?? null)},
        indexName: ${JSON.stringify(d.indexName ?? null)},
        container: '#docsearch',
      }, ${JSON.stringify(d.option ?? null)}))

      const handleClick = () => {
        document.querySelector('.DocSearch-Button').click()
      }

      const searchClickFn = () => {
        anzhiyu.addEventListenerPjax(document.querySelector('#search-button > .search'), 'click', handleClick)
      }

      searchClickFn()
      window.addEventListener('pjax:complete', searchClickFn)
    })()`
  return (
    `<div class="docsearch-wrap"${SEARCH_PERSIST}>` +
    '<div id="docsearch" style="display:none"></div>' +
    styleLink(asset(theme, 'docsearch_css')) +
    srcScript(asset(theme, 'docsearch_js')) +
    inlineScript(body) +
    '</div>'
  )
}

/** index.pug:1-6 —— 三选一（上游是 if / else if，不可同时输出）。 */
export function renderSearchIndex(theme) {
  if (flag(theme.algolia_search, 'enable')) return renderAlgolia(theme)
  if (flag(theme.local_search, 'enable')) return renderLocalSearch(theme)
  if (flag(theme.docsearch, 'enable')) return renderDocsearch(theme)
  return ''
}

export const searchRenderers = {
  index: renderSearchIndex,
  'local-search': renderLocalSearch,
  algolia: renderAlgolia,
  docsearch: renderDocsearch,
}
