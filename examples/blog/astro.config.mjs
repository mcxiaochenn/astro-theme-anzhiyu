import { defineConfig } from 'astro/config'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import { stylusHexoConfig } from 'vite-plugin-stylus-hexo-config'
// Phase 6：Hexo `{% tag %}` 语法。P6-1 交付行内 12 + 块级 12（含 hideInline）。
// 放在 packages/ 里按源码相对导入：插件是纯 ESM `.mjs`，没有构建步骤，
// Astro 配置在 Node 侧直接 import 即可（见 docs/notes/P6-1-hexo-tags.md）。
import remarkHexoTag, { rehypeHexoInlineP } from '../../packages/remark-hexo-tag/src/index.mjs'
// P7-6：主题自有静态资源（/js/main.js、/js/utils.js、/js/tw_cn.js、/js/anzhiyu/*、
// /js/search/*、/css/index.css 占位）过去是手工放在 examples/blog/public/ 里的，
// 迁移站拿不到 → 全站 JS 404。现在资源收进主题包 assets/，由 integration 在
// build 时复制进 dist、dev 时用 connect 中间件直出，站点不再需要 public/js。
//
// 这里用**相对路径**而不是 `astro-theme-anzhiyu/integration`：examples/blog 没有
// 声明 astro-theme-anzhiyu 依赖（它一直都是按源码相对导入主题包的），根 node_modules
// 里也没有这个包，裸包名会 ERR_MODULE_NOT_FOUND。迁移产物 package.json 里有
// `"astro-theme-anzhiyu": "file:../../packages/astro-theme-anzhiyu"`，所以
// migrate-hexo 把这一行改写成相对路径后两种站都能解析（见 docs/notes/P7-6-theme-assets.md §5）。
import anzhiyuAssets from '../../packages/astro-theme-anzhiyu/integration.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))

/* ================================================================== */
/* M1 · 代码块 DOM 对齐（P2-7）                                        */
/* ================================================================== */
/*
 * 上游链路（Hexo 7 + hexo-theme-anzhiyu 1.7.1）：
 *   1. `hexo/dist/plugins/filter/before_post_render/backtick_code_block.js` 在 Markdown
 *      渲染**之前**把 ```lang 围栏整段换成 `<hexoPostRenderCodeBlock>` + 高亮产物；
 *   2. 高亮本身是 hexo-util 的 `highlight()`（`syntax_highlighter: highlight.js`，
 *      `highlight: { line_number: true, wrap: true, hljs: false }`），输出：
 *
 *        <figure class="highlight js"><table><tr>
 *          <td class="gutter"><pre><span class="line">1</span><br>…</pre></td>
 *          <td class="code"><pre><span class="line">…</span><br>…</pre></td>
 *        </tr></table></figure>
 *
 *   3. 词法着色用 highlight.js 11（`classPrefix: ''`、`ignoreIllegals: true`），
 *      类名形如 `keyword` / `title function_` / `punctuation`；每个 token span 在行尾
 *      闭合、行首重开（hexo-util 的 `closeTags()`），所以每一行都是自洽的。
 *   `source/css/_highlight/*.styl` 全部按 `figure.highlight` + 这套类名写选择器。
 *
 * Astro 侧：Shiki 的结构（`<pre class="astro-code">` + 内联 style）在这里永远对不上，
 * 也没法通过主题配置改成 hljs 类名，所以：
 *   - `markdown.syntaxHighlight: false` → remark-rehype 先产出 `<pre><code class="language-x">`；
 *   - 本 rehype 插件在字符串化之前把它改写成上面的 `figure.highlight` DOM。
 *
 * highlight.js 依赖：它是「词法着色」的唯一正确实现（上游用的就是同一个库、同一套类名）。
 * 2026-11 这一轮 P2-7 的写范围没有 `examples/blog/package.json`，依赖仍待组长批准加入；
 * 未安装时本插件**降级为结构等价**（figure/table/gutter/行号/`span.line`/`br` 全部一致，
 * 只是行内没有 token span），并在构建日志里警告一次。装上 `highlight.js`（^11）后
 * 无需改代码即自动补齐 token span，证据见 docs/notes/P2-7-home-postcard.md §5。
 */

