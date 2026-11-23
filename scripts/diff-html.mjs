#!/usr/bin/env node
/**
 * P2-13 HTML 结构 diff（PLAN §3.2 第一层）
 *
 * 把两份 HTML 归一化成同一棵「结构树」再逐节点比对，回答的是
 * 「标签层级 / id / class 集合 / 文本 是否一致」，不是「字节是否一致」。
 * 归一化只吃掉渲染语义无关的写法差异（属性顺序、空白、注释、资源哈希、
 * 自闭合写法、布尔属性、Astro 注入属性），结构差异一律报出来。
 *
 * 用法：
 *   node scripts/diff-html.mjs <baselineHtmlPath> <distHtmlPath> [--json]
 *   node scripts/diff-html.mjs --all [--json] [--filter <子串>] [--limit 20]
 *
 * --all 模式按 docs/baseline.json 的 pages 列表批量比对：
 *   baseline 根目录：BASELINE_HTML_DIR，默认 .baseline-work/public
 *   dist     根目录：DIST_DIR，默认 examples/blog/dist
 *   baseline.json：BASELINE_PATH，默认 docs/baseline.json
 *
 * 退出码：全部 PASS → 0；有 FAIL → 1；baseline 目录/文件不存在 → 打印提示并 0
 * （CI 上没有参考产物时不能红；与 verify-css.mjs 的处理一致）。
 *
 * 依赖：零第三方依赖。仓库里没有 parse5/cheerio，CI 也不该为一个 diff 脚本
 * 多装一个依赖，所以自带一个够用的 HTML 词法 + 树构建器（见 §1）。
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_JSON = process.env.BASELINE_PATH
  ? path.resolve(process.env.BASELINE_PATH)
  : path.join(REPO_ROOT, 'docs', 'baseline.json')
const BASELINE_HTML_DIR = process.env.BASELINE_HTML_DIR
  ? path.resolve(process.env.BASELINE_HTML_DIR)
  : path.join(REPO_ROOT, '.baseline-work', 'public')
const DIST_DIR = process.env.DIST_DIR
  ? path.resolve(process.env.DIST_DIR)
  : path.join(REPO_ROOT, 'examples', 'blog', 'dist')

const log = (...args) => (jsonMode ? console.error : console.log)('[diff-html]', ...args)
const rel = (file) => path.relative(REPO_ROOT, file) || '.'

// --json 模式下所有进度信息走 stderr，保证 stdout 是可直接 JSON.parse 的纯数据
let jsonMode = false

// ═══════════════════════════════════════════════════════════════════════════
// 1. HTML 词法 + 树构建
//
// 只要能覆盖「Hexo 压缩产物 / Astro 产物 / 手写 HTML」这个范围就够：
// - 属性：双引号、单引号、无引号、无值
// - 原始文本元素：script/style/textarea/title 内部不解析标签
// - 空元素（void）：不压栈
// - 隐式闭合：p / li / dt / dd / tr / td / th / option 这些标签省略写法
//   （HTML5 允许省略，浏览器会自己补，diff 不能因为写法差异报差异）
// - 栈里找不到的 </tag>：记 warning 后丢弃，不抛异常
// ═══════════════════════════════════════════════════════════════════════════

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
])

/** 内容按原文处理、内部不解析标签的元素 */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title'])

/** 内部空白有意义的元素：不折叠空白 */
const PRESERVE_WHITESPACE_ELEMENTS = new Set(['pre', 'textarea'])

/**
 * 隐式闭合的搜索边界（HTML5 的 scope 概念）。
 *
 * 只在同一作用域内找目标标签：找 li 时不越过 ul/ol，找 td 时不越过 tr/table。
 * 少了这层，`<ol><li><ol><li>` 这种嵌套列表里内层 <li> 会把外层 <li> 关掉，
 * 整棵 TOC 树会错位（上游长文页就有多层 TOC）。
 */
const CLOSE_SCOPE = {
  li: new Set(['ul', 'ol', 'menu', 'dir']),
  dt: new Set(['dl']),
  dd: new Set(['dl']),
  tr: new Set(['table', 'thead', 'tbody', 'tfoot']),
  td: new Set(['tr', 'table']),
  th: new Set(['tr', 'table']),
  option: new Set(['select', 'datalist', 'optgroup']),
  // p 只能包含 phrasing content，跨过块级容器就说明不是同一个 p
  p: new Set([
    'div', 'section', 'article', 'aside', 'nav', 'header', 'footer', 'main',
    'figure', 'figcaption', 'form', 'fieldset', 'blockquote', 'li', 'dd', 'dt',
    'table', 'td', 'th', 'caption', 'details', 'dialog', 'template', 'button',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'ul', 'ol', 'dl', 'menu', 'body',
  ]),
}

/** 新 start tag 出现时，会隐式关闭的栈内标签（HTML5 的 optional end tag 规则） */
const IMPLIED_END_BY_START = {
  li: ['li'],
  dt: ['dt', 'dd'],
  dd: ['dt', 'dd'],
  tr: ['tr', 'td', 'th'],
  td: ['td', 'th'],
  th: ['td', 'th'],
  option: ['option'],
  optgroup: ['optgroup', 'option'],
  thead: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'],
  tbody: ['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'],
  tfoot: ['thead', 'tbody', 'tr', 'td', 'th'],
}

/** 这些块级 tag 出现时关闭未闭合的 <p> */
const P_CLOSERS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol',
  'p', 'pre', 'section', 'table', 'ul',
])

/** 已知 HTML 布尔属性：值写成 name / name="name" / name="" 一律等价 */
const BOOLEAN_ATTRS = new Set([
  'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls',
  'default', 'defer', 'disabled', 'formnovalidate', 'hidden', 'inert',
  'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate',
  'open', 'playsinline', 'readonly', 'required', 'reversed', 'selected',
])

/** 这些属性名出现在任何标签上都按 URL 处理 */
const URL_ATTRS = new Set([
  'action', 'background', 'cite', 'data-cover', 'data-href', 'data-image',
  'data-lazy-src', 'data-original', 'data-poster', 'data-src', 'data-srcset',
  'data-thumbnail', 'data-url', 'formaction', 'href', 'longdesc', 'manifest',
  'ping', 'poster', 'src', 'srcset',
])

/** 命名实体表：只收上游产物里真出现过的 + 常见排版符号，其余原样保留 */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
  middot: '·', bull: '•', times: '×', divide: '÷', deg: '°', plusmn: '±',
  frac12: '½', frac14: '¼', frac34: '¾', sect: '§', para: '¶', dagger: '†',
  permil: '‰', prime: '′', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  harr: '↔', spades: '♠', clubs: '♣', hearts: '♥', diams: '♦', ensp: ' ',
  emsp: ' ', thinsp: ' ', shy: '\u00ad',
}

/** HTML 实体解码（命名表 + 十进制 + 十六进制） */
function decodeEntities(text) {
  if (!text.includes('&')) return text
  return text.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g, (all, dec, hex, name) => {
    if (dec) {
      const code = Number(dec)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all
    }
    if (hex) {
      const code = Number.parseInt(hex, 16)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all
    }
    const mapped = NAMED_ENTITIES[name.toLowerCase()]
    return mapped === undefined ? all : mapped
  })
}

/**
 * 解析 HTML 为原始树。
 * 节点：{ type:'root'|'doctype'|'element'|'text', ... }
 */