/** 构建期只加载一次 highlight.js；缺失时返回 null（降级分支）。 */
let highlightJsPromise
function loadHighlightJs() {
  if (!highlightJsPromise) {
    highlightJsPromise = import('highlight.js')
      .then((mod) => mod.default ?? mod)
      .catch(() => {
        console.warn(
          '[hexo-highlight] 未安装 highlight.js：代码块输出 figure.highlight 结构但缺少 hljs token span。' +
            '装上 highlight.js@^11 后自动补齐（上游 hexo-util 3.3.0 依赖的同一实现）。',
        )
        return null
      })
  }
  return highlightJsPromise
}

/** HAST 节点的纯文本内容。 */
function textOf(node) {
  if (!node) return ''
  if (node.type === 'text') return node.value
  if (Array.isArray(node.children)) return node.children.map(textOf).join('')
  return ''
}

/** strip-indent 的等价实现（hexo-util 默认 `stripIndent: true`）。 */
function stripIndent(value) {
  const matches = value.match(/^[ \t]*(?=\S)/gm)
  if (!matches) return value
  const indent = Math.min(...matches.map((line) => line.length))
  if (indent === 0) return value
  return value.replace(new RegExp(`^[ \\t]{${indent}}`, 'gm'), '')
}

/** hljs/hexo 只转义这几种实体，其余按原文处理（HAST 里存解码后的文本）。 */
function decodeHljsEntities(value) {
  return value.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, name) => {
    switch (name) {
      case 'amp':
        return '&'
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'quot':
        return '"'
      default:
        return "'"
    }
  })
}

const element = (tagName, properties = {}, children = []) => ({
  type: 'element',
  tagName,
  properties,
  children,
})
const text = (value) => ({ type: 'text', value })

/** hexo-util `closeTags()`：hljs 的 token span 可以跨行，逐行闭合再逐行重开。 */
function closeTagsPerLine(value) {
  const stack = []
  return value
    .split('\n')
    .map((line) => {
      const prepend = stack.map((token) => `<span class="${token}">`).join('')
      for (const match of line.matchAll(/(<span class="(.*?)">|<\/span>)/g)) {
        if (match[0] === '</span>') stack.shift()
        else stack.unshift(match[2])
      }
      return prepend + line + '</span>'.repeat(stack.length)
    })
    .join('\n')
}

/** 把 `<span class="token">…</span>` 片段转成 HAST 子节点（hljs 只会产出 span + 文本）。 */
function tokenHtmlToHast(html) {
  const root = { children: [] }
  const stack = [root]
  const re = /<span class="([^"]*)">|<\/span>|([^<]+)/g
  let match
  while ((match = re.exec(html))) {
    if (match[0] === '</span>') {
      if (stack.length > 1) stack.pop()
      continue
    }
    if (match[1] !== undefined) {
      const node = element('span', {
        className: decodeHljsEntities(match[1]).split(/\s+/).filter(Boolean),
      })
      stack[stack.length - 1].children.push(node)
      stack.push(node)
      continue
    }
    if (match[2]) stack[stack.length - 1].children.push(text(decodeHljsEntities(match[2])))
  }
  return root.children
}

/**
 * 计算一个代码块的行内容：
 *   - highlight.js 可用 → 每行 `span.line` 内含 hljs token span；
 *   - 不可用 → 每行 `span.line` 只有原文（结构等价、无着色）。
 */
async function buildCodeLines(code, language) {
  const hljs = await loadHighlightJs()
  const hasLanguage = language && hljs && hljs.getLanguage(language)
  // hexo-util：未知/缺省语言一律落到 plaintext；降级模式下没有语言表，保留原名（见报告 §5 限制）
  const resolvedLanguage = hasLanguage ? language : hljs ? 'plaintext' : language || 'plaintext'
  if (hljs) {
    hljs.configure({ classPrefix: '' })
    try {
      const highlighted = hljs.highlight(code, {
        language: resolvedLanguage,
        ignoreIllegals: true,
      }).value
      return {
        language: resolvedLanguage,
        html: true,
        lines: closeTagsPerLine(highlighted).split('\n'),
      }
    } catch {
      /* 词法失败时退回纯文本行（上游 hexo-util 不会失败，这里只为构建不中断） */
    }
  }
  return { language: resolvedLanguage, html: false, lines: code.split('\n') }
}

/** `<pre><code class="language-x">` → 上游 `figure.highlight`。 */
function rehypeHexoHighlight() {
  return async (tree) => {
    const replaceCode = async (pre) => {
      const codeNode =
        pre.children.length === 1 &&
        pre.children[0].type === 'element' &&
        pre.children[0].tagName === 'code'
          ? pre.children[0]
          : null
      if (!codeNode) return null

      const className = codeNode.properties?.className
      const classes = Array.isArray(className) ? className : className ? [className] : []
      const languageClass = classes.find(
        (name) => typeof name === 'string' && name.startsWith('language-'),
      )
      const requestedLanguage = languageClass ? languageClass.slice('language-'.length) : ''

      // Hexo：content 去掉一个行尾换行再交给 highlight()（backtick_code_block.js:27）
      const raw = textOf(codeNode).replace(/\n$/, '')
      const source = stripIndent(raw)
      const { language, html, lines } = await buildCodeLines(source, requestedLanguage)

      const gutter = element('pre', {}, lines.flatMap((_, index) => [
        element('span', { className: ['line'] }, [text(String(index + 1))]),
        element('br'),
      ]))
      const code = element('pre', {}, lines.flatMap((line) => {
        const children = html ? tokenHtmlToHast(line) : [text(line)]
        return [element('span', { className: ['line'] }, children), element('br')]
      }))

      return element('figure', { className: ['highlight', language] }, [
        element('table', {}, [
          element('tr', {}, [
            element('td', { className: ['gutter'] }, [gutter]),
            element('td', { className: ['code'] }, [code]),
          ]),
        ]),
      ])
    }

    /** 递归替换（异步，逐个 `pre` 处理；tree 里其它节点原样保留）。 */
    const walk = async (node) => {
      if (!Array.isArray(node.children)) return
      for (let index = 0; index < node.children.length; index++) {
        const child = node.children[index]
        if (child.type === 'element' && child.tagName === 'pre') {
          const replacement = await replaceCode(child)
          if (replacement) {
            node.children[index] = replacement
            continue
          }
        }
        await walk(child)
      }
    }
    await walk(tree)
  }
}

/**
 * `rehype-raw`（Astro 管线里固定的最后一步 rehype）会把整棵树交给 parse5 重新解析；
 * HTML 解析规则会把 `<table><tr>` 补成 `<table><tbody><tr>`。上游 hexo-util 的
 * `figure.highlight` 是字符串拼接产物，**没有** tbody，`_highlight/*.styl` 也按没有 tbody 写。
 *
 * Astro 没有「rehype-raw 之后」的插件位，所以在处理器外层对 HTML 字符串做一次精确还原：
 * 只摘掉 `<figure class="highlight…"><table>` 里面的那一层 tbody（Markdown 表格的 tbody
 * 是上游 marked 也有的，不能动）。
 */
function unwrapFigureTbody(html) {
  return html.replace(
    /(<figure class="highlight[^"]*"><table>)<tbody>([\s\S]*?)<\/tbody>(<\/table><\/figure>)/g,
    '$1$2$3',
  )
}

/**
 * 自定义 Markdown 处理器：等价于 `unified({ smartypants: false, rehypePlugins: [...] })`，
 * 额外只在 `render()` 外面套一层 {@link unwrapFigureTbody}。
 *
 * 为什么不用 `unified()` helper：它只接受 remark/rehype 插件，插件一律跑在 rehype-raw 之前，
 * 拿不到「解析后」的时机；而 tbody 是 rehype-raw 注入的。见文件头「M1」说明。
 */
const hexoMarkdownProcessor = {
  name: 'anzhiyu-hexo-unified',
  async createRenderer(shared) {
    const renderer = await createMarkdownProcessor({
      ...shared,
      // 与 unified({...}) 相同：smartypants 必须是 false（Hexo hexo-renderer-marked 的默认）
      smartypants: false,
      // Shiki 的高亮结构与类名都对不上上游 highlight.js，关掉后由 rehypeHexoHighlight 重建
      syntaxHighlight: false,
      // Phase 6 的 42 个 Hexo tag 语法插件挂在这里（remark 阶段，解析 `{% … %}`）；
      // 顶层 `markdown.remarkPlugins` 是 Astro 的 legacy 入口，对自定义处理器不生效
      // （Astro 只会打印一条警告并忽略，见 astro/dist/core/config/validate.js:79-83）。
      //
      // P6-1：manifest 里行内 12 + 块级 12 个 tag 已实现；media/thirdparty 两组
      // 仍原样透传（warning），等 P6-2 / P6-3 填 handler。
      // `noteStyle` 对齐 theme.config.yml 的 `note.style`（当前为 flat）。
      remarkPlugins: [[remarkHexoTag, { noteStyle: 'flat' }]],
      // M1：`<pre><code class="language-x">` → 上游 `figure.highlight`
      //
      // `rehypeHexoInlineP`：把句中的 `{% p %}` 从外层段落里拆成兄弟节点。
      // 用户 rehype 插件在 `rehype-raw`（parse5）**之前**执行，此时 tag 的 HTML
      // 还是 raw 节点；不拆的话 parse5 会在末尾凭空补一个空 `<p></p>`，
      // 与基准归一化结果对不上（见 packages/remark-hexo-tag/src/rehype-inline-p.mjs）。
      rehypePlugins: [rehypeHexoHighlight, rehypeHexoInlineP],
    })
    return {
      async render(content, opts) {
        const result = await renderer.render(content, opts)
        return { ...result, code: unwrapFigureTbody(result.code) }
      },
    }
  },
}