function parseHtml(html, stats) {
  const root = { type: 'root', children: [] }
  const stack = [root]
  const top = () => stack[stack.length - 1]
  const push = (node) => top().children.push(node)

  // 在 CLOSE_SCOPE[tag] 允许的作用域内找最近的同名开标签并弹栈
  const closeTo = (tag) => {
    const scope = CLOSE_SCOPE[tag]
    for (let depth = stack.length - 1; depth > 0; depth--) {
      const open = stack[depth].tag
      if (open === tag) {
        stack.length = depth
        return true
      }
      if (scope && scope.has(open)) return false
    }
    return false
  }

  let i = 0
  const len = html.length
  let sawDoctype = false

  while (i < len) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      pushText(html.slice(i))
      break
    }
    if (lt > i) pushText(html.slice(i, lt))

    // <!-- 注释 -->：丢弃，只计数
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      if (end === -1) {
        stats.comments++
        stats.warnings.push('注释未闭合，已丢弃到文件末尾')
        break
      }
      stats.comments++
      i = end + 3
      continue
    }

    // <!DOCTYPE> / <![CDATA[ ... ]]> 等声明
    if (html[lt + 1] === '!') {
      const end = html.indexOf('>', lt + 2)
      if (end === -1) {
        stats.warnings.push('声明未闭合，已丢弃到文件末尾')
        break
      }
      const body = html.slice(lt + 2, end).trim()
      const m = /^doctype\s+([a-zA-Z]+)/i.exec(body)
      const name = m ? m[1].toLowerCase() : body.toLowerCase()
      if (!sawDoctype && (m || /^doctype/i.test(body))) {
        sawDoctype = true
        push({ type: 'doctype', name })
      } else {
        stats.warnings.push(`忽略声明 <!${body.slice(0, 40)}>`)
      }
      i = end + 1
      continue
    }

    // <?xml ... ?> 之类处理指令：直接丢弃
    if (html[lt + 1] === '?') {
      const end = html.indexOf('>', lt + 2)
      stats.warnings.push('忽略处理指令')
      i = end === -1 ? len : end + 1
      continue
    }

    // </tag>
    if (html[lt + 1] === '/') {
      const end = html.indexOf('>', lt + 2)
      if (end === -1) {
        stats.warnings.push('结束标签未闭合，已丢弃到文件末尾')
        break
      }
      const tag = html.slice(lt + 2, end).trim().toLowerCase()
      if (!closeTo(tag)) stats.warnings.push(`忽略游离结束标签 </${tag}>`)
      i = end + 1
      continue
    }

    // <tag ...> 或 <tag .../>
    const parsed = parseStartTag(html, lt, stats)
    if (!parsed) {
      // 不是合法标签起始，按文本处理
      const next = html.indexOf('>', lt)
      const stop = next === -1 ? len : next + 1
      pushText(html.slice(lt, stop))
      i = stop
      continue
    }
    const { tag, attrs, selfClosing, end: tagEnd } = parsed
    i = tagEnd

    // 隐式闭合
    for (const closed of IMPLIED_END_BY_START[tag] ?? []) closeTo(closed)
    if (P_CLOSERS.has(tag)) closeTo('p')

    const element = { type: 'element', tag, attrs, children: [], selfClosing }
    push(element)

    if (VOID_ELEMENTS.has(tag)) continue

    if (RAW_TEXT_ELEMENTS.has(tag) && !selfClosing) {
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i')
      const rest = html.slice(i)
      const m = closeRe.exec(rest)
      const rawEnd = m ? i + m.index : len
      const raw = html.slice(i, rawEnd)
      if (raw) element.children.push({ type: 'text', text: raw })
      if (!m) stats.warnings.push(`<${tag}> 未闭合（读到文件末尾）`)
      i = m ? rawEnd + m[0].length : len
      continue
    }

    if (selfClosing) {
      // 非空元素上的 XHTML 自闭合写法（<div/>）：HTML5 当普通 start tag，
      // 但为了「自闭合写法差异」可比，这里直接当已闭合处理。
      // 只对没有子节点的写法生效，不会吞掉真正的层级差异。
      continue
    }

    stack.push(element)
  }

  // 收尾：把还开着的元素拍平（它们已经被挂在父节点上，栈只是闭合状态）
  if (stack.length > 1) {
    stats.warnings.push(
      `文件结束时仍有 ${stack.length - 1} 个元素未闭合：` +
        stack.slice(1).map((node) => `<${node.tag}>`).join(''),
    )
    stack.length = 1
  }

  return root

  function pushText(text) {
    if (!text) return
    // 合并相邻文本节点，后续归一化只处理一次
    const parent = top()
    const last = parent.children[parent.children.length - 1]
    if (last && last.type === 'text') last.text += text
    else parent.children.push({ type: 'text', text })
  }
}

/**
 * 从 lt 位置解析 `<tag attr=... >`，返回 tag/attrs/selfClosing/end。
 * 解析失败返回 null（调用方按文本兜底）。
 */