/* ================================================================== */
/* P7-1 · PWA（默认关闭；`ANZHIYU_PWA=1` 才接线）                       */
/* ================================================================== */
/*
 * 上游链路：hexo-theme-anzhiyu 自己**不**生成 Service Worker —— 主题只输出
 * manifest 相关的 head 标签（layout/includes/head/pwa.pug），SW 由外部 hexo-swpp
 * 插件按 _research/anzhiyu-upstream/sw-rules.js 生成。这里用官方 @vite-pwa/astro
 * （2.0.4，peerDependencies 写明 astro ^5 || ^6 || ^7）复刻同一套语义：
 *
 *   上游 sw-rules.js                                → 本文件
 *   ─────────────────────────────────────────────────────────────────────
 *   serviceWorker.cacheName = AnZhiYuThemeCache     → PWA_CACHE_NAME
 *   cacheRules.simple（/404.html、/css/index.css）  → generateSW.globPatterns（预缓存）
 *   cacheRules.cdn（7 个 host + .js/.css/woff…）    → PWA_RUNTIME_CACHING[0]
 *   external.stable[1][2]（cdn.cbd.int/jsdelivr）   → PWA_RUNTIME_CACHING[1..2]
 *   external.stable[0]（npm.elemecdn.com）          → PWA_SPARE_URLS_SW（追加进 dist/sw.js）
 *   getSpareUrls（elemecdn→cdn.cbd.int，timeout 3s）→ PWA_SPARE_URLS_SW
 *   json.merge / dom.onsuccess / skipRequest        → 未实现（原因见 docs/notes/P7-1-pwa.md §3）
 *
 * 门控与降级（硬约束）：
 *   - 不设 ANZHIYU_PWA 时**不加载** @vite-pwa/astro，也就没有任何产物/HTML 变化
 *     （Phase 2 基线 diff 48/48 PASS 0 差异不受影响）；
 *   - 迁移站（migrate-hexo 直接复制本文件）package.json 里没有 @vite-pwa/astro。
 *     动态 import 失败只 warn、不抛错，迁移站即使设了 ANZHIYU_PWA=1 也能正常构建。
 */
const PWA_ENABLED = process.env.ANZHIYU_PWA === '1'
/** 上游 `serviceWorker.cacheName`，所有运行时缓存共用这一个 Cache Storage 桶。 */
const PWA_CACHE_NAME = 'AnZhiYuThemeCache'
/** 上游 `pwa.pwa.theme_color` 在 theme.config.yml 里是 `var(--anzhiyu-main)`，这里取实际值。 */
const PWA_THEME_COLOR = '#425AEF'
const PWA_BACKGROUND_COLOR = '#f7f9fe'

/**
 * 上游 `cacheRules.cdn`：下面 7 个 host 上的静态资源做运行时缓存。
 * `npm.elemecdn.com` 故意排除 —— 它由 getSpareUrls 补丁接管（先查缓存、
 * 3s 超时回退 cdn.cbd.int），Workbox 路由和补丁不能抢同一个请求。
 */
const PWA_CDN_RUNTIME_PATTERN =
  /^https:\/\/(?:cdn\.cbd\.int|lf26-cdn-tos\.bytecdntp\.com|lf6-cdn-tos\.bytecdntp\.com|lf3-cdn-tos\.bytecdntp\.com|lf9-cdn-tos\.bytecdntp\.com|cdn\.staticfile\.org)\/[^?#]*\.(?:js|css|woff2|woff|ttf|cur)(?:\?[^#]*)?$/

/** 上游 external.stable 的后两条（elemecdn 那条见 PWA_SPARE_URLS_SW）。 */
const PWA_EXTERNAL_STABLE_PATTERNS = [
  /^https:\/\/cdn\.cbd\.int\/[^/@]+\@[^/@]+\/[^/]+\/[^/]+$/,
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/[^/@]+\@[^/@]+\/[^/]+\/[^/]+$/,
]

/** 运行时缓存统一用上游 cacheName（与 Workbox 预缓存桶 workbox-precache-v2-* 分开）。 */
const PWA_RUNTIME_CACHING = [
  {
    // cacheRules.cdn
    urlPattern: PWA_CDN_RUNTIME_PATTERN,
    handler: 'CacheFirst',
    options: {
      cacheName: PWA_CACHE_NAME,
      expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
  ...PWA_EXTERNAL_STABLE_PATTERNS.map((urlPattern) => ({
    // external.stable：带版本号的 URL 内容稳定，CacheFirst 即可
    urlPattern,
    handler: 'CacheFirst',
    options: {
      cacheName: PWA_CACHE_NAME,
      expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      cacheableResponse: { statuses: [0, 200] },
    },
  })),
]

/**
 * 追加在 Workbox 生成的 dist/sw.js 末尾的补丁（见文件头映射表）：
 * 上游 `getSpareUrls()` 只对 `https://npm.elemecdn.com/...` 生效，
 * 返回 `{ timeout: 3000, list: [原始 URL, cdn.cbd.int + 同 pathname] }`。
 * Workbox generateSW 的 runtimeCaching 表达不了「超时后换 URL 重试」，
 * 所以用一段独立的 fetch 监听补在生成代码之后：
 *   1. 只接管 GET + origin 为 npm.elemecdn.com 的请求（别的请求原样交给 Workbox）；
 *   2. 先查 Cache Storage（桶名 = 上游 cacheName）；
 *   3. 原始 URL 3s 超时/失败 → 用 cdn.cbd.int 同 path 再取，成功则写回缓存。
 */
const PWA_SPARE_URLS_SW = `
/* ===== P7-1-SPARE-URLS · 上游 sw-rules.js getSpareUrls() 翻译 ===== */
;(function () {
  var CACHE_NAME = '${PWA_CACHE_NAME}'
  var TIMEOUT_MS = 3000
  var SOURCE_ORIGIN = 'https://npm.elemecdn.com'
  var SPARE_ORIGIN = 'https://cdn.cbd.int'

  function fetchWithTimeout(request) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error('P7-1: 原始 URL 超时 ' + TIMEOUT_MS + 'ms'))
      }, TIMEOUT_MS)
      fetch(request).then(
        function (response) {
          clearTimeout(timer)
          resolve(response)
        },
        function (error) {
          clearTimeout(timer)
          reject(error)
        },
      )
    })
  }

  self.addEventListener('fetch', function (event) {
    if (event.request.method !== 'GET') return
    var url = new URL(event.request.url)
    if (url.origin !== SOURCE_ORIGIN) return
    event.respondWith(
      (async function () {
        var cache = await caches.open(CACHE_NAME)
        var cached = await cache.match(event.request)
        if (cached) return cached
        var response
        try {
          response = await fetchWithTimeout(event.request)
        } catch (error) {
          response = await fetch(SPARE_ORIGIN + url.pathname + url.search)
        }
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(event.request, response.clone()).catch(function () {})
        }
        return response
      })(),
    )
  })
})()
`

/** 上游 theme.config.yml 的 pwa.manifest 指向的图标（都在 examples/blog/public/img/siteicon/）。 */
const PWA_MANIFEST = {
  // 站点身份暂时与 src/data/site-identity.ts 的默认值保持一致（Phase 7 之前没有站点配置层）
  name: 'AnZhiYu Baseline',
  short_name: 'AnZhiYu',
  description: 'hexo-theme-anzhiyu 1.7.1 在固定内容与固定配置下的参考构建',
  lang: 'zh-CN',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: PWA_THEME_COLOR,
  background_color: PWA_BACKGROUND_COLOR,
  icons: [
    {
      src: '/img/siteicon/manifest-icon-192.maskable.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/img/siteicon/manifest-icon-512.maskable.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/img/siteicon/apple-icon-180.png',
      sizes: '180x180',
      type: 'image/png',
      purpose: 'any',
    },
  ],
}

/**
 * @vite-pwa/astro 的构建后補丁 integration：
 *   1. 把 PWA_SPARE_URLS_SW 追加进 Workbox 生成的 dist/sw.js；
 *   2. 给每个 dist/*.html 注入 `<link rel="manifest">`、theme-color meta 和 SW 注册脚本。
 *
 * 为什么用构建后处理而不是 `injectRegister`：Astro 的 SSG 页面不经过 Vite 的
 * index.html 管道（`transformIndexHtml` 不执行），@vite-pwa/astro 的自动注入对
 * Astro 路由无效，实测见 docs/notes/P7-1-pwa.md §4。
 */
function anzhiyuPwaExtras() {
  let baseUrl = '/'
  return {
    name: 'anzhiyu-pwa-extras',
    hooks: {
      'astro:config:done': ({ config }) => {
        const base = config.base || '/'
        baseUrl = base.endsWith('/') ? base : `${base}/`
      },
      'astro:build:done': ({ dir, logger }) => {
        const outDir = fileURLToPath(dir)
        const swPath = path.join(outDir, 'sw.js')
        const manifestPath = path.join(outDir, 'manifest.webmanifest')

        // [1/2] getSpareUrls：追加进生成的 SW（放在 Workbox 代码之后，注册顺序不重要）
        if (!existsSync(swPath)) {
          logger.warn(`[P7-1 PWA] 没找到 ${swPath}，跳过 sw-rules 补丁`)
          return
        }
        const generatedSw = readFileSync(swPath, 'utf8')
        if (!generatedSw.includes('P7-1-SPARE-URLS')) {
          writeFileSync(swPath, `${generatedSw}\n${PWA_SPARE_URLS_SW}`, 'utf8')
        }

        // [2/2] manifest link + 注册脚本：Astro 静态页面逐个注入。
        // 只注入 <link rel="manifest">：默认 head 里已有主题色 meta（P2-3 移植的
        // meta_theme_color），再注入一条 theme-color 会重复；manifest 里的
        // theme_color 才是 PWA 安装态用的值（上游 pwa.pug 的 msapplication-TileColor
        // 依赖 theme.pwa 配置层，见 docs/notes/P7-1-pwa.md §3 #10）。
        const manifestHref = `${baseUrl}manifest.webmanifest`
        const swUrl = `${baseUrl}sw.js`
        const headTags = `<link rel="manifest" href="${manifestHref}">`
        const registerScript =
          `<script>/* P7-1 PWA：注册 Service Worker（上游 pwa.pug 里被注释掉的那段） */` +
          `if('serviceWorker' in navigator){window.addEventListener('load',function(){` +
          `navigator.serviceWorker.register('${swUrl}').catch(function(error){` +
          `console.warn('[AnZhiYu PWA] Service Worker 注册失败',error)})})}</script>`

        const htmlFiles = []
        const walk = (directory) => {
          for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const fullPath = path.join(directory, entry.name)
            if (entry.isDirectory()) walk(fullPath)
            else if (entry.name.endsWith('.html')) htmlFiles.push(fullPath)
          }
        }
        walk(outDir)
        let injected = 0
        for (const file of htmlFiles) {
          let html = readFileSync(file, 'utf8')
          if (html.includes('rel="manifest"')) continue
          if (!html.includes('</head>') || !html.includes('</body>')) continue
          html = html
            .replace('</head>', `${headTags}</head>`)
            .replace('</body>', `${registerScript}</body>`)
          writeFileSync(file, html, 'utf8')
          injected++
        }

        const swBytes = statSync(swPath).size
        const manifestBytes = existsSync(manifestPath) ? statSync(manifestPath).size : 0
        // Workbox v8 生成的 SW 里预缓存清单形如 [{url:`…`,revision:null}, …]
        const precacheEntries = (readFileSync(swPath, 'utf8').match(/\{url:/g) || []).length
        logger.info(
          `[P7-1 PWA] sw.js=${swBytes}B manifest.webmanifest=${manifestBytes}B ` +
            `precache=${precacheEntries} 条 cacheName=${PWA_CACHE_NAME} ` +
            `注入 manifest/注册脚本 ${injected}/${htmlFiles.length} 个 HTML`,
        )
      },
    },
  }
}

/**
 * PWA integration 列表：默认空（产物与 Phase 2 基线一致）。ANZHIYU_PWA=1 时动态
 * 加载 @vite-pwa/astro；缺包（迁移站）或加载失败只 warn，不中断构建。
 * 用顶层 await：Astro/Vite 的配置加载器支持 ESM 配置的 TLA。
 */
let pwaIntegrations = []
if (PWA_ENABLED) {
  try {
    const { AstroPWAIntegration } = await import('@vite-pwa/astro')
    pwaIntegrations = [
      AstroPWAIntegration({
        strategies: 'generateSW',
        // autoUpdate = skipWaiting + clientsClaim：首访 SW 装好即接管页面，离线用例免二次刷新
        registerType: 'autoUpdate',
        // 注册脚本由上面的 anzhiyuPwaExtras() 注入（Astro SSG 不走 Vite 的 index.html 管道）
        injectRegister: false,
        manifest: PWA_MANIFEST,
        includeManifest: true,
        includeManifestIcons: true,
        generateSW: {
          // cacheRules.simple：本地 HTML/JS/CSS 全量预缓存（含 /404.html、/css/index.css），
          // 离线可直出任意已生成页面；上游 simple 规则只列了这两个路径，这里按
          // 「离线可访问首页」的验收目标扩到全部静态页面（逐条映射见 P7-1-pwa.md §3）
          globPatterns: ['**/*.{html,js,css}'],
          // 离线导航兜底（navigateFallback）**不要**在这里写死 '/'——它是 base-aware 的：
          // @vite-pwa/astro 2.0.4 在没显式配置时自动填 `base ?? vite.base ?? "/"`
          //（node_modules/@vite-pwa/astro/dist/prepare-build-context-*.mjs:16），
          // 同时它的 manifest transform 把 index.html 的 precache URL 改写成站点
          // scope（`/index.html` → `/`，见同文件 createManifestTransform）。
          // generateSW 再据此生成
          // `registerRoute(new NavigationRoute(createHandlerBoundToURL('/')))`，
          // 断网 reload `/` 才能命中预缓存。写死 '/' 会破坏 DEPLOY_SITE_ROOT 子路径
          // 部署；真实构建产物证据（sw.js 的 `/` precache 条目 + NavigationRoute 接线）
          // 见 docs/notes/P7-1-pwa.md §6.1。
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          runtimeCaching: PWA_RUNTIME_CACHING,
        },
      }),
      anzhiyuPwaExtras(),
    ]
    console.log(
      `[P7-1 PWA] 已启用 @vite-pwa/astro（cacheName=${PWA_CACHE_NAME}，` +
        `runtimeCaching=${PWA_RUNTIME_CACHING.length} 条 + getSpareUrls 补丁）`,
    )
  } catch (error) {
    console.warn(
      `[P7-1 PWA] 设置了 ANZHIYU_PWA=1，但加载 @vite-pwa/astro 失败，` +
        `本次构建降级为无 PWA（迁移站没装这个包时属预期）：${error?.message ?? error}`,
    )
  }
}

export default defineConfig({
  // GitHub Pages demo 构建的子路径（`DEPLOY_SITE_ROOT`，约定不带前导斜杠传值，
  // 如 blog —— Git Bash 会把以 / 开头的 env 值做 MSYS 路径转换，这里统一归一化）。
  // 验收构建不设该环境变量，这里保持无 base —— 产物与 48 页基线的路径
  // 语义（/css/index.css、/archives/…）完全一致，diff 验收不受影响。
  // 分工：`base` 管页面输出目录与 Vite 打包资源前缀；站内链接前缀由
  // SITE_IDENTITY.root 管（见 src/data/site-identity.ts，同一个变量）。
  ...(() => {
    const raw = process.env.DEPLOY_SITE_ROOT
    if (!raw) return {}
    const base = raw.startsWith('/') ? raw : `/${raw}`
    return { base }
  })(),
  // P7-6 / W1-D：主题静态资源接线。build 时把 packages/astro-theme-anzhiyu/assets/
  // 复制进 dist（/js/**、/css/index.css），dev 时由中间件直出；目标已存在则 warn 并
  // 保留站点侧文件。迁移站同一行即可拿到同一批资源（不需要手工拷 public/）。
  integrations: [anzhiyuAssets(), ...pwaIntegrations],
  // ADR-001：显式切回 unified 处理器（@astrojs/markdown-remark），不用 Astro 7 默认的 Sätteri。
  // 原因：Phase 6 的 42 个 Hexo tag 需要在 Markdown 解析阶段做语法替换，
  // remark/rehype 生态有现成的 MDAST/HAST 插件与大量可参考实现；Sätteri 没有插件生态。
  // 代价是失去 Sätteri 的构建速度，对几百篇文章的站点在秒级，可接受（见 docs/02-astro-mapping.md §ADR-001）。
  markdown: {
    // smartypants: false —— 关掉 unified 的「智能标点」替换，与 Hexo/marked 对齐。
    //
    // @astrojs/markdown-remark 的默认值是 `smartypants: true`
    //（node_modules/@astrojs/internal-helpers/dist/markdown.js 的 markdownConfigDefaults），
    // 它会在 remark 阶段把正文文本节点做一遍排版替换：
    //   -->  →  —>      （U+2014 + '>'，`--` 被当作 em dash）
    //   --   →  —       （单段 `--` → em dash；`---` → em dash 同款）
    //   ...  →  …       （U+2026）
    //   "x"  →  “x”     （直角/弯引号成对替换）
    // 上游 Hexo 用 hexo-renderer-marked，默认 `smartypants: false`，以上一律原样输出。
    //
    // 这个差异不是「样式好看不好看」的问题，它有两处硬后果：
    //  1. `{% mermaid %}` 块里的 `A --> B` 会被改写成 `A —> B`，Phase 6 的 tag 解析器
    //     按字面量取块内容时拿到的就不是 Mermaid 语法，图直接画不出来
    //     （实测 fixtures/tags-thirdparty.md 3 条 `-->` 全被替换，见
    //      docs/notes/P-markdown-date-align.md §1）。
    //  2. HTML diff 里凡是正文出现 `--` / `...` / 引号的段落都会报假文本差异。
    //
    // 关闭方式按 @astrojs/markdown-remark 的 processor API：处理器选项会覆盖
    // `markdown.smartypants` 顶层默认值（dist/processor.js:
    // `smartypants: processor.options.smartypants ?? shared.smartypants`），
    // 所以这里在处理器里传 `smartypants: false` 是生效路径，不需要再写顶层 `markdown.smartypants`。
    //
    // M1（代码块 DOM）需要「rehype-raw 之后」的时机，`unified()` helper 给不了，
    // 因此改成下面的自定义处理器（行为等价 + 摘掉 figure.highlight 里被 parse5 补上的 tbody）。
    processor: hexoMarkdownProcessor,
  },
  vite: {
    build: {
      // 关闭 CSS 压缩，两个原因，缺一不可：
      //
      // 1. 上游 1.7.1 自己的样式里有一处笔误：source/css/_mode/readmode.styl:120
      //    写的是 `var(-highlight-bg)`（少一个横杠，104 行是对的）。浏览器会
      //    静默丢弃这条声明，所以 Hexo 下一直不报错；但 lightningcss 是严格
      //    解析器，遇到非法自定义属性直接让整个构建失败：
      //    `[lightningcss minify] Unexpected token Ident("-highlight-bg")`。
      //    修上游那处笔误会让 read-mode 的代码块背景真的生效，跟上游的视觉
      //    不一致（上游实际是「没生效」），验收要求像素级还原，所以不能改。
      //
      // 2. 验收基准 docs/baseline.json 里的 CSS 是上游 `hexo g` 的未压缩产物
      //    （683218 字节）。压缩后会差 30% 以上，verify-css 的 ±5% 判定必然失败。
      //
      // 压缩属于性能优化，按 PLAN 的原则放到 Phase 7 再做；那时的做法是让
      // 基准比对用未压缩产物，另建一条「压缩后体积」的独立预算，而不是拿
      // 压缩产物去对未压缩基准。
      cssMinify: false,
    },
    css: {
      preprocessorOptions: {
        stylus: {
          // hexo-renderer-stylus 的 .set('include css', true)：
          // 让 Stylus 把 .css 的 @import 当 literal 原文内联进产物。
          // 插件本身也会通过 config 钩子注入同一项，这里显式写一份用于排查
          // （如果插件注入不生效，删掉这段就能看出来）。
          'include css': true,
        },
      },
    },
    plugins: [
      stylusHexoConfig({
        // 直接复用上游 Hexo 主题的 _config.yml，不做任何改写
        configPath: path.join(root, 'theme.config.yml'),
        debug: true,
      }),
    ],
  },
})