function parseStartTag(html, lt, stats) {
  const nameMatch = /^<([a-zA-Z][a-zA-Z0-9:_-]*)/.exec(html.slice(lt, lt + 128))
  if (!nameMatch) return null
  const tag = nameMatch[1].toLowerCase()
  let i = lt + nameMatch[0].length
  const attrs = []
  const seen = new Set()
  let selfClosing = false

  for (;;) {
    while (i < html.length && /\s/.test(html[i])) i++
    if (i >= html.length) return null
    if (html[i] === '>') {
      i++
      break
    }
    if (html[i] === '/' && html[i + 1] === '>') {
      selfClosing = true
      i += 2
      break
    }
    if (html[i] === '/') {
      i++
      continue
    }

    const nameStart = i
    while (i < html.length && !/[\s=/>]/.test(html[i])) i++
    const name = html.slice(nameStart, i).toLowerCase()
    if (!name) {
      i++
      continue
    }
    while (i < html.length && /\s/.test(html[i])) i++

    let value = ''
    if (html[i] === '=') {
      i++
      while (i < html.length && /\s/.test(html[i])) i++
      const quote = html[i]
      if (quote === '"' || quote === "'") {
        i++
        const endQuote = html.indexOf(quote, i)
        if (endQuote === -1) return null
        value = html.slice(i, endQuote)
        i = endQuote + 1
      } else {
        const valueStart = i
        while (i < html.length && !/[\s>]/.test(html[i])) i++
        value = html.slice(valueStart, i)
      }
    }

    if (seen.has(name)) {
      stats.warnings.push(`<${tag}> 重复属性 ${name}，保留第一个`)
      continue
    }
    seen.add(name)
    attrs.push({ name, value })
  }

  return { tag, attrs, selfClosing, end: i }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. 归一化
//
// 归一化清单（每项都只吃掉「写法不同、渲染结果相同」的差异）：
//   N1 属性顺序        → 属性按名字排序，比对时顺序无关
//   N2 空白折叠        → 文本 collapse 空白 + trim；空文本节点丢弃（<pre> 除外）
//   N3 HTML 注释       → 整段丢弃（只计数）
//   N4 资源哈希文件名  → `x.By-987Uf.css` → `x.<HASH>.css`，`?v=<hex>` → `?v=<HASH>`
//   N5 自闭合写法      → `<meta/>` ≡ `<meta>`；`<div/>` 当已闭合
//   N6 布尔属性        → `disabled` ≡ `disabled=""` ≡ `disabled="disabled"`
//   N7 data-astro-* 属性 → 整类删除（Astro 的 scoped style / transition 标记）
//   N8 HTML 实体       → 解码后比对（&amp; ≡ &#38;）
//   N9 class 集合      → 拆开排序去重（class 顺序无语义，但集合必须真比）
//   N10 style 属性     → 折叠空白、去尾部 `;`
//   N11 站内 origin    → 本文档 canonical 的 origin → `<SITE>`（域名配置差异不是结构差异）
//   N12 Astro 机制元素 → view-transitions meta / generator meta / ClientRouter 脚本
//   N13 pre 首行换行   → 浏览器会忽略 <pre> 后紧跟的一个换行，归一化掉
//   N14 CRLF / 大小写  → 换行统一 LF，tag 名与属性名小写
//   N15 generator meta → Hexo / Astro 的构建工具身份都不参与比对
//   N16 框架脚本       → ClientRouter / pjax shim / 布局 module script
//   N17 上游 pjax 库   → 被 ClientRouter 取代的 pjax.min.js 与 `new Pjax(...)` 初始化
//   N18 主 CSS 路径    → /css/index.css ↔ /_astro/*.css（内容由 verify-css 单独比）
//   N19 中文空白       → 两侧含 CJK 且去掉空白后相等时放行
// ═══════════════════════════════════════════════════════════════════════════

const ASTRO_ATTR_PREFIX = /^data-astro[-:]/

/** 判断某个 Astro 机制元素是否属于「框架注入、无上游对应物」的无关差异 */
function isAstroMachineryElement(node) {
  if (node.tag === 'meta') {
    const name = attrValue(node, 'name') ?? ''
    if (name.startsWith('astro-')) return true
    // N15：构建工具身份不是 DOM 契约。上游是 Hexo，我们是 Astro，
    // 两边都忽略，避免为了「对齐」伪造一条 Hexo generator。
    if (name === 'generator') return true
    return false
  }
  // Astro 自带的路由脚本，取代上游的 pjax 脚本，Phase 4 由交互层验收
  if (node.tag === 'script') {
    // N16：主题的 ClientRouter / pjax shim / 布局级 module script 都是框架机制。
    // 用 src 是否落在 /_astro/ 且文件名带机制标记来判定，避免误伤业务脚本。
    const src = attrValue(node, 'src') ?? ''
    if (/\/_astro\/[^"]*(?:ClientRouter|pjax-shim|BaseLayout)[^"]*\.js/.test(src)) return true
    // N15：首屏 theme bootstrap 内联脚本（html[data-theme] 的运行时契约）
    if (node.attrs?.some((item) => item.name === 'data-anzhiyu-bootstrap')) return true
    // N17：上游 pjax 库 + 它的内联初始化被 ClientRouter + shim 取代。
    // 只认 pjax 库脚本（文件名含 pjax 且不是我们的 /_astro/ 产物）与 `new Pjax(` 初始化块。
    if (/pjax(?:@|\.min\.js|[\/-])/i.test(src) && !src.startsWith('/_astro/')) return true
    if (!src) {
      const body = (node.children ?? []).map((child) => child.text ?? '').join('')
      if (/new\s+Pjax\s*\(/.test(body)) return true
      if (/var AUTO = /.test(body) && /data-theme/.test(body)) return true
    }
    return false
  }
  // N18：Vite 打包出的 CSS 资源链接。上游是 /css/index.css（Head 里结构固定），
  // 我们额外有一条 /_astro/<name>.<HASH>.css（站点 import 的 Stylus 真实产物）。
  // 按 resource-path-policy §1.1 登记为「打包路径豁免」；CSS 内容由 verify-css 单独比。
  if (node.tag === 'link') {
    const rel = attrValue(node, 'rel') ?? ''
    const href = attrValue(node, 'href') ?? ''
    if (rel === 'stylesheet' && /^\/_astro\/[^/]+\.css$/.test(href)) return true
  }
  // N20：M2 脚注差异（PLAN §Phase 2「三类渲染差异」M2）。
  // 上游 marked 不渲染脚注，原样留 `[^note1]`；我们渲染真脚注（附录 A #2 的特性）。
  // 结构侧忽略脚注引用 sup 与脚注区 section，文本侧在比较时剥掉 `[^...]` 标记。
  if (node.tag === 'section' && node.attrs?.some((item) => item.name === 'data-footnotes')) return true
  if (node.tag === 'sup') {
    const hasRef = (node.children ?? []).some(
      (child) =>
        child.type === 'element' &&
        child.tag === 'a' &&
        child.attrs?.some((item) => item.name === 'data-footnote-ref'),
    )
    if (hasRef) return true
  }
  if (node.tag === 'a' && node.attrs?.some((item) => item.name === 'data-footnote-backref')) return true
  return false
}

function attrValue(node, name) {
  const attr = node.attrs?.find((item) => item.name === name)
  return attr ? attr.value : undefined
}

/**
 * N18：已登记的资源路径豁免（docs/resource-path-policy.md §1.1）。
 *
 * 只放行「上游 /css/index.css ↔ 我们 /_astro/<name>.<HASH>.css」这一种映射：
 * Vite 打包必然改目录与文件名，但 CSS 内容由 verify-css.mjs 单独按字节比对，
 * 不会因为这条豁免放过「样式没加载」。其它 href 一律逐字比。
 */
function equivalentAttrValue(name, a, b) {
  if (a === b) return true
  if (name !== 'href') return false
  const upstreamMainCss = /^\/css\/index\.css$/
  const builtCss = /^\/_astro\/[^/]+\.css$/
  return (upstreamMainCss.test(a) && builtCss.test(b)) || (builtCss.test(a) && upstreamMainCss.test(b))
}

/** N11：取本文档「自己的站内 origin」——canonical 优先，其次 og:url */
function detectSiteOrigins(root) {
  const origins = new Set()
  const walk = (node) => {
    if (node.type === 'element') {
      if (node.tag === 'link' && /\bcanonical\b/i.test(attrValue(node, 'rel') ?? '')) {
        const href = attrValue(node, 'href')
        const origin = originOf(href)
        if (origin) origins.add(origin)
      }
      if (node.tag === 'meta' && /^og:url$/i.test(attrValue(node, 'property') ?? '')) {
        const origin = originOf(attrValue(node, 'content'))
        if (origin) origins.add(origin)
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return origins
}

function originOf(value) {
  if (!value) return null
  const match = /^(https?:)\/\/([^/?#]+)/i.exec(value)
  return match ? `${match[1].toLowerCase()}//${match[2].toLowerCase()}` : null
}

/** N4 + N11：资源 URL 归一化 */
function normalizeUrl(value, ctx) {
  if (!value) return value
  let out = value

  for (const origin of ctx.siteOrigins) {
    if (out.toLowerCase().startsWith(origin)) {
      out = '<SITE>' + out.slice(origin.length)
      ctx.originsReplaced++
    }
  }

  // 文件名里的内容哈希：`name.HASH.ext` / `name-HASH.ext` / `name_HASH.ext`
  // 只认「点/横线/下划线分隔 + 6 位以上 + 紧跟扩展名」的段落，避免吃掉普通单词
  out = out.replace(
    /([.\-_])([A-Za-z0-9_-]{6,})(?=\.(?:astro_[a-z0-9_]+|[a-z0-9]{1,8})(?:[?#]|$))/g,
    (_all, sep) => `${sep}<HASH>`,
  )
  // 查询串里的缓存戳
  out = out.replace(/([?&](?:v|ver|version|hash|h)=)[A-Za-z0-9._-]{6,}/gi, '$1<HASH>')

  return out
}

/** N10：style 属性归一化 */
function normalizeStyleValue(value) {
  return value
    .split(';')
    .map((decl) => decl.trim().replace(/\s*:\s*/, ':').replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(';')
}

/** N9：class 集合归一化 */
function normalizeClassValue(value) {
  return [...new Set(value.split(/\s+/).filter(Boolean))].sort().join(' ')
}

/** N5/N6/N8/N9/N10 + URL：单个属性值归一化 */
function normalizeAttrValue(name, rawValue, ctx) {
  let value = decodeEntities(rawValue)
  value = value.replace(/\r\n?/g, '\n')

  if (name === 'class') return normalizeClassValue(value)
  if (name === 'style') return normalizeStyleValue(value)
  if (BOOLEAN_ATTRS.has(name)) {
    const lowered = value.trim().toLowerCase()
    return lowered === name ? '' : value.trim()
  }

  // srcset 用逗号分离多个候选，逐个归一化
  if (name === 'srcset' || name === 'data-srcset') {
    return value
      .split(',')
      .map((item) => {
        const [url, ...descriptor] = item.trim().split(/\s+/)
        return [normalizeUrl(url, ctx), ...descriptor].join(' ')
      })
      .join(', ')
  }

  const trimmed = value.trim()
  const looksLikeUrl =
    URL_ATTRS.has(name) ||
    (/^(?:https?:)?\/\//i.test(trimmed) || trimmed.startsWith('/') || /^\.{0,2}\//.test(trimmed))

  if (looksLikeUrl) return normalizeUrl(trimmed.replace(/\s+/g, ' '), ctx)
  return trimmed.replace(/\s+/g, ' ')
}

/**
 * N21：上游 tag 解析器缺陷（`## videos` / `## sitegroup` 被吞成字面量）。
 *
 * 1.7.1 的 `{% videos %}` / `{% sitegroup %}` 容器会把紧邻的 Markdown 标题当成 tag
 * 正文的一部分（上游 tag 词法器的已知缺陷），基线里留下整段文本 `## videos`。
 * 我们按正常 Markdown 渲染成 `<h2 id="videos">`。两边都不算对错，但这是上游产物
 * 的确定性瑕疵，不复制、也不让它把整页判 FAIL。
 *
 * 处理：把基线里「整段就是 `## xxx`」的文本节点认成未渲染标题，两边同步删掉
 * 对应 id 的 h1–h6。只在基线出现该瑕疵时生效，正常标题不受影响。
 */
function stripUnrenderedHeadingArtifacts(baselineRaw, distRaw) {
  const ids = new Set()
  const textArtifact = /^#{1,6}\s+([A-Za-z][\w-]*)$/
  const visit = (node, onText) => {
    if (node.type === 'text') {
      onText(node)
      return
    }
    for (const child of node.children ?? []) visit(child, onText)
  }
  visit(baselineRaw, (node) => {
    const match = textArtifact.exec((node.text ?? '').trim())
    if (match) ids.add(match[1].toLowerCase())
  })
  if (ids.size === 0) return
  const drop = (root) => {
    const walk = (node) => {
      const children = node.children ?? []
      for (let index = children.length - 1; index >= 0; index--) {
        const child = children[index]
        if (child.type === 'text' && textArtifact.test((child.text ?? '').trim())) {
          children.splice(index, 1)
          continue
        }
        if (
          child.type === 'element' &&
          /^h[1-6]$/.test(child.tag) &&
          ids.has((attrValue(child, 'id') ?? '').toLowerCase())
        ) {
          children.splice(index, 1)
          continue
        }
        walk(child)
      }
    }
    walk(root)
  }
  drop(baselineRaw)
  drop(distRaw)
}

/**
 * 归一化树。ctx 里带上本文档的 siteOrigins 与统计计数。
 */
function normalizeTree(rawRoot, stats) {
  const ctx = {
    siteOrigins: detectSiteOrigins(rawRoot),
    originsReplaced: 0,
    droppedAstroAttrs: 0,
    droppedAstroElements: 0,
  }

  const normalizeChildren = (children, insidePre) => {
    const out = []
    for (const child of children) {
      const normalized = normalizeNode(child, insidePre)
      if (normalized) out.push(normalized)
    }
    // N2：相邻文本节点合并后可能产生空节点，再清一遍。
    // 忽略掉的机制元素（如脚注 ref 的 <sup>）也会把一段文本切成两半，
    // 这里合并回去，避免「语义上同一段文本」被报成 node-missing + node-unexpected。
    const merged = []
    for (const node of out) {
      const last = merged[merged.length - 1]
      if (node.type === 'text' && last?.type === 'text') {
        last.text += node.text
        continue
      }
      merged.push(node)
    }
    return merged.filter((node) => !(node.type === 'text' && node.text === ''))
  }

  const normalizeNode = (node, insidePre) => {
    if (node.type === 'text') {
      const text = decodeEntities(node.text).replace(/\r\n?/g, '\n')
      if (insidePre) return text ? { type: 'text', text } : null
      const collapsed = text.replace(/\s+/g, ' ').trim()
      return collapsed ? { type: 'text', text: collapsed } : null
    }

    if (node.type === 'doctype') {
      return { type: 'doctype', name: node.name.toLowerCase() }
    }

    // N12：Astro 机制元素
    if (isAstroMachineryElement(node)) {
      ctx.droppedAstroElements++
      return null
    }

    const attrs = []
    for (const attr of node.attrs) {
      // N7：data-astro-* 属性
      if (ASTRO_ATTR_PREFIX.test(attr.name)) {
        ctx.droppedAstroAttrs++
        continue
      }
      attrs.push({ name: attr.name, value: normalizeAttrValue(attr.name, attr.value, ctx) })
    }
    // N1：属性排序
    attrs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

    // 换行统一，然后按父级是否处于 <pre> 里决定折叠方式
    const children = normalizeChildren(node.children, insidePre || PRESERVE_WHITESPACE_ELEMENTS.has(node.tag))

    // N13：浏览器忽略 <pre>/<textarea> 内容开头紧跟的那个换行。
    // 只处理元素自己的第一个文本子节点——<pre><code>\nfoo</code></pre> 里
    // code 内部的首换行是内容，不能动。
    if (PRESERVE_WHITESPACE_ELEMENTS.has(node.tag) && children[0]?.type === 'text') {
      children[0].text = children[0].text.replace(/^\n/, '')
      if (!children[0].text) children.shift()
    }

    return { type: 'element', tag: node.tag, attrs, children }
  }

  const root = { type: 'root', children: normalizeChildren(rawRoot.children, false) }
  return { root, ctx }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. 树 diff
//
// 对齐策略（四级 LCS，从强到弱，每级只处理上一级剩下的空隙）：
//   1. tag#id           id 是唯一身份，先配对
//   2. tag[key=value]   meta/link/input 这类按 name/rel 等属性配，
//                       避免 <head> 里 30 个 <meta> 被按下标强配成「属性变了」
//   3. tag.classes      无 id 的节点按 class 集合配（重复卡片）
//   4. tag              剩下的按标签名配，让「class 改一个」落成 attr-changed
//                       有 id 的节点只在前三级参与：id 不同就是不同元素
//
// 差异类别（category）用于统计与 Phase 2 判据：
//   结构 / 属性 / 文本 / 脚本样式 / 文档 / 文件
// 另有缺口统计 missingNodes / unexpectedNodes：整棵子树只在一边时只报 1 条
// 差异，但会把子树节点数累加，避免「删了整个 section」看起来只差 1 条。
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY = {
  'file-missing': '文件',
  'node-missing': '结构',
  'node-unexpected': '结构',
  'tag-changed': '结构',
  'attr-missing': '属性',
  'attr-unexpected': '属性',
  'attr-changed': '属性',
  text: '文本',
  content: '脚本样式',
  doctype: '文档',
}

const SNIPPET_LIMIT = 120

function snippet(value, limit = SNIPPET_LIMIT) {
  if (value === undefined || value === null) return '（不存在）'
  const oneLine = String(value).replace(/\r?\n/g, '\\n')
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}…` : oneLine
}

/**
 * 1 级签名：id 是 HTML 里的唯一身份，有 id 就只认 `tag#id`。
 * 没有 id 返回 null，交给后面的级别。
 */
function idSignature(node) {
  if (node.type !== 'element') return null
  const id = attrValue(node, 'id')
  return id === undefined ? null : `${node.tag}#${id}`
}

/**
 * 3 级签名：没有 id 但带 class 的节点，按 `tag.class1.class2` 认身份。
 * 有 id 的节点在这一级返回 null：它在 1 级已经「认过身份但没对上」，
 * 说明是另一个元素，不能再按 class 或位置强配（否则 id 变了会只报成属性差异）。
 */
function classSignature(node) {
  if (node.type !== 'element') return null
  if (attrValue(node, 'id') !== undefined) return null
  const cls = attrValue(node, 'class')
  return cls ? `${node.tag}.${cls.split(' ').join('.')}` : null
}

function tagSignature(node) {
  if (node.type === 'text') return '#text'
  if (node.type === 'doctype') return '#doctype'
  // 有 id 的节点不在这一级配对：id 不同就是不同元素，要报 missing/unexpected
  return attrValue(node, 'id') !== undefined ? null : node.tag
}

function serialize(node, limit = SNIPPET_LIMIT) {
  const text = render(node)
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function render(node) {
  if (node.type === 'root') return node.children.map(render).join('')
  if (node.type === 'text') return `"${node.text}"`
  if (node.type === 'doctype') return `<!DOCTYPE ${node.name}>`
  const attrs = node.attrs
    .map((attr) => (attr.value === '' ? ` ${attr.name}` : ` ${attr.name}="${attr.value}"`))
    .join('')
  if (!node.children.length) return `<${node.tag}${attrs}>`
  return `<${node.tag}${attrs}>${node.children.map(render).join('')}</${node.tag}>`
}

function countNodes(node) {
  if (node.type !== 'element') return 1
  let total = 1
  for (const child of node.children) total += countNodes(child)
  return total
}

/** --dump-normalized 用的缩进格式：非空元素一定闭合，方便肉眼核对归一化结果 */
function renderPretty(node, indent = '') {
  if (node.type === 'root') return node.children.map((child) => renderPretty(child, indent)).join('\n')
  if (node.type === 'text') return `${indent}"${node.text}"`
  if (node.type === 'doctype') return `${indent}<!DOCTYPE ${node.name}>`
  const attrs = node.attrs
    .map((attr) => (attr.value === '' ? ` ${attr.name}` : ` ${attr.name}="${attr.value}"`))
    .join('')
  const open = `<${node.tag}${attrs}>`
  if (!node.children.length) return `${indent}${open}</${node.tag}>`
  if (node.children.every((child) => child.type === 'text')) {
    return `${indent}${open}${node.children.map((child) => `"${child.text}"`).join('')}</${node.tag}>`
  }
  const inner = node.children.map((child) => renderPretty(child, `${indent}  `)).join('\n')
  return `${indent}${open}\n${inner}\n${indent}</${node.tag}>`
}

/** 标准 LCS，返回匹配下标对 */
function lcsPairs(aKeys, bKeys) {
  const n = aKeys.length
  const m = bKeys.length
  if (n === 0 || m === 0) return []
  const width = m + 1
  const dp = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        aKeys[i] === bKeys[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1])
    }
  }
  const pairs = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (aKeys[i] === bKeys[j]) {
      pairs.push([i, j])
      i++
      j++
      continue
    }
    if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) i++
    else j++
  }
  return pairs
}

/**
 * 身份签名：给「靠某个属性确定身份的标签」加一层键，避免同名标签被按下标
 * 强配。典型受害者是 <head> 里 30 个 <meta>——不区分身份时，删掉
 * http-equiv 那条会让后面每一条都错位成「属性变了」。
 */
const IDENTITY_ATTRS = {
  meta: ['name', 'property', 'http-equiv', 'charset', 'itemprop'],
  link: ['rel'],
  input: ['type', 'name'],
  source: ['type'],
}

function identitySignature(node) {
  if (node.type !== 'element') return null
  const candidates = IDENTITY_ATTRS[node.tag]
  if (!candidates) return null
  const parts = []
  for (const name of candidates) {
    const value = attrValue(node, name)
    if (value !== undefined) parts.push(`${name}=${value}`)
  }
  return parts.length ? `${node.tag}[${parts.join(',')}]` : null
}

/**
 * 多级对齐，返回按顺序排列的 slot：
 *   { kind:'pair', ai, bi } | { kind:'gap', aStart, aEnd, bStart, bEnd }
 *
 * 级别从强到弱，每一级只在上一级剩下的 gap 里做 LCS：
 *   1. tag#id           —— id 是唯一身份，先配对
 *   2. tag[key=value]   —— meta/link/input 这类按名字属性配，<head> 里 30 个
 *                          <meta> 不会因为删掉一条就整体错位
 *   3. tag.classes      —— 无 id 的节点按 class 集合认身份（重复卡片）
 *   4. tag              —— 剩下的按标签名配（class 改一个 → attr-changed）
 *                         有 id 的节点不参与这一级：id 不同就是不同元素
 * 签名返回 null 表示「这一级认不出这个节点」，不会参与本级的配对。
 */
function alignChildren(aKids, bKids) {
  let slots = [{ kind: 'gap', aStart: 0, aEnd: aKids.length, bStart: 0, bEnd: bKids.length }]
  for (const level of [idSignature, identitySignature, classSignature, tagSignature]) {
    const next = []
    for (const slot of slots) {
      if (slot.kind === 'pair') {
        next.push(slot)
        continue
      }
      const { aStart, aEnd, bStart, bEnd } = slot
      const aKeys = []
      const bKeys = []
      // null 键用不可能相等的哨兵，保证「只有两边都有身份时才可能配对」
      for (let i = aStart; i < aEnd; i++) aKeys.push(level(aKids[i]) ?? `\u0000a${i}`)
      for (let j = bStart; j < bEnd; j++) bKeys.push(level(bKids[j]) ?? `\u0000b${j}`)

      let ai = aStart
      let bi = bStart
      for (const [pa, pb] of lcsPairs(aKeys, bKeys)) {
        const absA = aStart + pa
        const absB = bStart + pb
        if (absA > ai || absB > bi) {
          next.push({ kind: 'gap', aStart: ai, aEnd: absA, bStart: bi, bEnd: absB })
        }
        next.push({ kind: 'pair', ai: absA, bi: absB })
        ai = absA + 1
        bi = absB + 1
      }
      if (ai < aEnd || bi < bEnd) {
        next.push({ kind: 'gap', aStart: ai, aEnd, bStart: bi, bEnd })
      }
    }
    slots = next
  }
  return slots
}

/** 子节点路径段：元素 tag#id[序号]，文本 text()[序号]，doctype !doctype */
function segmentsFor(nodes) {
  const tagCount = new Map()
  let textCount = 0
  for (const node of nodes) {
    if (node.type === 'element') tagCount.set(node.tag, (tagCount.get(node.tag) ?? 0) + 1)
    if (node.type === 'text') textCount++
  }
  const seen = new Map()
  let textSeen = 0
  return nodes.map((node) => {
    if (node.type === 'text') {
      textSeen++
      return textCount > 1 ? `text()[${textSeen}]` : 'text()'
    }
    if (node.type === 'doctype') return '!doctype'
    const index = (seen.get(node.tag) ?? 0) + 1
    seen.set(node.tag, index)
    const id = attrValue(node, 'id')
    const idPart = id ? `#${id}` : ''
    const indexPart = (tagCount.get(node.tag) ?? 0) > 1 ? `[${index}]` : ''
    return `${node.tag}${idPart}${indexPart}`
  })
}

function joinPath(parentPath, segment) {
  return parentPath === '/' ? `/${segment}` : `${parentPath}/${segment}`
}

/**
 * 递归 diff。ctx: { diffs, maxDiffs, truncated, missingNodes, unexpectedNodes }
 */
function walkDiff(aNodes, bNodes, aParentPath, bParentPath, ctx) {
  const aSegments = segmentsFor(aNodes)
  const bSegments = segmentsFor(bNodes)

  for (const slot of alignChildren(aNodes, bNodes)) {
    if (ctx.truncated) return

    // —— 整棵子树只在一边：报一条，但把「子树节点数」累加进缺口统计 ——
    if (slot.kind === 'gap') {
      for (let i = slot.aStart; i < slot.aEnd; i++) {
        const node = aNodes[i]
        const weight = countNodes(node)
        ctx.missingNodes += weight
        pushDiff(ctx, {
          kind: 'node-missing',
          path: joinPath(aParentPath, aSegments[i]),
          expected: `${serialize(node)}（子树 ${weight} 节点）`,
          actual: '（不存在）',
          weight,
        })
      }
      for (let j = slot.bStart; j < slot.bEnd; j++) {
        const node = bNodes[j]
        const weight = countNodes(node)
        ctx.unexpectedNodes += weight
        pushDiff(ctx, {
          kind: 'node-unexpected',
          path: joinPath(bParentPath, bSegments[j]),
          expected: '（不存在）',
          actual: `${serialize(node)}（子树 ${weight} 节点）`,
          weight,
        })
      }
      continue
    }

    const aNode = aNodes[slot.ai]
    const bNode = bNodes[slot.bi]
    const nodePath = joinPath(aParentPath, aSegments[slot.ai])

    // 文本 / doctype
    if (aNode.type === 'text' || bNode.type === 'text') {
      const aText = aNode.text ?? ''
      const bText = bNode.text ?? ''
      // N20：剥掉上游未渲染的脚注标记再比文本
      const stripFootnote = (value) => value.replace(/\[\^[^\]]+\]/g, '')
      const aCmp = stripFootnote(aText)
      const bCmp = stripFootnote(bText)
      if (aCmp !== bCmp) {
        // N19：中文文本里的空白差异不算语义差异。上游 tag 插件在容器边界不换行，
        // 我们的 HTML 会带一个缩进换行，折叠后仍会多一个空格（如「note 系列 默认」）。
        // 只在两侧都含 CJK 且去掉全部空白后相等时放行，英文单词间的空格仍然真比。
        const cjk = /[\u4e00-\u9fa5]/
        if (
          (cjk.test(aCmp) || cjk.test(bCmp)) &&
          aCmp.replace(/\s+/g, '') === bCmp.replace(/\s+/g, '')
        ) {
          continue
        }
        pushDiff(ctx, {
          kind: 'text',
          path: nodePath,
          expected: `"${snippet(aCmp)}"`,
          actual: `"${snippet(bCmp)}"`,
        })
      }
      continue
    }
    if (aNode.type === 'doctype' || bNode.type === 'doctype') {
      if (aNode.name !== bNode.name) {
        pushDiff(ctx, { kind: 'doctype', path: nodePath, expected: `<!DOCTYPE ${aNode.name}>`, actual: `<!DOCTYPE ${bNode.name}>` })
      }
      continue
    }

    // 标签本身（两级对齐理论上不会走到这里，签名不同时仍兜底）
    if (aNode.tag !== bNode.tag) {
      pushDiff(ctx, { kind: 'tag-changed', path: nodePath, expected: `<${aNode.tag}>`, actual: `<${bNode.tag}>` })
      continue
    }

    // 属性
    const aAttrs = new Map(aNode.attrs.map((attr) => [attr.name, attr.value]))
    const bAttrs = new Map(bNode.attrs.map((attr) => [attr.name, attr.value]))
    for (const [name, value] of aAttrs) {
      if (!bAttrs.has(name)) {
        pushDiff(ctx, { kind: 'attr-missing', path: nodePath, expected: formatAttr(name, value), actual: '（不存在）' })
      } else if (!equivalentAttrValue(name, value, bAttrs.get(name))) {
        pushDiff(ctx, { kind: 'attr-changed', path: nodePath, expected: formatAttr(name, value), actual: formatAttr(name, bAttrs.get(name)) })
      }
    }
    for (const [name, value] of bAttrs) {
      if (!aAttrs.has(name)) {
        pushDiff(ctx, { kind: 'attr-unexpected', path: nodePath, expected: '（不存在）', actual: formatAttr(name, value) })
      }
    }

    // script/style 内容：折叠换行缩进后真比，只报一条，避免刷屏
    const isContentHolder = aNode.tag === 'script' || aNode.tag === 'style'
    if (isContentHolder) {
      const aText = aNode.children.filter((child) => child.type === 'text').map((child) => child.text).join('')
      const bText = bNode.children.filter((child) => child.type === 'text').map((child) => child.text).join('')
      const aNorm = normalizeScriptBody(aText)
      const bNorm = normalizeScriptBody(bText)
      if (aNorm !== bNorm) {
        pushDiff(ctx, {
          kind: 'content',
          path: nodePath,
          expected: `「${snippet(aNorm)}」（${aNorm.length} 字符）`,
          actual: `「${snippet(bNorm)}」（${bNorm.length} 字符）`,
        })
      }
      // 内容已整体比对过，子节点不再单独报
      continue
    }

    // 递归
    walkDiff(
      aNode.children,
      bNode.children,
      nodePath,
      joinPath(bParentPath, bSegments[slot.bi]),
      ctx,
    )
  }
}

/** script/style 内容归一化：换行 + 缩进折叠成单个空格；行内空格保留 */
function normalizeScriptBody(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]*\n[\s]*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function formatAttr(name, value) {
  return value === '' ? name : `${name}="${snippet(value)}"`
}

function pushDiff(ctx, diff) {
  if (ctx.maxDiffs > 0 && ctx.diffs.length >= ctx.maxDiffs) {
    ctx.truncated = true
    return
  }
  ctx.diffs.push(diff)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. 单页比对
// ═══════════════════════════════════════════════════════════════════════════

function readHtml(file) {
  const text = readFileSync(file, 'utf8')
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function comparePages({ baselinePath, distPath, label, maxDiffs = 20000, dumpNormalized = null }) {
  const report = {
    path: label,
    baselineFile: baselinePath ? rel(baselinePath) : null,
    distFile: distPath ? rel(distPath) : null,
    status: 'PASS',
    diffs: [],
    counts: {},
    truncated: false,
    diagnostics: { baseline: null, dist: null },
  }

  if (!baselinePath || !existsSync(baselinePath)) {
    report.status = 'FAIL'
    report.diffs.push({
      kind: 'file-missing',
      category: '文件',
      path: '(baseline)',
      expected: baselinePath ? rel(baselinePath) : '（未提供 baseline 路径）',
      actual: '（不存在）',
    })
    return finishReport(report)
  }

  if (!distPath || !existsSync(distPath)) {
    report.status = 'FAIL'
    report.diffs.push({
      kind: 'file-missing',
      category: '文件',
      path: '(dist)',
      expected: distPath ? rel(distPath) : '（未提供 dist 路径）',
      actual: '（不存在，先跑 pnpm --filter blog build）',
    })
    return finishReport(report)
  }

  const baselineStats = { comments: 0, warnings: [] }
  const distStats = { comments: 0, warnings: [] }
  const baselineRaw = parseHtml(readHtml(baselinePath), baselineStats)
  const distRaw = parseHtml(readHtml(distPath), distStats)
  stripUnrenderedHeadingArtifacts(baselineRaw, distRaw)
  const baseline = normalizeTree(baselineRaw, baselineStats)
  const dist = normalizeTree(distRaw, distStats)

  if (dumpNormalized) {
    const dir = path.dirname(dumpNormalized)
    if (!existsSync(dir)) throw new Error(`--dump-normalized 目录不存在：${dir}`)
    const base = path.basename(dumpNormalized).replace(/\.html?$/i, '')
    writeFileSync(path.join(dir, `${base}.baseline.html`), renderPretty(baseline.root), 'utf8')
    writeFileSync(path.join(dir, `${base}.dist.html`), renderPretty(dist.root), 'utf8')
  }

  const ctx = { diffs: [], maxDiffs, truncated: false, missingNodes: 0, unexpectedNodes: 0 }
  walkDiff(baseline.root.children, dist.root.children, '/', '/', ctx)

  report.diffs = ctx.diffs
  report.truncated = ctx.truncated
  report.missingNodes = ctx.missingNodes
  report.unexpectedNodes = ctx.unexpectedNodes
  report.diagnostics = {
    baseline: describeDiagnostics(baselineStats, baseline.ctx, baseline.root),
    dist: describeDiagnostics(distStats, dist.ctx, dist.root),
  }
  return finishReport(report)
}

function describeDiagnostics(stats, ctx, root) {
  return {
    nodes: countNodes({ type: 'element', tag: '#root', attrs: [], children: root.children }),
    commentsDropped: stats.comments,
    astroAttrsDropped: ctx.droppedAstroAttrs,
    astroElementsDropped: ctx.droppedAstroElements,
    siteOrigins: [...ctx.siteOrigins],
    originsReplaced: ctx.originsReplaced,
    warnings: dedupeWarnings(stats.warnings),
  }
}

/** 同样的警告只留一条，后面标出现次数 */
function dedupeWarnings(warnings) {
  const counts = new Map()
  for (const warning of warnings) counts.set(warning, (counts.get(warning) ?? 0) + 1)
  return [...counts.entries()].map(([warning, count]) => (count > 1 ? `${warning} ×${count}` : warning))
}

function finishReport(report) {
  const counts = new Map()
  for (const diff of report.diffs) {
    const category = CATEGORY[diff.kind] ?? '其它'
    diff.category = category
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  report.counts = Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]))
  report.diffCount = report.diffs.length
  report.missingNodes = report.missingNodes ?? 0
  report.unexpectedNodes = report.unexpectedNodes ?? 0
  report.status = report.diffCount === 0 && !report.truncated ? 'PASS' : 'FAIL'
  return report
}

function countsLine(report) {
  const parts = Object.entries(report.counts).map(([category, count]) => `${category} ${count}`)
  const gaps = []
  if (report.missingNodes) gaps.push(`缺 ${report.missingNodes} 节点`)
  if (report.unexpectedNodes) gaps.push(`多 ${report.unexpectedNodes} 节点`)
  const suffix = report.truncated ? '（已截断）' : ''
  const head = parts.length ? `${report.diffCount} 条差异（${parts.join(' / ')}）` : '0 条差异'
  return `${head}${gaps.length ? `，缺口 ${gaps.join('，')}` : ''}${suffix}`
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. 输出
// ═══════════════════════════════════════════════════════════════════════════

/** 没有参考产物时 --json 也要吐出合法 JSON，CI 才能无脑解析 */
function skipReport(mode, reason) {
  return { mode, ok: true, skipped: true, reason }
}

function printPageReport(report, limit) {
  const mark = report.status === 'PASS' ? 'PASS' : 'FAIL'
  console.log(`${mark} ${report.path}  ${countsLine(report)}`)
  const shown = report.diffs.slice(0, limit)
  shown.forEach((diff, index) => {
    console.log(`  ${String(index + 1).padStart(3)}. [${diff.category}/${diff.kind}] ${diff.path}`)
    console.log(`       期望: ${diff.expected}`)
    console.log(`       实际: ${diff.actual}`)
  })
  if (report.diffCount > shown.length) {
    console.log(`  … 还有 ${report.diffCount - shown.length} 条差异未显示（--limit 调整）`)
  }
}

function printDiagnostics(report) {
  for (const [side, info] of Object.entries(report.diagnostics)) {
    if (!info) continue
    const parts = [`节点 ${info.nodes}`]
    if (info.commentsDropped) parts.push(`注释 ${info.commentsDropped}`)
    if (info.astroAttrsDropped) parts.push(`data-astro-* 属性 ${info.astroAttrsDropped}`)
    if (info.astroElementsDropped) parts.push(`Astro 机制元素 ${info.astroElementsDropped}`)
    if (info.siteOrigins.length) parts.push(`站内 origin ${info.siteOrigins.join(', ') || '无'}`)
    console.log(`  · ${side}: ${parts.join('，')}`)
    for (const warning of info.warnings) console.log(`  · ${side} 警告: ${warning}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. CLI
// ═══════════════════════════════════════════════════════════════════════════

const USAGE = `用法：
  node scripts/diff-html.mjs <baselineHtmlPath> <distHtmlPath> [选项]
  node scripts/diff-html.mjs --all [选项]

选项：
  --all                    按 docs/baseline.json 的 pages 列表批量比对
  --json                   输出机器可读 JSON（CI 用）
  --limit <n>              FAIL 时每页最多打印多少条差异（默认 20）
  --max-diffs <n>          单页最多收集多少条差异，0 表示不限（默认 20000）
  --filter <substr>        --all 时只比路径包含该子串的页面
  --verbose                打印归一化诊断（节点数、丢弃的注释/属性、警告）
  --dump-normalized <file> 把两侧归一化后的树写到 <file>.{baseline,dist}.html
  -h, --help               显示本帮助

环境变量：
  BASELINE_HTML_DIR  baseline 根目录，默认 .baseline-work/public
  DIST_DIR           dist 根目录，默认 examples/blog/dist
  BASELINE_PATH      baseline.json 路径，默认 docs/baseline.json

退出码：全部 PASS → 0；有 FAIL → 1；baseline 不存在 → 0（CI 无参考产物不红）
`

function parseArgv(argv) {
  const options = {
    mode: 'pair',
    json: false,
    limit: 20,
    maxDiffs: 20000,
    filter: null,
    verbose: false,
    dumpNormalized: null,
    positional: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--all':
        options.mode = 'all'
        break
      case '--json':
        options.json = true
        break
      case '--verbose':
        options.verbose = true
        break
      case '--limit':
        options.limit = Number(argv[++i])
        break
      case '--max-diffs':
        options.maxDiffs = Number(argv[++i])
        break
      case '--filter':
        options.filter = argv[++i]
        break
      case '--dump-normalized':
        options.dumpNormalized = path.resolve(argv[++i])
        break
      case '-h':
      case '--help':
        options.help = true
        break
      default:
        if (arg.startsWith('-')) throw new Error(`未知选项：${arg}`)
        options.positional.push(arg)
    }
  }
  if (!Number.isFinite(options.limit) || options.limit < 0) throw new Error('--limit 必须是非负整数')
  if (!Number.isFinite(options.maxDiffs) || options.maxDiffs < 0) throw new Error('--max-diffs 必须是非负整数')
  return options
}

/** 把 baseline.json 的 URL path 映射成 baseline 根目录里的文件路径 */
function pagePathToFile(rootDir, urlPath) {
  const clean = urlPath.split(/[?#]/)[0]
  if (clean.endsWith('/')) return path.join(rootDir, clean.slice(1), 'index.html')
  return path.join(rootDir, clean.startsWith('/') ? clean.slice(1) : clean)
}

function loadBaselinePages() {
  if (!existsSync(BASELINE_JSON)) return null
  try {
    const json = JSON.parse(readFileSync(BASELINE_JSON, 'utf8'))
    if (!Array.isArray(json?.pages)) return null
    return json.pages
      .map((page) => (typeof page === 'string' ? page : page?.path))
      .filter((page) => typeof page === 'string')
  } catch (error) {
    log(`读取 ${rel(BASELINE_JSON)} 失败：${error.message}`)
    return null
  }
}

function runAll(options) {
  if (!existsSync(BASELINE_HTML_DIR) || !statSync(BASELINE_HTML_DIR).isDirectory()) {
    log(`baseline 目录不存在，跳过比对：${rel(BASELINE_HTML_DIR)}`)
    log('（参考产物不进仓库，属预期情况；本地可用 BASELINE_HTML_DIR 指向 hexo g 的 public 目录）')
    if (options.json) console.log(JSON.stringify(skipReport('all', 'baseline-missing'), null, 2))
    return 0
  }

  const pages = loadBaselinePages()
  if (!pages) {
    log(`未找到可用的页面清单：${rel(BASELINE_JSON)}（缺 pages 数组）`)
    if (options.json) console.log(JSON.stringify(skipReport('all', 'baseline-json-missing'), null, 2))
    return 0
  }

  const selected = options.filter ? pages.filter((page) => page.includes(options.filter)) : pages
  if (!selected.length) {
    log(`没有页面匹配 --filter ${JSON.stringify(options.filter)}`)
    return 0
  }

  if (!options.json) {
    log(`baseline: ${rel(BASELINE_HTML_DIR)}（${selected.length} 页）`)
    log(`dist:     ${rel(DIST_DIR)}`)
    if (!existsSync(DIST_DIR)) log('dist 目录不存在，全部页面都会报失败（先跑 pnpm --filter blog build）')
    console.log('')
  }

  const reports = []
  for (const pagePath of selected) {
    const baselineFile = pagePathToFile(BASELINE_HTML_DIR, pagePath)
    const distFile = pagePathToFile(DIST_DIR, pagePath)
    const report = comparePages({
      baselinePath: baselineFile,
      distPath: distFile,
      label: pagePath,
      maxDiffs: options.maxDiffs,
    })
    reports.push(report)
    if (!options.json) {
      printPageReport(report, options.limit)
      if (options.verbose) printDiagnostics(report)
      console.log('')
    }
  }

  const failures = reports.filter((report) => report.status === 'FAIL')
  const summary = {
    pages: reports.length,
    pass: reports.length - failures.length,
    fail: failures.length,
    diffCount: reports.reduce((total, report) => total + report.diffCount, 0),
    missingNodes: reports.reduce((total, report) => total + report.missingNodes, 0),
    unexpectedNodes: reports.reduce((total, report) => total + report.unexpectedNodes, 0),
    categories: aggregateCategories(reports),
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          mode: 'all',
          ok: summary.fail === 0,
          baselineDir: rel(BASELINE_HTML_DIR),
          distDir: rel(DIST_DIR),
          summary,
          pages: reports,
        },
        null,
        2,
      ),
    )
  } else {
    console.log(
      `汇总：${summary.pages} 页 / PASS ${summary.pass} / FAIL ${summary.fail} / ` +
        `差异共 ${summary.diffCount} 条` +
        (Object.keys(summary.categories).length
          ? `（${Object.entries(summary.categories).map(([category, count]) => `${category} ${count}`).join(' / ')}）`
          : '') +
        `，缺口 缺 ${summary.missingNodes} / 多 ${summary.unexpectedNodes} 节点`,
    )
    if (summary.fail === 0) log('全部页面结构一致')
    else log('有页面结构不一致，见上方明细')
  }

  return summary.fail === 0 ? 0 : 1
}

function aggregateCategories(reports) {
  const totals = new Map()
  for (const report of reports) {
    for (const [category, count] of Object.entries(report.counts)) {
      totals.set(category, (totals.get(category) ?? 0) + count)
    }
  }
  return Object.fromEntries([...totals.entries()].sort((a, b) => b[1] - a[1]))
}

function runPair(options) {
  const [baselineArg, distArg] = options.positional
  if (!baselineArg || !distArg) throw new Error('需要两个文件路径：<baselineHtmlPath> <distHtmlPath>')

  const resolveHtml = (arg) => {
    const absolute = path.resolve(arg)
    if (existsSync(absolute) && statSync(absolute).isDirectory()) return path.join(absolute, 'index.html')
    return absolute
  }

  const baselineFile = resolveHtml(baselineArg)
  const distFile = resolveHtml(distArg)

  if (!existsSync(baselineFile)) {
    log(`baseline 文件不存在，跳过比对：${rel(baselineFile)}`)
    log('（参考产物不进仓库，属预期情况；本地可用 BASELINE_HTML_DIR 或直接传 hexo g 的 public 路径）')
    if (options.json) console.log(JSON.stringify(skipReport('pair', 'baseline-missing'), null, 2))
    return 0
  }

  const report = comparePages({
    baselinePath: baselineFile,
    distPath: distFile,
    label: `${rel(baselineFile)} ↔ ${rel(distFile)}`,
    maxDiffs: options.maxDiffs,
    dumpNormalized: options.dumpNormalized,
  })

  if (options.json) {
    console.log(JSON.stringify({ mode: 'pair', ok: report.status === 'PASS', page: report }, null, 2))
  } else {
    log(`baseline: ${rel(baselineFile)}`)
    log(`dist:     ${rel(distFile)}`)
    printPageReport(report, options.limit)
    if (options.verbose) printDiagnostics(report)
    if (report.status === 'PASS') log('结构一致')
    else log('结构不一致')
  }

  return report.status === 'PASS' ? 0 : 1
}

function main() {
  let options
  try {
    options = parseArgv(process.argv.slice(2))
  } catch (error) {
    console.error(`[diff-html] ${error.message}`)
    console.error(USAGE)
    return 2
  }
  jsonMode = options.json
  if (options.help) {
    console.log(USAGE)
    return 0
  }
  if (options.mode !== 'all' && options.positional.length === 0) {
    console.error(USAGE)
    return 2
  }
  try {
    return options.mode === 'all' ? runAll(options) : runPair(options)
  } catch (error) {
    console.error(`[diff-html] 执行失败：${error.message}`)
    return 1
  }
}

process.exitCode = main()
